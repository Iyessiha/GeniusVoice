import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { knowledgeItems } from "@/db/schema";
import { guardOwner } from "@/lib/api-guard";
import { knowledgeData } from "@/lib/queries";
import { str } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 500;

export async function GET(req: Request) {
  const guard = await guardOwner(req);
  if (!guard.ok) return guard.response;
  return Response.json(await knowledgeData(guard.business));
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const guard = await guardOwner(req, body.businessId);
  if (!guard.ok) return guard.response;

  const title = str(body.title);
  const content = str(body.content);
  if (!title || !content) {
    return Response.json({ error: "Un intitulé et une réponse sont requis." }, { status: 400 });
  }

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(knowledgeItems)
    .where(eq(knowledgeItems.businessId, guard.business.id));
  if (Number(total) >= MAX_ITEMS) {
    return Response.json({ error: `Limite de ${MAX_ITEMS} fiches atteinte.` }, { status: 409 });
  }

  const tags = Array.isArray(body.tags)
    ? body.tags.map((t) => str(t)).filter((t): t is string => Boolean(t)).slice(0, 12)
    : [];

  const [item] = await db
    .insert(knowledgeItems)
    .values({
      businessId: guard.business.id,
      title: title.slice(0, 200),
      content: content.slice(0, 4000),
      tags,
      pinned: body.pinned === true,
    })
    .returning();

  return Response.json({ ok: true, item });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const guard = await guardOwner(req, body.businessId);
  if (!guard.ok) return guard.response;

  const id = str(body.id);
  if (!id) return Response.json({ error: "Fiche non précisée." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  const title = str(body.title);
  const content = str(body.content);
  if (title) patch.title = title.slice(0, 200);
  if (content) patch.content = content.slice(0, 4000);
  if (typeof body.pinned === "boolean") patch.pinned = body.pinned;
  if (Array.isArray(body.tags)) {
    patch.tags = body.tags.map((t) => str(t)).filter((t): t is string => Boolean(t)).slice(0, 12);
  }
  if (!Object.keys(patch).length) return Response.json({ error: "Rien à modifier." }, { status: 400 });

  const [item] = await db
    .update(knowledgeItems)
    .set(patch)
    .where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.businessId, guard.business.id)))
    .returning();
  if (!item) return Response.json({ error: "Fiche introuvable." }, { status: 404 });
  return Response.json({ ok: true, item });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const guard = await guardOwner(req, url.searchParams.get("businessId"));
  if (!guard.ok) return guard.response;
  if (!id) return Response.json({ error: "Fiche non précisée." }, { status: 400 });

  const deleted = await db
    .delete(knowledgeItems)
    .where(and(eq(knowledgeItems.id, id), eq(knowledgeItems.businessId, guard.business.id)))
    .returning({ id: knowledgeItems.id });
  if (!deleted.length) return Response.json({ error: "Fiche introuvable." }, { status: 404 });
  return Response.json({ ok: true });
}
