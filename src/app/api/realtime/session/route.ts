import { db } from "@/db";
import { conversations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { guardWidget, preflight, domainOf } from "@/lib/widget-auth";
import { defaultAgent } from "@/lib/tenant";
import { hasEnoughBalance, startConversation, MAX_CONVERSATION_SECONDS } from "@/lib/minutes";
import { mintClientSecret } from "@/lib/realtime";
import { str } from "@/lib/utils";

export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return preflight(req);
}

/** Ouvre une session vocale.
 *
 *  C'est le seul endroit qui touche la clé OpenAI. Le navigateur reçoit un
 *  secret éphémère déjà contraint : un modèle, une voix, un prompt, une
 *  liste d'outils. Même recopié, il ne donne accès à rien d'autre.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const guard = await guardWidget(req, body.publicKey);
  if (!guard.ok) return guard.response;
  const { business, cors, origin } = guard;

  if (!hasEnoughBalance(business)) {
    return Response.json(
      {
        error: "Le crédit de minutes de cet établissement est épuisé.",
        code: "NO_BALANCE",
      },
      { status: 402, headers: cors }
    );
  }

  const agent = await defaultAgent(business.id, str(body.agentId));
  if (!agent) {
    return Response.json(
      { error: "Aucun agent actif pour cet établissement.", code: "NO_AGENT" },
      { status: 409, headers: cors }
    );
  }

  const conversationId = await startConversation({
    business,
    agent,
    visitorRef: str(body.visitorRef)?.slice(0, 64) ?? null,
    originDomain: domainOf(origin),
  });

  try {
    const minted = await mintClientSecret(business, agent);
    return Response.json(
      {
        ok: true,
        clientSecret: minted.clientSecret,
        expiresAt: minted.expiresAt,
        model: minted.model,
        greeting: minted.greeting,
        conversationId,
        agent: { id: agent.id, name: agent.name, voice: agent.voice },
        business: { name: business.name, brandColor: business.brandColor },
        limits: {
          maxSeconds: Math.min(MAX_CONVERSATION_SECONDS, business.secondsBalance),
          heartbeatSeconds: 15,
        },
      },
      { headers: cors }
    );
  } catch (e) {
    // La conversation a été ouverte avant l'appel OpenAI : si le minting
    // échoue, on la referme pour qu'elle ne pollue ni les statistiques ni
    // le compteur de minutes.
    await db
      .update(conversations)
      .set({ status: "failed", endedAt: new Date() })
      .where(eq(conversations.id, conversationId))
      .catch(() => {});
    console.error("[realtime/session]", (e as Error)?.message);
    return Response.json(
      { error: "Impossible de joindre le service vocal. Réessayez dans un instant.", code: "UPSTREAM" },
      { status: 502, headers: cors }
    );
  }
}
