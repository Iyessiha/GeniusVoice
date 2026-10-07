import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { guardOwner } from "@/lib/api-guard";
import { agentsData, AGENT_ROLES } from "@/lib/queries";
import { planAgentLimit } from "@/lib/plan-config";
import { isVoice, REALTIME_VOICES } from "@/lib/realtime";
import { TOOL_DEFS } from "@/lib/tools";
import { str } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ROLES: readonly string[] = AGENT_ROLES;

export async function GET(req: Request) {
  const guard = await guardOwner(req);
  if (!guard.ok) return guard.response;
  return Response.json(await agentsData(guard.business));
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const guard = await guardOwner(req, body.businessId);
  if (!guard.ok) return guard.response;
  const { business } = guard;

  const name = str(body.name);
  if (!name) return Response.json({ error: "Nom de l'agent requis." }, { status: 400 });

  // Le nombre d'agents simultanés est ce que mesure le plan : on le
  // vérifie en base et non d'après ce que dit le client.
  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(agents)
    .where(eq(agents.businessId, business.id));
  const limit = planAgentLimit(business.plan);
  if (Number(existing) >= limit) {
    return Response.json(
      { error: `Votre offre autorise ${limit} agent(s). Passez à une offre supérieure pour en ajouter.`, code: "PLAN_LIMIT" },
      { status: 402 }
    );
  }

  const [agent] = await db
    .insert(agents)
    .values({
      businessId: business.id,
      name: name.slice(0, 60),
      role: ROLES.includes(str(body.role) ?? "") ? (str(body.role) as string) : "receptionniste",
      voice: isVoice(body.voice) ? body.voice : "marin",
      greeting: str(body.greeting)?.slice(0, 400) ?? null,
      instructions: str(body.instructions)?.slice(0, 6000) ?? null,
      transferPhone: str(body.transferPhone)?.slice(0, 40) ?? null,
      isDefault: Number(existing) === 0,
    })
    .returning();

  return Response.json({ ok: true, agent });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const guard = await guardOwner(req, body.businessId);
  if (!guard.ok) return guard.response;
  const { business } = guard;

  const id = str(body.id);
  if (!id) return Response.json({ error: "Agent non précisé." }, { status: 400 });

  const [existing] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.businessId, business.id)))
    .limit(1);
  if (!existing) return Response.json({ error: "Agent introuvable." }, { status: 404 });

  const patch: Record<string, unknown> = {};
  const name = str(body.name);
  if (name) patch.name = name.slice(0, 60);
  if (ROLES.includes(str(body.role) ?? "")) patch.role = body.role;
  if (isVoice(body.voice)) patch.voice = body.voice;
  if ("greeting" in body) patch.greeting = str(body.greeting)?.slice(0, 400) ?? null;
  if ("instructions" in body) patch.instructions = str(body.instructions)?.slice(0, 6000) ?? null;
  if ("transferPhone" in body) patch.transferPhone = str(body.transferPhone)?.slice(0, 40) ?? null;
  if (typeof body.active === "boolean") patch.active = body.active;

  if (Array.isArray(body.enabledTools)) {
    const tools = body.enabledTools
      .map((t) => str(t))
      .filter((t): t is string => Boolean(t) && t! in TOOL_DEFS);
    patch.enabledTools = Array.from(new Set(tools));
  }

  if (body.isDefault === true) {
    // Un seul agent par défaut : on retire le drapeau aux autres dans le
    // même mouvement pour ne jamais laisser deux agents candidats.
    await db.update(agents).set({ isDefault: false }).where(eq(agents.businessId, business.id));
    patch.isDefault = true;
  }

  if (!Object.keys(patch).length) return Response.json({ error: "Rien à modifier." }, { status: 400 });

  const [agent] = await db.update(agents).set(patch).where(eq(agents.id, id)).returning();
  return Response.json({ ok: true, agent });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const guard = await guardOwner(req, url.searchParams.get("businessId"));
  if (!guard.ok) return guard.response;
  if (!id) return Response.json({ error: "Agent non précisé." }, { status: 400 });

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(agents)
    .where(eq(agents.businessId, guard.business.id));
  if (Number(total) <= 1) {
    return Response.json({ error: "Gardez au moins un agent actif." }, { status: 409 });
  }

  const deleted = await db
    .delete(agents)
    .where(and(eq(agents.id, id), eq(agents.businessId, guard.business.id)))
    .returning({ id: agents.id, isDefault: agents.isDefault });
  if (!deleted.length) return Response.json({ error: "Agent introuvable." }, { status: 404 });

  // Si on vient de supprimer l'agent par défaut, il faut en désigner un
  // autre, sinon le widget ne trouve plus personne à faire décrocher.
  if (deleted[0].isDefault) {
    const [next] = await db.select().from(agents).where(eq(agents.businessId, guard.business.id)).limit(1);
    if (next) await db.update(agents).set({ isDefault: true }).where(eq(agents.id, next.id));
  }

  return Response.json({ ok: true });
}
