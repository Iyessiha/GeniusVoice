import { createHmac, timingSafeEqual } from "node:crypto";
import { settlePayment, verifyGeniusPayPayment, type SettleResult } from "@/lib/payments";
import { str } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Webhook GeniusPay (mobile money).
 *
 * Quatre règles, dans cet ordre :
 *  1. Signature HMAC obligatoire — secret ou en-tête absent ⇒ 401.
 *  2. Les métadonnées de l'événement ne décident de RIEN : les minutes
 *     créditées sont celles enregistrées dans `payments` au checkout.
 *  3. Le paiement est revérifié auprès de GeniusPay avant tout crédit.
 *  4. Idempotence par verrou de ligne : un rejeu ne crédite pas deux fois.
 */

function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Le schéma de signature GeniusPay n'est pas documenté publiquement : on
 *  accepte HMAC-SHA256 en hex ou base64, sur le corps seul ou préfixé de
 *  l'horodatage, avec fenêtre anti-rejeu de 10 minutes. */
function verifySignature(raw: string, signature: string | null, timestamp: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  if (timestamp) {
    const n = Number(timestamp);
    if (Number.isFinite(n)) {
      const ms = n < 1e12 ? n * 1000 : n;
      if (Math.abs(Date.now() - ms) > 10 * 60 * 1000) return false;
    }
  }
  const provided = signature.trim().replace(/^sha256=/i, "");
  const payloads = [raw, ...(timestamp ? [`${timestamp}.${raw}`, `${timestamp}${raw}`] : [])];
  return payloads.some((p) => {
    const hex = createHmac("sha256", secret).update(p).digest("hex");
    const b64 = createHmac("sha256", secret).update(p).digest("base64");
    return safeEq(hex, provided.toLowerCase()) || safeEq(b64, provided);
  });
}

function respond(result: SettleResult, reference: string) {
  if (result === "unknown" || result === "mismatch") {
    console.error(`[webhook] paiement ignoré (${result}) : ${reference}`);
  }
  // 200 même sur un événement déjà appliqué : inutile de faire rejouer
  // le prestataire.
  return Response.json({ received: true, result });
}

export async function POST(req: Request) {
  const raw = await req.text();

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }

  const signature = req.headers.get("x-geniuspay-signature") || req.headers.get("x-webhook-signature");
  const timestamp = req.headers.get("x-webhook-timestamp");
  if (!signature) return Response.json({ error: "Signature absente" }, { status: 401 });

  const secret = process.env.GENIUSPAY_WEBHOOK_SECRET || "";
  if (!secret) {
    console.error("[webhook] GENIUSPAY_WEBHOOK_SECRET non configuré");
    return Response.json({ error: "Service non configuré" }, { status: 503 });
  }
  if (!verifySignature(raw, signature, timestamp, secret)) {
    console.error("[webhook] signature invalide");
    return Response.json({ error: "Signature invalide" }, { status: 401 });
  }

  const kind = String(event.event || event.type || "");
  if (kind && kind !== "payment.success") return Response.json({ received: true });

  const data = (event.data || event) as Record<string, unknown>;
  const status = String(data.status || event.status || "").toLowerCase();
  if (!["success", "successful", "paid", "completed"].includes(status)) {
    return Response.json({ received: true });
  }

  const providerRef = str(data.reference) || str(event.reference);
  if (!providerRef) return Response.json({ error: "Référence absente" }, { status: 400 });

  const verified = await verifyGeniusPayPayment(providerRef);
  if (!verified?.ourReference) {
    console.error(`[webhook] vérification GeniusPay échouée pour ${providerRef}`);
    // 500 volontaire : on veut que le prestataire rejoue l'événement.
    return Response.json({ error: "vérification échouée" }, { status: 500 });
  }

  try {
    const result = await settlePayment({
      reference: verified.ourReference,
      paidAmount: verified.amount,
      providerTxId: providerRef,
    });
    return respond(result, verified.ourReference);
  } catch (e) {
    console.error("[webhook]", (e as Error)?.message);
    return Response.json({ error: "crédit échoué" }, { status: 500 });
  }
}
