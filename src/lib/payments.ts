import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, invoices, payments, usageEvents } from "@/db/schema";
import { str } from "@/lib/utils";

const INIT_URL = process.env.GENIUSPAY_INIT_URL || "https://geniuspay.ci/api/v1/merchant/payments";

function invoiceNumber(): string {
  return `GV-${new Date().getFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function geniusPayConfigured(): boolean {
  return Boolean(process.env.GENIUSPAY_API_KEY && process.env.GENIUSPAY_API_SECRET);
}

function authHeaders(): Record<string, string> {
  return {
    "X-API-Key": process.env.GENIUSPAY_API_KEY || "",
    "X-API-Secret": process.env.GENIUSPAY_API_SECRET || "",
  };
}

/* ───────────────────────── Initialisation ───────────────────────── */

export async function initMobilePayment(opts: {
  email: string;
  name: string;
  phone?: string | null;
  amount: number;
  reference: string;
  callbackUrl: string;
  description: string;
  metadata: Record<string, string | number>;
}): Promise<{ paymentUrl: string; providerReference: string }> {
  const res = await fetch(INIT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      amount: opts.amount,
      description: opts.description,
      customer: { name: opts.name, email: opts.email, ...(opts.phone ? { phone: opts.phone } : {}) },
      success_url: opts.callbackUrl,
      error_url: opts.callbackUrl,
      metadata: opts.metadata,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const data = (json.data || {}) as Record<string, unknown>;
  const url = (data.checkout_url || data.payment_url || json.checkout_url || json.payment_url) as string | undefined;
  if (!res.ok || !json.success || !url) {
    throw new Error(`init GeniusPay échouée : ${res.status} ${JSON.stringify(json).slice(0, 250)}`);
  }
  return { paymentUrl: url, providerReference: (data.reference as string) || opts.reference };
}

/* ───────────────────────── Vérification ─────────────────────────
 * Le webhook n'est jamais cru sur parole : on interroge GeniusPay avec
 * nos propres identifiants avant de créditer la moindre minute.
 */

export async function verifyGeniusPayPayment(
  providerReference: string
): Promise<{ status: string; amount: number; ourReference?: string } | null> {
  try {
    const res = await fetch(`${INIT_URL}/${encodeURIComponent(providerReference)}`, {
      method: "GET",
      headers: authHeaders(),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const data = (json.data || {}) as Record<string, unknown>;
    const status = String(data.status || "").toLowerCase();
    if (json.success && ["completed", "success", "successful", "paid"].includes(status)) {
      const md = (data.metadata || {}) as Record<string, unknown>;
      return { status: "success", amount: Number(data.amount) || 0, ourReference: str(md.reference) };
    }
    return null;
  } catch (e) {
    console.error("[geniuspay] vérification échouée :", (e as Error)?.message);
    return null;
  }
}

/* ─────────────────────────── Règlement ───────────────────────────
 * Les minutes ne sont créditées QUE depuis la ligne `payments` créée au
 * checkout : jamais depuis les métadonnées du prestataire, qu'un tiers
 * pourrait forger. Verrou de ligne + transition pending → paid unique :
 * un événement rejoué ne crédite pas deux fois.
 */

export type SettleResult = "credited" | "duplicate" | "unknown" | "mismatch";

export async function settlePayment(input: {
  reference: string;
  paidAmount?: number;
  paidCurrency?: string;
  providerTxId?: string;
}): Promise<SettleResult> {
  const inv = invoiceNumber();

  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.reference, input.reference))
      .limit(1)
      .for("update");

    if (!payment) return "unknown";
    if (payment.status === "paid") return "duplicate";

    if (input.paidAmount !== undefined && Number.isFinite(input.paidAmount) && input.paidAmount < payment.amount) {
      console.error(`[settle] montant insuffisant pour ${payment.reference} : ${input.paidAmount} < ${payment.amount}`);
      return "mismatch";
    }
    if (input.paidCurrency && input.paidCurrency.toUpperCase() !== payment.currency.toUpperCase()) {
      console.error(`[settle] devise inattendue pour ${payment.reference} : ${input.paidCurrency}`);
      return "mismatch";
    }

    const updated = await tx
      .update(payments)
      .set({ status: "paid", paidAt: new Date(), providerTxId: input.providerTxId ?? null })
      .where(and(eq(payments.reference, payment.reference), eq(payments.status, "pending")))
      .returning({ reference: payments.reference });
    if (!updated.length) return "duplicate";

    // Une recharge ajoute des minutes sans toucher à l'offre ; un
    // changement de plan fait les deux.
    const isTopup = payment.plan.startsWith("recharge_");
    await tx
      .update(businesses)
      .set({
        secondsBalance: sql`${businesses.secondsBalance} + ${payment.seconds}`,
        ...(isTopup ? {} : { plan: payment.plan }),
      })
      .where(eq(businesses.id, payment.businessId));

    await tx.insert(usageEvents).values({
      businessId: payment.businessId,
      seconds: -payment.seconds,
      reason: `achat:${payment.plan}`,
    });

    await tx.insert(invoices).values({
      invoiceNumber: inv,
      userId: payment.userId,
      businessId: payment.businessId,
      plan: payment.plan,
      seconds: payment.seconds,
      amount: payment.amount,
      currency: payment.currency,
      provider: payment.provider,
      status: "paid",
    });

    return "credited";
  });
}

/* ──────────────── Confirmation au retour de GeniusPay ────────────────
 * Le webhook reste la voie normale. Cette fonction couvre le cas où le
 * client revient sur le site avant lui. Elle s'appuie sur le même
 * `settlePayment` idempotent : si les deux se croisent, le second
 * n'applique rien.
 */

export type ConfirmOutcome = {
  status: "paid" | "pending" | "unknown";
  message: string;
  secondsBalance?: number;
};

export async function confirmPayment(userId: string, reference: string): Promise<ConfirmOutcome> {
  const [payment] = await db.select().from(payments).where(eq(payments.reference, reference)).limit(1);
  // Un utilisateur ne peut consulter que ses propres paiements.
  if (!payment || payment.userId !== userId) {
    return { status: "unknown", message: "Paiement introuvable." };
  }

  const balance = async () => {
    const [biz] = await db
      .select({ secondsBalance: businesses.secondsBalance })
      .from(businesses)
      .where(eq(businesses.id, payment.businessId))
      .limit(1);
    return biz?.secondsBalance ?? 0;
  };

  if (payment.status === "paid") {
    return {
      status: "paid",
      message: "Paiement confirmé. Vos minutes sont créditées.",
      secondsBalance: await balance(),
    };
  }

  const providerRef = payment.providerTxId || reference;
  const verified = await verifyGeniusPayPayment(providerRef);
  if (!verified) {
    return {
      status: "pending",
      message: "Paiement en cours de validation. Vos minutes apparaîtront d'ici une minute.",
    };
  }

  const result = await settlePayment({
    reference,
    paidAmount: verified.amount,
    providerTxId: providerRef,
  });

  if (result === "credited" || result === "duplicate") {
    return {
      status: "paid",
      message: "Paiement confirmé. Vos minutes sont créditées.",
      secondsBalance: await balance(),
    };
  }
  return {
    status: "pending",
    message: "Paiement reçu mais non appliqué. Notre équipe vérifie — contactez-nous si rien ne bouge.",
  };
}
