import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  appointments,
  businessHours,
  conversations,
  knowledgeItems,
  leads,
  services,
  type Agent,
  type Business,
} from "@/db/schema";
import { int, newToken, str } from "@/lib/utils";
import { formatInZone, minutesInZone, weekdayOfDate, zonedToUtc } from "@/lib/timezone";

/* ───────────────────────── Définitions ─────────────────────────
 * Format attendu par l'API Realtime : { type, name, description,
 * parameters } — pas l'enveloppe { type:"function", function:{…} } de
 * l'API Chat Completions.
 */

export type ToolDef = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export const TOOL_DEFS: Record<string, ToolDef> = {
  lookup_knowledge: {
    type: "function",
    name: "lookup_knowledge",
    description:
      "Cherche une réponse dans la base de connaissances de l'établissement (tarifs, procédures, conditions, détails pratiques). À utiliser dès que le client pose une question factuelle à laquelle tes consignes ne répondent pas explicitement. Ne jamais inventer une information de ce type.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "La question du client, reformulée en mots-clés." },
      },
      required: ["query"],
    },
  },

  list_services: {
    type: "function",
    name: "list_services",
    description:
      "Liste les prestations réservables avec leur durée et leur tarif. À appeler avant de proposer un rendez-vous si le client n'a pas précisé ce qu'il veut.",
    parameters: { type: "object", properties: {}, required: [] },
  },

  check_availability: {
    type: "function",
    name: "check_availability",
    description:
      "Renvoie les créneaux libres pour une date donnée, en tenant compte des horaires d'ouverture et des rendez-vous déjà pris. Toujours appeler AVANT d'annoncer une disponibilité au client.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date au format AAAA-MM-JJ." },
        duration_minutes: { type: "integer", description: "Durée souhaitée en minutes. 30 par défaut." },
      },
      required: ["date"],
    },
  },

  book_appointment: {
    type: "function",
    name: "book_appointment",
    description:
      "Enregistre un rendez-vous. N'appeler qu'après avoir confirmé oralement avec le client : son nom, son numéro de téléphone, la date et l'heure exactes. Si check_availability n'a pas été appelé pour ce créneau, l'appeler d'abord.",
    parameters: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "Nom complet du client." },
        customer_phone: { type: "string", description: "Numéro de téléphone, tel que dicté." },
        customer_email: { type: "string", description: "Adresse e-mail si le client la donne." },
        datetime: { type: "string", description: "Date et heure du rendez-vous au format ISO 8601, ex. 2026-10-14T09:30." },
        service_name: { type: "string", description: "Nom de la prestation, tel que renvoyé par list_services." },
        notes: { type: "string", description: "Motif ou précision utile au praticien." },
      },
      required: ["customer_name", "customer_phone", "datetime"],
    },
  },

  capture_lead: {
    type: "function",
    name: "capture_lead",
    description:
      "Enregistre un prospect quand le client exprime un besoin commercial sans prendre rendez-vous (demande de devis, de rappel, de visite, de renseignement sur un bien ou un produit). Recueillir au minimum un moyen de le joindre.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        intent: { type: "string", description: "Ce que le prospect veut, dans ses propres mots." },
        qualification: {
          type: "object",
          description: "Réponses de qualification (budget, délai, zone, type de bien…), en paires clé/valeur courtes.",
          additionalProperties: { type: "string" },
        },
        score: {
          type: "integer",
          description: "Qualité du prospect de 0 à 100 : 80+ = prêt à acheter avec budget et délai clairs, 40 = curieux, 10 = hors cible.",
        },
      },
      required: ["intent"],
    },
  },

  transfer_to_human: {
    type: "function",
    name: "transfer_to_human",
    description:
      "À appeler quand la demande dépasse ce que tu peux traiter : urgence médicale, réclamation, litige, demande explicite de parler à une personne, ou question à laquelle tu n'as pas de réponse fiable. Renvoie le numéro à communiquer au client.",
    parameters: {
      type: "object",
      properties: { reason: { type: "string", description: "Pourquoi le transfert est nécessaire." } },
      required: ["reason"],
    },
  },
};

export function toolDefsFor(agent: Agent): ToolDef[] {
  return agent.enabledTools.map((n) => TOOL_DEFS[n]).filter((d): d is ToolDef => Boolean(d));
}

/* ───────────────────────── Exécution ─────────────────────────
 * Les outils tournent sur le serveur, jamais dans le navigateur : le
 * widget relaie l'appel et ne peut donc pas écrire en base directement.
 * Chaque exécuteur reçoit un contexte déjà authentifié par la clé
 * publique + l'origine, et borné à UN business.
 */

export type ToolContext = {
  business: Business;
  agent: Agent;
  conversationId: string;
};

type ToolResult = Record<string, unknown>;

