import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { businesses, conversations } from "@/db/schema";
import { creditSeconds, MAX_CONVERSATION_SECONDS, meterConversation } from "@/lib/minutes";

const { db } = vi.hoisted(() => ({ db: { transaction: vi.fn() } }));
vi.mock("@/db", () => ({ db }));

type Conversation = {
  id: string; businessId: string; startedAt: Date; durationSeconds: number;
  status: string; endedAt: Date | null;
};
let conversation: Conversation | null;
let secondsBalance: number;
let events: Array<Record<string, unknown>>;
let writes: number;
let failJournal: boolean;
let tail: Promise<unknown>;
const startedAt = new Date("2026-10-14T10:00:00Z");

function adjustment(value: SQL): { amount: number; credit: boolean } {
  const query = new PgDialect().sqlToQuery(value);
  return { amount: Number(query.params[0]), credit: query.sql.includes(" + ") };
}

// Adaptateur transactionnel simulé : vérifie la logique et rollback, mais
// PAS les garanties des verrous du vrai Postgres (test d'intégration requis).
function transactionAdapter() {
  return {
    select() {
      let table: unknown;
      const query = {
        from(t: unknown) { table = t; return query; },
        where() { return query; }, limit() { return query; }, for() { return query; },
        then(resolve: (value: unknown) => void) {
          return Promise.resolve(table === conversations ? (conversation ? [{ ...conversation }] : []) : [{ secondsBalance }]).then(resolve);
        },
      };
      return query;
    },
    update(table: unknown) {
      let patch: Record<string, unknown>;
      const query = {
        set(values: Record<string, unknown>) { patch = values; return query; },
        where() { return query; }, returning() { return query; },
        then(resolve: (value: unknown) => void) {
          writes++;
          if (table === conversations) Object.assign(conversation!, patch);
          if (table === businesses) {
            const { amount, credit } = adjustment(patch.secondsBalance as SQL);
            secondsBalance += credit ? amount : -amount;
          }
          return Promise.resolve([{ secondsBalance }]).then(resolve);
        },
      };
      return query;
    },
    insert() {
      return { values: async (row: Record<string, unknown>) => {
        if (failJournal) throw new Error("journal unavailable");
        writes++;
        events.push(row);
      } };
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(startedAt.getTime() + 10_000));
  conversation = { id: "conv-test", businessId: "business-test", startedAt, durationSeconds: 0, status: "active", endedAt: null };
  secondsBalance = 1000;
  events = [];
  writes = 0;
  failJournal = false;
  tail = Promise.resolve();
  db.transaction.mockImplementation((callback) => {
    const task = tail.then(async () => {
      const snapshot = { conversation: conversation && { ...conversation }, secondsBalance, events: [...events], writes };
      try { return await callback(transactionAdapter()); }
      catch (error) {
        ({ conversation, secondsBalance, events, writes } = snapshot);
        throw error;
      }
    });
    tail = task.catch(() => {});
    return task;
  });
});
afterEach(() => vi.useRealTimers());

