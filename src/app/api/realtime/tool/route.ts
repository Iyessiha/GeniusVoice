import { conversationOf, guardWidget, preflight } from "@/lib/widget-auth";
import { defaultAgent } from "@/lib/tenant";
import { executeTool } from "@/lib/tools";
import { str } from "@/lib/utils";

export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return preflight(req);
}

/** Exécute un outil réclamé par le modèle.
 *
 *  Les outils tournent ici et jamais dans le navigateur : le widget n'est
 *  qu'un relais. C'est ce qui empêche un visiteur de forger une
 *  réservation, de lire la base d'un autre tenant ou d'appeler un outil
 *  désactivé — la vérification se fait sur l'agent en base, pas sur ce que
 *  le client prétend.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const guard = await guardWidget(req, body.publicKey);
  if (!guard.ok) return guard.response;
  const { business, cors } = guard;

  const conversation = await conversationOf(business, body.conversationId);
  if (!conversation) {
    return Response.json({ error: "Conversation introuvable.", code: "NO_CONVERSATION" }, { status: 404, headers: cors });
  }
  if (conversation.status !== "active") {
    return Response.json({ error: "Conversation terminée.", code: "ENDED" }, { status: 409, headers: cors });
  }

  const name = str(body.name);
  if (!name) return Response.json({ error: "Outil non précisé." }, { status: 400, headers: cors });

  const agent = await defaultAgent(business.id, conversation.agentId ?? undefined);
  if (!agent) {
    return Response.json({ error: "Agent introuvable." }, { status: 409, headers: cors });
  }

  let args: Record<string, unknown> = {};
  const raw = body.arguments;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
    } catch {
      // Le modèle a produit du JSON invalide : on le lui dit plutôt que
      // d'échouer silencieusement.
      return Response.json(
        { ok: true, result: { error: "Arguments JSON invalides. Reformule l'appel." } },
        { headers: cors }
      );
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    args = raw as Record<string, unknown>;
  }

  const result = await executeTool({ business, agent, conversationId: conversation.id }, name, args);
  return Response.json({ ok: true, result }, { headers: cors });
}
