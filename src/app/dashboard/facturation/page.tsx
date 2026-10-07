import { requireBusiness } from "@/lib/page-context";
import { billingData } from "@/lib/queries";
import { confirmPayment } from "@/lib/payments";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facturation" };

/** Le retour de GeniusPay est traité ici, côté serveur, avant le rendu :
 *  le client voit immédiatement son solde à jour au lieu d'un solde
 *  périmé suivi d'un rafraîchissement. */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; gvref?: string }>;
}) {
  const { user, business } = await requireBusiness();
  const { payment, gvref } = await searchParams;

  let notice: { kind: "error" | "success"; text: string } | undefined;
  if (payment === "callback" && gvref) {
    const outcome = await confirmPayment(user.id, gvref);
    notice = {
      kind: outcome.status === "paid" ? "success" : "error",
      text: outcome.message,
    };
  }

  // Lu APRÈS la confirmation : le solde affiché inclut l'achat.
  const initial = await billingData(business);

  return <BillingClient initial={initial} notice={notice} />;
}
