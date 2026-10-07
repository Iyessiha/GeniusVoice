import { and, asc, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  appointments,
  businessHours,
  conversations,
  invoices,
  businesses,
  knowledgeItems,
  leads,
  messages,
  services,
  type Business,
} from "@/db/schema";
import { PLANS, planAgentLimit, TOPUPS } from "@/lib/plan-config";
import { REALTIME_VOICES } from "@/lib/realtime";
import { TOOL_DEFS } from "@/lib/tools";
import { formatInZone } from "@/lib/timezone";

/* Lectures du tableau de bord.
 *
 * Un seul endroit pour chaque requête : les pages s'en servent pour le
 * rendu initial côté serveur, les routes GET pour les rafraîchissements
 * après modification. Rien n'est écrit en double, donc rien ne peut
 * diverger entre les deux chemins.
 */

export const AGENT_ROLES = ["receptionniste", "commercial", "support"] as const;
export const APPOINTMENT_STATUSES = ["pending", "confirmed", "cancelled", "completed", "no_show"] as const;
export const LEAD_STATUSES = ["nouveau", "contacte", "qualifie", "gagne", "perdu"] as const;

/* ─────────────────────────── Vue d'ensemble ─────────────────────────── */

export async function overviewData(business: Business, days = 30) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const now = new Date();
  const scope = and(eq(conversations.businessId, business.id), gte(conversations.startedAt, since));

  const [[convStats], [apptCount], [leadCount], recent, upcoming] = await Promise.all([
    db
      .select({
        total: count(),
        seconds: sql<number>`coalesce(sum(${conversations.durationSeconds}), 0)`,
        rdv: sql<number>`count(*) filter (where ${conversations.outcome} = 'rdv_pris')`,
        transfert: sql<number>`count(*) filter (where ${conversations.outcome} = 'transfert')`,
      })
      .from(conversations)
      .where(scope),
    db
      .select({ value: count() })
      .from(appointments)
      .where(and(eq(appointments.businessId, business.id), gte(appointments.createdAt, since))),
    db
      .select({ value: count() })
      .from(leads)
      .where(and(eq(leads.businessId, business.id), gte(leads.createdAt, since))),
    db
      .select({
        id: conversations.id,
        startedAt: conversations.startedAt,
        durationSeconds: conversations.durationSeconds,
        outcome: conversations.outcome,
      })
      .from(conversations)
      .where(eq(conversations.businessId, business.id))
      .orderBy(desc(conversations.startedAt))
      .limit(6),
    db
      .select({
        id: appointments.id,
        customerName: appointments.customerName,
        scheduledAt: appointments.scheduledAt,
        status: appointments.status,
      })
      .from(appointments)
      .where(and(eq(appointments.businessId, business.id), gte(appointments.scheduledAt, now)))
      .orderBy(asc(appointments.scheduledAt))
      .limit(6),
  ]);

  const totalCalls = Number(convStats?.total ?? 0);
  const rdv = Number(convStats?.rdv ?? 0);

  return {
    totalCalls,
    seconds: Number(convStats?.seconds ?? 0),
    transfers: Number(convStats?.transfert ?? 0),
    appointments: Number(apptCount?.value ?? 0),
    leads: Number(leadCount?.value ?? 0),
    conversionPercent: totalCalls ? Math.round((rdv / totalCalls) * 100) : 0,
    recent: recent.map((c) => ({
      id: c.id,
      label: formatInZone(new Date(c.startedAt), business.timezone),
      durationSeconds: c.durationSeconds,
      outcome: c.outcome,
    })),
    upcoming: upcoming.map((a) => ({
      id: a.id,
      customerName: a.customerName,
      label: formatInZone(new Date(a.scheduledAt), business.timezone),
      status: a.status,
    })),
  };
}

/* ───────────────────────────── Agents ───────────────────────────── */

export async function agentsData(business: Business) {
  const rows = await db.select().from(agents).where(eq(agents.businessId, business.id)).orderBy(agents.createdAt);
  return {
    agents: rows,
    voices: [...REALTIME_VOICES],
    roles: [...AGENT_ROLES],
    tools: Object.values(TOOL_DEFS).map((t) => ({ name: t.name, description: t.description })),
    limit: planAgentLimit(business.plan),
  };
}

/* ─────────────────────── Établissement & horaires ─────────────────────── */

export async function businessData(business: Business, appUrl: string) {
  const hours = await db.select().from(businessHours).where(eq(businessHours.businessId, business.id));
  return {
    business,
    hours: hours.sort((a, b) => a.dayOfWeek - b.dayOfWeek),
    agentLimit: planAgentLimit(business.plan),
    embedSnippet: `<script src="${appUrl}/widget.js" data-key="${business.publicKey}" defer></script>`,
    publicUrl: `${appUrl}/sites/${business.slug}`,
  };
}

