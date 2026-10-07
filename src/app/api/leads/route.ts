import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { guardOwner } from "@/lib/api-guard";
import { leadsData, LEAD_STATUSES } from "@/lib/queries";
import { int, str } from "@/lib/utils";

export const dynamic = "force-dynamic";


export async function GET(req: Request) {
  const guard = await guardOwner(req);
  if (!guard.ok) return guard.response;
  const limit = int(new URL(req.url).searchParams.get("limit")) ?? 100;
  return Response.json(await leadsData(guard.business, limit));
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const guard = await guardOwner(req, body.businessId);
  if (!guard.ok) return guard.response;

  const id = str(body.id);
  if (!id) return Response.json({ error: "Prospect non précisé." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  const status = str(body.status);
  if (status) {
    if (!(LEAD_STATUSES as readonly string[]).includes(status)) return Response.json({ error: "Statut inconnu." }, { status: 400 });
    patch.status = status;
  }
  if ("notes" in body) patch.notes = str(body.notes)?.slice(0, 2000) ?? null;
  const score = int(body.score);
  if (score !== undefined) patch.score = Math.max(0, Math.min(100, score));
  if (!Object.keys(patch).length) return Response.json({ error: "Rien à modifier." }, { status: 400 });

  const [lead] = await db
    .update(leads)
    .set(patch)
    .where(and(eq(leads.id, id), eq(leads.businessId, guard.business.id)))
    .returning();
  if (!lead) return Response.json({ error: "Prospect introuvable." }, { status: 404 });
  return Response.json({ ok: true, lead });
}
