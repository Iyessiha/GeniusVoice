import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, conversations, usageEvents, type Agent, type Business } from "@/db/schema";

/** Marge sous laquelle on refuse d'ouvrir une session : inutile de faire
 *  décrocher un agent pour qu'il soit coupé après dix secondes. */
const MIN_SECONDS_TO_START = 30;

/** Durée maximale d'une conversation, quoi qu'il arrive. Garde-fou contre
 *  un onglet laissé ouvert ou un micro resté branché. */
export const MAX_CONVERSATION_SECONDS = 30 * 60;

export function hasEnoughBalance(business: Business): boolean {
  return business.secondsBalance >= MIN_SECONDS_TO_START;
}

export async function startConversation(opts: {
  business: Business;
  agent: Agent;
  visitorRef: string | null;
  originDomain: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(conversations)
    .values({
      businessId: opts.business.id,
      agentId: opts.agent.id,
      channel: "web",
      status: "active",
      visitorRef: opts.visitorRef,
      originDomain: opts.originDomain,
    })
    .returning({ id: conversations.id });
  return row.id;
}

export type MeterResult = {
  /** Secondes facturées depuis le début de la conversation. */
  elapsed: number;
  /** Solde restant du business après débit. */
  remaining: number;
  /** true = le serveur demande au widget de raccrocher. */
  shouldStop: boolean;
  reason?: "solde_epuise" | "duree_max" | "terminee";
};

/** Relève le compteur d'une conversation en cours.
 *
 *  La durée facturée est TOUJOURS recalculée côté serveur à partir de
 *  `started_at` : un client qui mentirait sur sa durée, qui perdrait le
 *  réseau ou qui fermerait l'onglet sans prévenir ne change rien à la
 *  facture. `duration_seconds` sert de filigrane de ce qui est déjà
 *  débité, ce qui rend l'opération idempotente.
 */
export async function meterConversation(
  conversationId: string,
  opts: { finalize?: boolean } = {}
): Promise<MeterResult | null> {
  return db.transaction(async (tx) => {
    const [conv] = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1)
      .for("update");
    if (!conv) return null;

    const rawElapsed = Math.floor((Date.now() - new Date(conv.startedAt).getTime()) / 1000);
    const elapsed = Math.max(0, Math.min(rawElapsed, MAX_CONVERSATION_SECONDS));
    const delta = elapsed - conv.durationSeconds;

    if (delta > 0) {
      await tx
        .update(conversations)
        .set({ durationSeconds: elapsed })
        .where(eq(conversations.id, conversationId));

      // Le solde peut passer sous zéro : on facture la seconde entamée
      // plutôt que de couper au milieu d'une phrase. Le découvert est
      // borné par l'intervalle de relève (15 s).
      const [biz] = await tx
        .update(businesses)
        .set({ secondsBalance: sql`${businesses.secondsBalance} - ${delta}` })
        .where(eq(businesses.id, conv.businessId))
        .returning({ secondsBalance: businesses.secondsBalance });

      await tx.insert(usageEvents).values({
        businessId: conv.businessId,
        conversationId,
        seconds: delta,
        reason: "voice",
      });

      const remaining = biz?.secondsBalance ?? 0;
      const stopReason =
        opts.finalize ? "terminee" : remaining <= 0 ? "solde_epuise" : rawElapsed >= MAX_CONVERSATION_SECONDS ? "duree_max" : undefined;

      if (opts.finalize || stopReason) {
        await tx
          .update(conversations)
          .set({ status: "ended", endedAt: new Date() })
          .where(and(eq(conversations.id, conversationId), eq(conversations.status, "active")));
      }

      return { elapsed, remaining, shouldStop: Boolean(stopReason), reason: stopReason };
    }

    const [biz] = await tx
      .select({ secondsBalance: businesses.secondsBalance })
      .from(businesses)
      .where(eq(businesses.id, conv.businessId))
      .limit(1);
    const remaining = biz?.secondsBalance ?? 0;

    if (opts.finalize) {
      await tx
        .update(conversations)
        .set({ status: "ended", endedAt: new Date() })
        .where(and(eq(conversations.id, conversationId), eq(conversations.status, "active")));
      return { elapsed, remaining, shouldStop: true, reason: "terminee" };
    }

    const stopReason =
      remaining <= 0 ? "solde_epuise" : rawElapsed >= MAX_CONVERSATION_SECONDS ? "duree_max" : undefined;
    return { elapsed, remaining, shouldStop: Boolean(stopReason), reason: stopReason };
  });
}

/** Crédite des secondes (achat de minutes, geste commercial, essai). */
export async function creditSeconds(
  businessId: string,
  seconds: number,
  reason: string
): Promise<number> {
  const [biz] = await db
    .update(businesses)
    .set({ secondsBalance: sql`${businesses.secondsBalance} + ${seconds}` })
    .where(eq(businesses.id, businessId))
    .returning({ secondsBalance: businesses.secondsBalance });
  await db.insert(usageEvents).values({ businessId, seconds: -seconds, reason });
  return biz?.secondsBalance ?? 0;
}
