import { db } from "@/db";
import { messages } from "@/db/schema";
import { conversationOf, guardWidget, preflight } from "@/lib/widget-auth";
import { str } from "@/lib/utils";

export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return preflight(req);
}

/** Enregistre une réplique de la conversation.
 *
 *  Le transcript vient du navigateur : il sert à l'historique et à
 *  l'analyse, jamais à une décision métier. Les actions réelles passent
 *  toutes par /api/realtime/tool, exécuté serveur.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const guard = await guardWidget(req, body.publicKey);
  if (!guard.ok) return guard.response;
  const { business, cors } = guard;

  const conversation = await conversationOf(business, body.conversationId);
  if (!conversation) {
    return Response.json({ error: "Conversation introuvable." }, { status: 404, headers: cors });
  }

  const role = str(body.role);
  const content = str(body.content);
  if (!role || !["user", "assistant"].includes(role) || !content) {
    return Response.json({ error: "Réplique invalide." }, { status: 400, headers: cors });
  }

  await db.insert(messages).values({
    conversationId: conversation.id,
    role,
    content: content.slice(0, 4000),
  });

  return Response.json({ ok: true }, { headers: cors });
}
