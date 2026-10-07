import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { guardOwner } from "@/lib/api-guard";
import { findPlan } from "@/lib/plan-config";
import { geniusPayConfigured, initMobilePayment } from "@/lib/payments";
import { rateLimit } from "@/lib/rate-limit";
import { str } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const guard = await guardOwner(req, body.businessId);
  if (!guard.ok) return guard.response;
  const { user, business } = guard;

  if (!rateLimit(`checkout:${user.id}`, 20, 10 * 60_000)) {
    return Response.json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, { status: 429 });
  }

  const plan = findPlan(str(body.plan));
  if (!plan) return Response.json({ error: "Offre inconnue." }, { status: 400 });
  if (plan.xof <= 0) {
    return Response.json({ error: "Cette offre ne se paie pas : elle est offerte à l'inscription." }, { status: 400 });
  }

  if (!geniusPayConfigured()) {
    console.error("[billing] GENIUSPAY_API_KEY / GENIUSPAY_API_SECRET absents");
    return Response.json(
      { error: "Le paiement est momentanément indisponible.", code: "PAYMENTS_DISABLED" },
      { status: 503 }
    );
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const reference = `gv_mobile_${randomBytes(12).toString("hex")}`;
  const seconds = plan.minutes * 60;

  // La ligne de paiement est écrite AVANT la redirection : le webhook ne
  // créditera que cette référence, pour ce montant, une seule fois. Aucun
  // crédit n'est jamais accordé ici.
  await db.insert(payments).values({
    reference,
    userId: user.id,
    businessId: business.id,
    provider: "mobile",
    plan: plan.id,
    seconds,
    amount: plan.xof,
    currency: "XOF",
    status: "pending",
  });

  try {
    const tx = await initMobilePayment({
      email: user.email,
      name: user.displayName || business.name,
      phone: user.phone ?? business.phone,
      amount: plan.xof,
      reference,
      callbackUrl: `${appUrl}/dashboard/facturation?payment=callback&gvref=${reference}`,
      description: `GeniusVoice — ${plan.label} (${plan.minutes} minutes)`,
      metadata: {
        reference,
        businessId: business.id,
        userId: user.id,
        plan: plan.id,
        seconds,
        amount: plan.xof,
        currency: "XOF",
      },
    });

    await db.update(payments).set({ providerTxId: tx.providerReference }).where(eq(payments.reference, reference));
    return Response.json({ ok: true, paymentUrl: tx.paymentUrl, reference });
  } catch (e) {
    await db.update(payments).set({ status: "failed" }).where(eq(payments.reference, reference));
    console.error("[billing/checkout]", (e as Error)?.message);
    return Response.json({ error: "Échec de l'initialisation du paiement. Réessayez." }, { status: 502 });
  }
}
