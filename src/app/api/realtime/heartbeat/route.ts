import { conversationOf, guardWidget, preflight } from "@/lib/widget-auth";
import { meterConversation } from "@/lib/minutes";

export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return preflight(req);
}

/** Relève du compteur pendant l'appel, et clôture à la fin.
 *
 *  Le widget appelle cette route toutes les 15 secondes puis une dernière
 *  fois avec `finalize`. Aucune durée n'est acceptée du client : le serveur
 *  la recalcule depuis `started_at`. Après clôture, la durée ne change plus.
 *  Une fermeture brutale reste best-effort : la supervision des sessions
 *  abandonnées doit être implémentée indépendamment du navigateur.
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

  const finalize = body.finalize === true;
  const result = await meterConversation(conversation.id, { finalize });
  if (!result) {
    return Response.json({ error: "Conversation introuvable." }, { status: 404, headers: cors });
  }

  return Response.json(
    {
      ok: true,
      elapsed: result.elapsed,
      remainingSeconds: Math.max(0, result.remaining),
      shouldStop: result.shouldStop,
      reason: result.reason ?? null,
    },
    { headers: cors }
  );
}