const DAY_NAMES = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function hhmm(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function runLookupKnowledge(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  const query = str(args.query);
  if (!query) return { found: false, message: "Aucune question fournie." };

  // Recherche plein texte française, avec repli sur ILIKE si la requête
  // ne produit aucun lexème exploitable.
  const ranked = await db
    .select({ title: knowledgeItems.title, content: knowledgeItems.content })
    .from(knowledgeItems)
    .where(
      and(
        eq(knowledgeItems.businessId, ctx.business.id),
        sql`to_tsvector('french', ${knowledgeItems.title} || ' ' || ${knowledgeItems.content})
             @@ websearch_to_tsquery('french', ${query})`
      )
    )
    .limit(4);

  let rows = ranked;
  if (!rows.length) {
    rows = await db
      .select({ title: knowledgeItems.title, content: knowledgeItems.content })
      .from(knowledgeItems)
      .where(
        and(
          eq(knowledgeItems.businessId, ctx.business.id),
          sql`(${knowledgeItems.title} ILIKE ${"%" + query + "%"} OR ${knowledgeItems.content} ILIKE ${"%" + query + "%"})`
        )
      )
      .limit(4);
  }

  if (!rows.length) {
    return {
      found: false,
      message:
        "Rien dans la base sur ce point. Dis au client que tu ne veux pas lui donner une information incertaine et propose transfer_to_human.",
    };
  }
  return { found: true, extraits: rows.map((r) => ({ titre: r.title, contenu: r.content })) };
}

async function runListServices(ctx: ToolContext): Promise<ToolResult> {
  const rows = await db
    .select()
    .from(services)
    .where(and(eq(services.businessId, ctx.business.id), eq(services.active, true)));
  if (!rows.length) return { services: [], message: "Aucune prestation au catalogue. Reste sur une prise de rendez-vous générique de 30 minutes." };
  return {
    services: rows.map((s) => ({
      nom: s.name,
      duree_minutes: s.durationMinutes,
      tarif: s.price != null ? `${s.price} ${s.currency}` : "sur devis",
      description: s.description ?? undefined,
    })),
  };
}

async function runCheckAvailability(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  const date = str(args.date);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Date invalide. Demande au client une date claire et rappelle-la au format jour/mois." };
  }
  const duration = int(args.duration_minutes) ?? 30;

  const tz = ctx.business.timezone;
  const dayOfWeek = weekdayOfDate(date);

  const [hours] = await db
    .select()
    .from(businessHours)
    .where(and(eq(businessHours.businessId, ctx.business.id), eq(businessHours.dayOfWeek, dayOfWeek)))
    .limit(1);

  if (!hours || hours.closed) {
    return { date, ouvert: false, message: `L'établissement est fermé le ${DAY_NAMES[dayOfWeek]}. Propose un autre jour.` };
  }

  // Bornes de la journée locale de l'établissement, exprimées en UTC.
  const dayStart = zonedToUtc(`${date}T00:00:00`, tz);
  if (!dayStart) return { error: "Date invalide." };
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const taken = await db
    .select({ scheduledAt: appointments.scheduledAt, durationMinutes: appointments.durationMinutes })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, ctx.business.id),
        gte(appointments.scheduledAt, dayStart),
        lt(appointments.scheduledAt, dayEnd),
        sql`${appointments.status} IN ('pending','confirmed')`
      )
    );

  const busy = taken.map((t) => {
    const start = minutesInZone(new Date(t.scheduledAt), tz);
    return [start, start + t.durationMinutes] as const;
  });

  const open = minutesOf(hours.opensAt);
  const close = minutesOf(hours.closesAt);
  const slots: string[] = [];
  for (let t = open; t + duration <= close; t += 30) {
    const overlaps = busy.some(([s, e]) => t < e && t + duration > s);
    if (!overlaps) slots.push(hhmm(t));
    if (slots.length >= 12) break;
  }

  if (!slots.length) {
    return { date, ouvert: true, creneaux: [], message: "Journée complète. Propose la date suivante." };
  }
  return { date, ouvert: true, horaires: `${hours.opensAt}–${hours.closesAt}`, creneaux: slots };
}

