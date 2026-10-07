import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businessHours, businesses } from "@/db/schema";
import { guardOwner } from "@/lib/api-guard";
import { businessData } from "@/lib/queries";
import { createBusiness, isIndustry } from "@/lib/onboarding";
import { businessesOf } from "@/lib/tenant";
import { getUserFromRequest } from "@/lib/auth";
import { planAgentLimit } from "@/lib/plan-config";
import { isEmail, str } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await guardOwner(req);
  if (!guard.ok) return guard.response;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  return Response.json(await businessData(guard.business, appUrl));
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const guard = await guardOwner(req, body.businessId);
  if (!guard.ok) return guard.response;
  const { business } = guard;

  const patch: Record<string, unknown> = {};
  const name = str(body.name);
  if (name) patch.name = name.slice(0, 120);
  if (isIndustry(body.industry)) patch.industry = body.industry;
  if ("description" in body) patch.description = str(body.description)?.slice(0, 1000) ?? null;
  if ("phone" in body) patch.phone = str(body.phone)?.slice(0, 40) ?? null;
  if ("address" in body) patch.address = str(body.address)?.slice(0, 300) ?? null;
  if ("websiteUrl" in body) patch.websiteUrl = str(body.websiteUrl)?.slice(0, 300) ?? null;

  const email = body.email;
  if ("email" in body) {
    if (email === null || email === "") patch.email = null;
    else if (isEmail(email)) patch.email = String(email).toLowerCase();
    else return Response.json({ error: "Adresse e-mail de contact invalide." }, { status: 400 });
  }

  const tz = str(body.timezone);
  if (tz) {
    // Un fuseau invalide casserait tout le calcul des créneaux : on le
    // valide auprès d'Intl avant de l'enregistrer.
    try {
      new Intl.DateTimeFormat("fr-FR", { timeZone: tz });
      patch.timezone = tz;
    } catch {
      return Response.json({ error: "Fuseau horaire inconnu." }, { status: 400 });
    }
  }

  const locale = str(body.locale);
  if (locale && ["fr", "en"].includes(locale)) patch.locale = locale;

  const color = str(body.brandColor);
  if (color) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      return Response.json({ error: "Couleur invalide (format attendu : #1e4db7)." }, { status: 400 });
    }
    patch.brandColor = color;
  }

  if (Array.isArray(body.allowedDomains)) {
    const domains = body.allowedDomains
      .map((d) => str(d)?.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
      .filter((d): d is string => Boolean(d) && /^[a-z0-9.*-]+(:\d+)?$/.test(d!))
      .slice(0, 30);
    patch.allowedDomains = Array.from(new Set(domains));
  }

  if (!Object.keys(patch).length) return Response.json({ error: "Rien à modifier." }, { status: 400 });

  const [updated] = await db.update(businesses).set(patch).where(eq(businesses.id, business.id)).returning();
  return Response.json({ ok: true, business: updated });
}

/** Ajout d'un second établissement sur le même compte. */
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ error: "Connectez-vous." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = str(body.name);
  if (!name) return Response.json({ error: "Nom de l'établissement requis." }, { status: 400 });

  const existing = await businessesOf(user.id);
  if (existing.length >= 10) {
    return Response.json({ error: "Limite de 10 établissements par compte atteinte." }, { status: 409 });
  }

  const business = await createBusiness({
    ownerId: user.id,
    name,
    industry: str(body.industry) ?? "autre",
    phone: str(body.phone) ?? null,
  });
  return Response.json({ ok: true, business });
}
