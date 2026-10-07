import { sql } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { createSession, hashPassword } from "@/lib/auth";
import { createBusiness } from "@/lib/onboarding";
import { rateLimit } from "@/lib/rate-limit";
import { isEmail, str } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnu";
  if (!rateLimit(`signup:${ip}`, 8, 10 * 60_000)) {
    return Response.json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = str(body.email)?.toLowerCase();
  const password = str(body.password);
  const businessName = str(body.businessName);
  const industry = str(body.industry) ?? "autre";

  if (!isEmail(email)) return Response.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  if (!password || password.length < 8) {
    return Response.json({ error: "Le mot de passe doit faire au moins 8 caractères." }, { status: 400 });
  }
  if (!businessName) return Response.json({ error: "Indiquez le nom de votre établissement." }, { status: 400 });

  const existing = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(sql`lower(${profiles.email}) = ${email}`)
    .limit(1);
  if (existing.length) {
    return Response.json({ error: "Un compte existe déjà avec cette adresse." }, { status: 409 });
  }

  try {
    const [profile] = await db
      .insert(profiles)
      .values({
        email,
        passwordHash: await hashPassword(password),
        displayName: str(body.displayName) ?? null,
        phone: str(body.phone) ?? null,
      })
      .returning({ id: profiles.id });

    const business = await createBusiness({
      ownerId: profile.id,
      name: businessName,
      industry,
      phone: str(body.phone) ?? null,
    });

    await createSession(profile.id);
    return Response.json({ ok: true, business: { id: business.id, slug: business.slug } });
  } catch (e) {
    // Course possible sur l'index unique si deux inscriptions arrivent
    // en même temps avec la même adresse.
    const msg = (e as Error)?.message ?? "";
    if (/unique|duplicate/i.test(msg)) {
      return Response.json({ error: "Un compte existe déjà avec cette adresse." }, { status: 409 });
    }
    console.error("[auth/signup]", msg);
    return Response.json({ error: "Création de compte impossible pour le moment." }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ error: "Méthode non autorisée." }, { status: 405 });
}
