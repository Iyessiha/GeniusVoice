import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, businesses, type Agent, type Business } from "@/db/schema";
import type { SafeProfile } from "@/lib/auth";

/* ─────────────────────────── Résolution ─────────────────────────── */

export async function businessByPublicKey(publicKey: string): Promise<Business | null> {
  if (!publicKey || !publicKey.startsWith("gv_")) return null;
  const rows = await db.select().from(businesses).where(eq(businesses.publicKey, publicKey)).limit(1);
  return rows[0] ?? null;
}

export async function businessBySlug(slug: string): Promise<Business | null> {
  const rows = await db.select().from(businesses).where(eq(businesses.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function businessesOf(userId: string): Promise<Business[]> {
  return db.select().from(businesses).where(eq(businesses.ownerId, userId)).orderBy(businesses.createdAt);
}

/** Garde d'appartenance : la seule barrière entre deux tenants. */
export async function ownedBusiness(user: SafeProfile, businessId: string): Promise<Business | null> {
  const rows = await db
    .select()
    .from(businesses)
    .where(and(eq(businesses.id, businessId), eq(businesses.ownerId, user.id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function defaultAgent(businessId: string, agentId?: string): Promise<Agent | null> {
  if (agentId) {
    const rows = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.businessId, businessId), eq(agents.active, true)))
      .limit(1);
    if (rows[0]) return rows[0];
  }
  const rows = await db
    .select()
    .from(agents)
    .where(and(eq(agents.businessId, businessId), eq(agents.active, true)))
    .orderBy(agents.isDefault, agents.createdAt);
  // isDefault d'abord : l'ordre booléen ascendant met false avant true,
  // donc on cherche explicitement.
  return rows.find((a) => a.isDefault) ?? rows[0] ?? null;
}

/* ──────────────── Contrôle d'origine du widget (CORS) ────────────────
 * La clé publique est visible dans le HTML du client : elle n'authentifie
 * rien. Ce qui empêche un tiers de consommer les minutes d'un business,
 * c'est cette liste de domaines. Un business sans domaine déclaré
 * n'accepte que notre propre application (page de démonstration incluse).
 */

function appHost(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").host;
  } catch {
    return null;
  }
}

function hostMatches(host: string, pattern: string): boolean {
  const p = pattern.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!p) return false;
  const h = host.toLowerCase();
  if (p.startsWith("*.")) {
    const base = p.slice(2);
    return h === base || h.endsWith(`.${base}`);
  }
  // On compare sans le port pour tolérer :3000 en développement.
  return h === p || h.split(":")[0] === p.split(":")[0];
}

export function isOriginAllowed(business: Business, origin: string | null): boolean {
  if (!origin) {
    // Requête sans Origin (curl, navigation directe) : pas de CORS en jeu,
    // donc rien à autoriser côté navigateur. On laisse passer : le solde de
    // minutes et la clé publique restent les garde-fous.
    return true;
  }
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const self = appHost();
  if (self && hostMatches(host, self)) return true;
  if (process.env.NODE_ENV !== "production" && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return true;
  return business.allowedDomains.some((d) => hostMatches(host, d));
}

/** En-têtes CORS reflétant une origine déjà validée — jamais `*`. */
export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
  };
  if (origin) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

export function originOf(req: Request): string | null {
  return req.headers.get("origin");
}

export function domainOf(origin: string | null): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}
