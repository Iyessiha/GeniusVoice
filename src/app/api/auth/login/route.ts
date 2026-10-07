import { sql } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { createSession, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { isEmail, str } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnu";
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = str(body.email)?.toLowerCase();
  const password = str(body.password);

  // Deux compteurs : l'un contre le balayage d'adresses depuis une IP,
  // l'autre contre l'attaque ciblée sur un compte connu.
  if (!rateLimit(`login-ip:${ip}`, 25, 10 * 60_000)) {
    return Response.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });
  }
  if (email && !rateLimit(`login-acct:${email}`, 8, 10 * 60_000)) {
    return Response.json({ error: "Trop de tentatives sur ce compte. Réessayez plus tard." }, { status: 429 });
  }

  if (!isEmail(email) || !password) {
    return Response.json({ error: "Identifiants invalides." }, { status: 400 });
  }

  const rows = await db.select().from(profiles).where(sql`lower(${profiles.email}) = ${email}`).limit(1);
  const user = rows[0];

  // Message identique que le compte existe ou non : on ne confirme pas
  // à un attaquant quelles adresses sont inscrites.
  const generic = { error: "Adresse e-mail ou mot de passe incorrect." };
  if (!user) return Response.json(generic, { status: 401 });
  if (!(await verifyPassword(password, user.passwordHash))) return Response.json(generic, { status: 401 });
  if (user.status === "suspended") {
    return Response.json({ error: "Ce compte est suspendu." }, { status: 403 });
  }

  await createSession(user.id);
  return Response.json({ ok: true });
}