export async function servicesData(business: Business) {
  const rows = await db
    .select()
    .from(services)
    .where(eq(services.businessId, business.id))
    .orderBy(services.name);
  return { services: rows };
}

/* ──────────────────────────── Connaissances ──────────────────────────── */

export async function knowledgeData(business: Business) {
  const items = await db
    .select()
    .from(knowledgeItems)
    .where(eq(knowledgeItems.businessId, business.id))
    .orderBy(desc(knowledgeItems.pinned), desc(knowledgeItems.createdAt));
  return { items };
}

/* ─────────────────────────── Conversations ─────────────────────────── */

export async function conversationsData(business: Business, opts: { days?: number; limit?: number } = {}) {
  const days = Math.min(365, Math.max(1, opts.days ?? 90));
  const limit = Math.min(200, Math.max(1, opts.limit ?? 100));
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);

  const rows = await db
    .select({
      id: conversations.id,
      startedAt: conversations.startedAt,
      endedAt: conversations.endedAt,
      durationSeconds: conversations.durationSeconds,
      status: conversations.status,
      outcome: conversations.outcome,
      originDomain: conversations.originDomain,
      agentName: agents.name,
    })
    .from(conversations)
    .leftJoin(agents, eq(agents.id, conversations.agentId))
    .where(and(eq(conversations.businessId, business.id), gte(conversations.startedAt, since)))
    .orderBy(desc(conversations.startedAt))
    .limit(limit);

  return { conversations: rows };
}

export async function conversationDetail(business: Business, id: string) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.businessId, business.id)))
    .limit(1);
  if (!conversation) return null;
  const lines = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(messages.createdAt);
  return { conversation, messages: lines };
}

/* ──────────────────────────── Rendez-vous ──────────────────────────── */

export async function appointmentsData(business: Business, scope: "upcoming" | "all" = "upcoming", limit = 100) {
  const capped = Math.min(200, Math.max(1, limit));
  const base = eq(appointments.businessId, business.id);

  const rows =
    scope === "all"
      ? await db.select().from(appointments).where(base).orderBy(desc(appointments.scheduledAt)).limit(capped)
      : await db
          .select()
          .from(appointments)
          .where(and(base, gte(appointments.scheduledAt, new Date(Date.now() - 3600 * 1000))))
          .orderBy(asc(appointments.scheduledAt))
          .limit(capped);

  const svc = await db.select().from(services).where(eq(services.businessId, business.id));
  const svcName = new Map(svc.map((s) => [s.id, s.name]));

  return {
    appointments: rows.map((a) => ({
      id: a.id,
      customerName: a.customerName,
      customerPhone: a.customerPhone,
      customerEmail: a.customerEmail,
      durationMinutes: a.durationMinutes,
      status: a.status,
      notes: a.notes,
      serviceName: a.serviceId ? svcName.get(a.serviceId) ?? null : null,
      // Le jeton de confirmation ne sort jamais : il vaut signature sur le
      // lien envoyé au client.
      scheduledLabel: formatInZone(new Date(a.scheduledAt), business.timezone),
    })),
    timezone: business.timezone,
  };
}

/* ───────────────────────────── Prospects ───────────────────────────── */

export async function leadsData(business: Business, limit = 100) {
  const rows = await db
    .select()
    .from(leads)
    .where(eq(leads.businessId, business.id))
    .orderBy(desc(leads.createdAt))
    .limit(Math.min(300, Math.max(1, limit)));
  return { leads: rows, statuses: [...LEAD_STATUSES] };
}

/* ──────────────────────────── Facturation ──────────────────────────── */

export async function billingData(business: Business) {
  // Relecture du solde : sur la page de facturation, un paiement vient
  // peut-être d'être appliqué entre le chargement du tenant et ce rendu.
  const [fresh] = await db
    .select({ secondsBalance: businesses.secondsBalance, plan: businesses.plan })
    .from(businesses)
    .where(eq(businesses.id, business.id))
    .limit(1);

  const rows = await db
    .select({
      invoiceNumber: invoices.invoiceNumber,
      plan: invoices.plan,
      seconds: invoices.seconds,
      amount: invoices.amount,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .where(eq(invoices.businessId, business.id))
    .orderBy(desc(invoices.createdAt))
    .limit(24);

  return {
    business: {
      id: business.id,
      plan: fresh?.plan ?? business.plan,
      secondsBalance: fresh?.secondsBalance ?? business.secondsBalance,
    },
    plans: PLANS,
    topups: TOPUPS,
    invoices: rows,
  };
}