async function runBookAppointment(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  const customerName = str(args.customer_name);
  const customerPhone = str(args.customer_phone);
  const raw = str(args.datetime);
  if (!customerName || !customerPhone || !raw) {
    return { ok: false, error: "Nom, téléphone et date/heure sont tous les trois obligatoires. Redemande ce qui manque." };
  }

  // "2026-10-14T09:30" dicté par l'agent est une heure MURALE de
  // l'établissement : zonedToUtc la convertit, sinon un business hors
  // UTC+0 verrait tous ses rendez-vous décalés.
  const tz = ctx.business.timezone;
  const scheduledAt = zonedToUtc(raw, tz);
  if (!scheduledAt) {
    return { ok: false, error: "Date illisible. Fais répéter le jour et l'heure au client." };
  }
  if (scheduledAt.getTime() < Date.now() - 60_000) {
    return { ok: false, error: "Ce créneau est dans le passé. Propose une date à venir." };
  }

  let serviceId: string | null = null;
  let duration = 30;
  const serviceName = str(args.service_name);
  if (serviceName) {
    const [svc] = await db
      .select()
      .from(services)
      .where(and(eq(services.businessId, ctx.business.id), sql`${services.name} ILIKE ${serviceName}`))
      .limit(1);
    if (svc) {
      serviceId = svc.id;
      duration = svc.durationMinutes;
    }
  }

  // Dernier rempart contre le double-réservation : l'agent a pu annoncer
  // un créneau pris entre-temps par un autre appel simultané.
  const clash = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, ctx.business.id),
        sql`${appointments.status} IN ('pending','confirmed')`,
        sql`tstzrange(${appointments.scheduledAt},
              ${appointments.scheduledAt} + (${appointments.durationMinutes} || ' minutes')::interval)
            && tstzrange(${scheduledAt.toISOString()}::timestamptz,
              ${scheduledAt.toISOString()}::timestamptz + (${duration} || ' minutes')::interval)`
      )
    )
    .limit(1);
  if (clash.length) {
    return { ok: false, error: "Ce créneau vient d'être pris. Rappelle check_availability et propose autre chose." };
  }

  const confirmToken = newToken(16);
  const [row] = await db
    .insert(appointments)
    .values({
      businessId: ctx.business.id,
      conversationId: ctx.conversationId,
      serviceId,
      customerName,
      customerPhone,
      customerEmail: str(args.customer_email) ?? null,
      scheduledAt,
      durationMinutes: duration,
      status: "pending",
      notes: str(args.notes) ?? null,
      confirmToken,
    })
    .returning({ id: appointments.id });

  await db
    .update(conversations)
    .set({ outcome: "rdv_pris" })
    .where(eq(conversations.id, ctx.conversationId))
    .catch(() => {});

  return {
    ok: true,
    reference: row.id.slice(0, 8).toUpperCase(),
    creneau: formatInZone(scheduledAt, tz),
    message:
      "Rendez-vous enregistré. Confirme-le oralement en répétant le jour, l'heure et le nom tels qu'indiqués dans `creneau`.",
  };
}

async function runCaptureLead(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  const intent = str(args.intent);
  if (!intent) return { ok: false, error: "Précise d'abord ce que veut le prospect." };

  const phone = str(args.phone);
  const email = str(args.email);
  if (!phone && !email) {
    return { ok: false, error: "Aucun moyen de rappeler le prospect. Demande son numéro avant d'enregistrer." };
  }

  const q = args.qualification;
  const qualification: Record<string, string> = {};
  if (q && typeof q === "object" && !Array.isArray(q)) {
    for (const [k, v] of Object.entries(q as Record<string, unknown>)) {
      const val = str(v);
      if (val) qualification[k.slice(0, 60)] = val.slice(0, 300);
    }
  }

  const score = Math.max(0, Math.min(100, int(args.score) ?? 50));
  await db.insert(leads).values({
    businessId: ctx.business.id,
    conversationId: ctx.conversationId,
    name: str(args.name) ?? null,
    phone: phone ?? null,
    email: email ?? null,
    intent,
    qualification,
    score,
    status: "nouveau",
  });

  await db
    .update(conversations)
    .set({ outcome: "lead_capture" })
    .where(eq(conversations.id, ctx.conversationId))
    .catch(() => {});

  return { ok: true, message: "Prospect enregistré. Dis au client qu'il sera rappelé et sous quel délai." };
}

async function runTransferToHuman(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
  await db
    .update(conversations)
    .set({ outcome: "transfert", summary: str(args.reason) ?? null })
    .where(eq(conversations.id, ctx.conversationId))
    .catch(() => {});

  const phone = ctx.agent.transferPhone || ctx.business.phone;
  if (!phone) {
    return {
      ok: true,
      message:
        "Aucun numéro de transfert n'est configuré. Excuse-toi, propose de prendre les coordonnées du client via capture_lead pour un rappel.",
    };
  }
  return { ok: true, numero: phone, message: `Communique ce numéro au client, chiffre par chiffre, et propose de le lui répéter.` };
}

const RUNNERS: Record<string, (ctx: ToolContext, args: Record<string, unknown>) => Promise<ToolResult>> = {
  lookup_knowledge: runLookupKnowledge,
  list_services: (ctx) => runListServices(ctx),
  check_availability: runCheckAvailability,
  book_appointment: runBookAppointment,
  capture_lead: runCaptureLead,
  transfer_to_human: runTransferToHuman,
};

export async function executeTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  // Un outil désactivé sur l'agent ne s'exécute pas, même si le modèle
  // l'invente ou si le navigateur le réclame.
  if (!ctx.agent.enabledTools.includes(name)) {
    return { error: `Outil ${name} non disponible pour cet agent.` };
  }
  const runner = RUNNERS[name];
  if (!runner) return { error: `Outil ${name} inconnu.` };
  try {
    return await runner(ctx, args);
  } catch (e) {
    console.error(`[tool:${name}]`, (e as Error)?.message);
    return { error: "Erreur technique. Dis au client que tu n'arrives pas à enregistrer et propose un transfert." };
  }
}
