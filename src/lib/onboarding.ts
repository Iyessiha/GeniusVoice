import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, businessHours, businesses, usageEvents, type Business } from "@/db/schema";
import { TRIAL_SECONDS } from "@/lib/plan-config";
import { newPublicKey, slugify } from "@/lib/utils";
import { isIndustry } from "@/lib/industries";

export { INDUSTRIES, isIndustry } from "@/lib/industries";

/** Nom d'agent plausible selon le métier : « Awa » passe mieux qu'« Agent 1 »
 *  au téléphone, et le client le change ensuite. */
const AGENT_NAMES: Record<string, string> = {
  hopital: "Awa",
  dentaire: "Awa",
  immobilier: "Koffi",
  commerce: "Aya",
  salon: "Mariam",
  hotel: "Fatou",
  juridique: "Ibrahim",
  automobile: "Yao",
  restaurant: "Adjoua",
  fitness: "Seydou",
  services: "Moussa",
  autre: "Awa",
};

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "etablissement";
  for (let i = 0; i < 25; i += 1) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const existing = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.slug, candidate))
      .limit(1);
    if (!existing.length) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** Crée un tenant utilisable immédiatement : un agent actif, des horaires
 *  par défaut et les minutes d'essai. Un compte vide ne démontre rien. */
export async function createBusiness(opts: {
  ownerId: string;
  name: string;
  industry: string;
  phone?: string | null;
  locale?: string;
}): Promise<Business> {
  const slug = await uniqueSlug(opts.name);
  const industry = isIndustry(opts.industry) ? opts.industry : "autre";

  const [business] = await db
    .insert(businesses)
    .values({
      ownerId: opts.ownerId,
      name: opts.name,
      slug,
      publicKey: newPublicKey(),
      industry,
      phone: opts.phone ?? null,
      locale: opts.locale ?? "fr",
      secondsBalance: TRIAL_SECONDS,
      plan: "essai",
    })
    .returning();

  await db.insert(agents).values({
    businessId: business.id,
    name: AGENT_NAMES[industry] ?? "Awa",
    role: industry === "immobilier" ? "commercial" : "receptionniste",
    voice: "marin",
    isDefault: true,
    active: true,
    transferPhone: opts.phone ?? null,
  });

  // Lundi–vendredi 8h–18h, samedi 8h–13h, dimanche fermé : à ajuster par
  // le client, mais l'agent ne doit jamais partir sans horaires.
  await db.insert(businessHours).values(
    [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      businessId: business.id,
      dayOfWeek: d,
      opensAt: d === 6 ? "08:00" : "08:00",
      closesAt: d === 6 ? "13:00" : "18:00",
      closed: d === 0,
    }))
  );

  await db.insert(usageEvents).values({
    businessId: business.id,
    seconds: -TRIAL_SECONDS,
    reason: "essai_offert",
  });

  return business;
}
