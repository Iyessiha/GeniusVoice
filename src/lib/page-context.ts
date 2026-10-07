import { redirect } from "next/navigation";
import { getSessionUser, type SafeProfile } from "@/lib/auth";
import { businessesOf } from "@/lib/tenant";
import type { Business } from "@/db/schema";

/** Contexte commun aux pages du tableau de bord : utilisateur connecté et
 *  établissement courant. Redirige plutôt que de rendre une page vide. */
export async function requireBusiness(): Promise<{ user: SafeProfile; business: Business }> {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login");
  const all = await businessesOf(user.id);
  if (!all.length) redirect("/dashboard");
  return { user, business: all[0] };
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}
