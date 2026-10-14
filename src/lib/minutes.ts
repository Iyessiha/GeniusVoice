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

/** Relève une conversation active sous verrou de ligne.
 * Une conversation terminale est immuable : aucun rejeu, même tardif,
 * ne modifie sa durée, sa fin ou le solde. Le navigateur déclenche encore
 * les relèves : les sessions abandonnées nécessitent une supervision serveur.
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

    const balance = async () => {
      const [business] = await tx
        .select({ secondsBalance: businesses.secondsBalance })
        .from(businesses)
        .where(eq(businesses.id, conv.businessId))
        .limit(1);
      return business?.secondsBalance ?? 0;
    };

    // Important : vérifier le statut AVANT de recalculer la durée.
    if (conv.status !== "active") {
      return {
        elapsed: conv.durationSeconds, remaining: await balance(),
        shouldStop: true, reason: "terminee",
      };
    }

    const now = new Date();
    const rawElapsed = Math.floor((now.getTime() - conv.startedAt.getTime()) / 1000);
    // Même si l'horloge recule, le compteur ne régresse jamais.
    const elapsed = Math.max(conv.durationSeconds, Math.min(Math.max(0, rawElapsed), MAX_CONVERSATION_SECONDS));
    const delta = elapsed - conv.durationSeconds;
    let remaining: number;

    if (delta > 0) {
      const [business] = await tx
        .update(businesses)
        .set({ secondsBalance: sql`${businesses.secondsBalance} - ${delta}` })
        .where(eq(businesses.id, conv.businessId))
        .returning({ secondsBalance: businesses.secondsBalance });
      remaining = business?.secondsBalance ?? 0;
      await tx.insert(usageEvents).values({
        businessId: conv.businessId, conversationId, seconds: delta, reason: "voice",
      });
    } else {
      remaining = await balance();
    }

    // Le découvert n'est pas garanti borné à 15 s : les relèves et les
    // connexions simultanées sont encore gérées par le protocole client.
    const reason = opts.finalize ? "terminee"
      : remaining <= 0 ? "solde_epuise"
      : elapsed >= MAX_CONVERSATION_SECONDS ? "duree_max" : undefined;

    if (delta > 0 || reason) {
      await tx.update(conversations)
        .set({
          durationSeconds: elapsed,
          ...(reason ? { status: "ended", endedAt: now } : {}),
        })
        .where(and(eq(conversations.id, conversationId), eq(conversations.status, "active")));
    }
    return { elapsed, remaining, shouldStop: Boolean(reason), ...(reason ? { reason } : {}) };
  });
}

/** Crédite des secondes (achat de minutes, geste commercial, essai). */
export async function creditSeconds(
  businessId: string,
  seconds: number,
  reason: string
): Promise<number> {
  return db.transaction(async (tx) => {
    const [biz] = await tx
      .update(businesses)
      .set({ secondsBalance: sql`${businesses.secondsBalance} + ${seconds}` })
      .where(eq(businesses.id, businessId))
      .returning({ secondsBalance: businesses.secondsBalance });
    await tx.insert(usageEvents).values({ businessId, seconds: -seconds, reason });
    return biz?.secondsBalance ?? 0;
  });
}
