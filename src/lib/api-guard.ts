import type { Business } from "@/db/schema";
import { getUserFromRequest, type SafeProfile } from "@/lib/auth";
import { businessesOf, ownedBusiness } from "@/lib/tenant";
import { str } from "@/lib/utils";

export type OwnerGuard =
  | { ok: true; user: SafeProfile; business: Business }
  | { ok: false; response: Response };

/** Garde des routes du tableau de bord.
 *
 *  Toute route qui lit ou écrit des données d'un tenant passe par ici.
 *  `businessId` vient du client : il est donc systématiquement revérifié
 *  contre le propriétaire. Sans ce contrôle, changer un identifiant dans
 *  la requête suffirait à lire les rendez-vous d'un autre cabinet.
 */
export async function guardOwner(req: Request, businessIdInput?: unknown): Promise<OwnerGuard> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return { ok: false, response: Response.json({ error: "Connectez-vous." }, { status: 401 }) };
  }
  if (user.status === "suspended") {
    return { ok: false, response: Response.json({ error: "Compte suspendu." }, { status: 403 }) };
  }

  const explicit = str(businessIdInput) ?? new URL(req.url).searchParams.get("businessId") ?? undefined;

  if (explicit) {
    const business = await ownedBusiness(user, explicit);
    if (!business) {
      // 404 et non 403 : on ne révèle pas qu'un établissement existe.
      return { ok: false, response: Response.json({ error: "Établissement introuvable." }, { status: 404 }) };
    }
    return { ok: true, user, business };
  }

  // Sans précision, on prend le premier établissement du compte : le cas
  // courant est un propriétaire, un établissement.
  const all = await businessesOf(user.id);
  if (!all.length) {
    return {
      ok: false,
      response: Response.json({ error: "Aucun établissement sur ce compte.", code: "NO_BUSINESS" }, { status: 409 }),
    };
  }
  return { ok: true, user, business: all[0] };
}
