import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { profiles, sessions, type Profile } from "@/db/schema";

const scryptAsync = promisify(scrypt);
export const SESSION_COOKIE = "geniusvoice_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${buf.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    const expected = Buffer.from(hash, "hex");
    return buf.length === expected.length && timingSafeEqual(buf, expected);
  } catch {
    return false;
  }
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())))
    .catch(() => {});
  await db.insert(sessions).values({ token, userId, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.token, token)).catch(() => {});
  jar.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

export type SafeProfile = Pick<
  Profile,
  "id" | "email" | "displayName" | "phone" | "status" | "emailVerified" | "preferredLanguage" | "createdAt"
>;

export function toSafeProfile(p: Profile): SafeProfile {
  return {
    id: p.id,
    email: p.email,
    displayName: p.displayName,
    phone: p.phone,
    status: p.status,
    emailVerified: p.emailVerified,
    preferredLanguage: p.preferredLanguage,
    createdAt: p.createdAt,
  };
}

async function userFromToken(token: string | undefined): Promise<SafeProfile | null> {
  if (!token) return null;
  const rows = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
  const sess = rows[0];
  if (!sess || sess.expiresAt.getTime() < Date.now()) return null;
  const users = await db.select().from(profiles).where(eq(profiles.id, sess.userId)).limit(1);
  return users[0] ? toSafeProfile(users[0]) : null;
}

/** Pour les Server Components et Server Actions. */
export async function getSessionUser(): Promise<SafeProfile | null> {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

/** Pour les Route Handlers : lit le cookie brut sur la requête. */
export async function getUserFromRequest(req: Request): Promise<SafeProfile | null> {
  const header = req.headers.get("cookie") ?? "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return userFromToken(match?.[1]);
}
