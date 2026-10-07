import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, type Business, type Conversation } from "@/db/schema";
import { businessByPublicKey, corsHeaders, domainOf, isOriginAllowed, originOf } from "@/lib/tenant";
import { rateLimit } from "@/lib/rate-limit";
import { str } from "@/lib/utils";

export type WidgetGuard =
  | { ok: true; business: Business; origin: string | null; cors: Record<string, string> }
  | { ok: false; response: Response };

function fail(status: number, error: string, cors: Record<string, string>, code?: string): Response {
  return Response.json({ error, ...(code ? { code } : {}) }, { status, headers: cors });
}

/** Porte d'entrée de toutes les routes appelées par le widget embarqué.
 *
 *  La clé publique identifie le tenant mais n'authentifie personne : elle
 *  est visible dans le HTML du client. Trois choses protègent le compte —
 *  l'origine déclarée, le quota d'appels, et le solde de minutes.
 */
export async function guardWidget(req: Request, publicKeyInput: unknown): Promise<WidgetGuard> {
  const origin = originOf(req);
  const cors = corsHeaders(origin);

  const publicKey = str(publicKeyInput);
  if (!publicKey) return { ok: false, response: fail(400, "Clé publique manquante.", cors) };

  if (!rateLimit(`widget:${publicKey}`, 240, 60_000)) {
    return { ok: false, response: fail(429, "Trop de requêtes.", cors, "RATE_LIMITED") };
  }

  const business = await businessByPublicKey(publicKey);
  if (!business) return { ok: false, response: fail(404, "Agent introuvable.", cors, "UNKNOWN_KEY") };

  if (business.status !== "active") {
    return { ok: false, response: fail(403, "Agent désactivé.", cors, "SUSPENDED") };
  }

  if (!isOriginAllowed(business, origin)) {
    console.warn(`[widget] origine refusée pour ${business.slug} : ${origin}`);
    return {
      ok: false,
      response: fail(
        403,
        "Ce domaine n'est pas autorisé à utiliser cet agent. Ajoutez-le dans les réglages du widget.",
        cors,
        "ORIGIN_NOT_ALLOWED"
      ),
    };
  }

  return { ok: true, business, origin, cors };
}

/** Récupère une conversation en vérifiant qu'elle appartient bien au
 *  tenant : sans ce contrôle, une clé publique permettrait d'écrire dans
 *  les conversations d'un autre business. */
export async function conversationOf(
  business: Business,
  conversationId: unknown
): Promise<Conversation | null> {
  const id = str(conversationId);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.businessId, business.id)))
    .limit(1);
  return rows[0] ?? null;
}

/** Réponse au préflight CORS. L'origine n'est pas encore validée ici : on
 *  la reflète, le vrai contrôle a lieu sur la requête réelle. */
export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(originOf(req)) });
}

export { domainOf };