describe("compteur de minutes terminal", () => {
  it("débite seulement le delta et ne débite pas deux fois à la même seconde", async () => {
    expect(await meterConversation("conv-test")).toMatchObject({ elapsed: 10, remaining: 990, shouldStop: false });
    await meterConversation("conv-test");
    expect(events).toHaveLength(1);
    expect(events[0].seconds).toBe(10);
    expect(secondsBalance).toBe(990);
  });

  it("ne débite plus après une clôture, même 20 minutes plus tard", async () => {
    await meterConversation("conv-test", { finalize: true });
    const end = conversation!.endedAt;
    const initialWrites = writes;
    vi.setSystemTime(new Date(startedAt.getTime() + 1200_000));
    for (const finalize of [false, true, false]) {
      expect(await meterConversation("conv-test", { finalize })).toEqual({
        elapsed: 10, remaining: 990, shouldStop: true, reason: "terminee",
      });
    }
    expect(writes).toBe(initialWrites);
    expect(events).toHaveLength(1);
    expect(conversation!.endedAt).toBe(end);
    expect(conversation!.durationSeconds).toBe(10);
  });

  it.each(["failed", "ended"])("une conversation %s est immuable même si finalize est demandé", async (status) => {
    conversation!.status = status;
    conversation!.durationSeconds = 7;
    expect(await meterConversation("conv-test", { finalize: true })).toEqual({
      elapsed: 7, remaining: 1000, shouldStop: true, reason: "terminee",
    });
    expect(writes).toBe(0);
  });

  it("une relève et des clôtures sérialisées n'appliquent qu'un débit", async () => {
    const results = await Promise.all([
      meterConversation("conv-test"),
      meterConversation("conv-test", { finalize: true }),
      meterConversation("conv-test", { finalize: true }),
    ]);
    expect(results[1]?.shouldStop).toBe(true);
    expect(results[2]?.shouldStop).toBe(true);
    expect(events).toHaveLength(1);
    expect(secondsBalance).toBe(990);
    expect(conversation!.status).toBe("ended");
  });

  it("clôture un appel de durée nulle sans créer un débit fictif", async () => {
    vi.setSystemTime(startedAt);
    expect(await meterConversation("conv-test", { finalize: true })).toMatchObject({ elapsed: 0, reason: "terminee" });
    expect(conversation!.status).toBe("ended");
    expect(conversation!.endedAt).toEqual(startedAt);
    expect(events).toHaveLength(0);
    expect(secondsBalance).toBe(1000);
  });

  it("clôture sur solde épuisé, même sans nouveau delta", async () => {
    secondsBalance = 0;
    conversation!.durationSeconds = 10;
    expect(await meterConversation("conv-test")).toMatchObject({ reason: "solde_epuise", shouldStop: true });
    expect(conversation!.status).toBe("ended");
    expect(events).toHaveLength(0);
  });

  it("clôture à la durée maximale et reste figé après crédit ultérieur", async () => {
    vi.setSystemTime(new Date(startedAt.getTime() + (MAX_CONVERSATION_SECONDS + 100) * 1000));
    secondsBalance = 3000;
    expect(await meterConversation("conv-test")).toMatchObject({ elapsed: MAX_CONVERSATION_SECONDS, reason: "duree_max" });
    secondsBalance += 1000;
    vi.setSystemTime(new Date(startedAt.getTime() + 4000_000));
    expect(await meterConversation("conv-test")).toMatchObject({ elapsed: MAX_CONVERSATION_SECONDS, shouldStop: true, reason: "terminee" });
    expect(secondsBalance).toBe(2200);
    expect(events).toHaveLength(1);
  });

  it("ne fait pas régresser le compteur si l'horloge recule", async () => {
    await meterConversation("conv-test");
    vi.setSystemTime(new Date(startedAt.getTime() + 5000));
    expect(await meterConversation("conv-test")).toMatchObject({ elapsed: 10, remaining: 990 });
    expect(conversation!.durationSeconds).toBe(10);
    expect(events).toHaveLength(1);
  });

  it("renvoie null pour une conversation inconnue sans écriture", async () => {
    conversation = null;
    expect(await meterConversation("absent")).toBeNull();
    expect(writes).toBe(0);
  });

  it("rollback du solde et de la clôture si le journal échoue", async () => {
    failJournal = true;
    await expect(meterConversation("conv-test", { finalize: true })).rejects.toThrow("journal unavailable");
    expect(secondsBalance).toBe(1000);
    expect(conversation!.status).toBe("active");
    expect(conversation!.durationSeconds).toBe(0);
    expect(conversation!.endedAt).toBeNull();
    expect(events).toHaveLength(0);
  });
});

describe("crédit transactionnel", () => {
  it("crédite le solde et inscrit le crédit au journal dans la même transaction", async () => {
    expect(await creditSeconds("business-test", 120, "test-credit")).toBe(1120);
    expect(events).toEqual([{ businessId: "business-test", seconds: -120, reason: "test-credit" }]);
  });
  it("annule le crédit si son journal ne peut pas être écrit", async () => {
    failJournal = true;
    await expect(creditSeconds("business-test", 120, "test-credit")).rejects.toThrow();
    expect(secondsBalance).toBe(1000);
    expect(events).toHaveLength(0);
  });
});
