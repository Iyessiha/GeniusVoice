import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { businessHours, knowledgeItems, services } from "@/db/schema";
import { businessBySlug, defaultAgent } from "@/lib/tenant";
import { hasEnoughBalance } from "@/lib/minutes";
import VoiceWidget from "@/components/VoiceWidget";

export const dynamic = "force-dynamic";

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await businessBySlug(slug);
  if (!business) return { title: "Établissement introuvable" };
  return {
    title: `${business.name} — Accueil vocal`,
    description: business.description ?? `Parlez à l'accueil de ${business.name}.`,
  };
}

/** Page publique d'un établissement.
 *
 *  Utile aux clients qui n'ont pas de site web : ils partagent ce lien et
 *  disposent d'un accueil vocal sans rien installer. */
export default async function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await businessBySlug(slug);
  if (!business || business.status !== "active") notFound();

  const [agent, hours, svc, faq] = await Promise.all([
    defaultAgent(business.id),
    db.select().from(businessHours).where(eq(businessHours.businessId, business.id)),
    db
      .select()
      .from(services)
      .where(and(eq(services.businessId, business.id), eq(services.active, true))),
    db
      .select({ title: knowledgeItems.title, content: knowledgeItems.content })
      .from(knowledgeItems)
      .where(and(eq(knowledgeItems.businessId, business.id), eq(knowledgeItems.pinned, true)))
      .limit(8),
  ]);

  const available = Boolean(agent) && hasEnoughBalance(business);

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ background: business.brandColor, color: "#fff", padding: "40px 16px" }}>
        <div style={{ maxWidth: 940, margin: "0 auto" }}>
          <h1 style={{ margin: "0 0 6px", fontSize: "clamp(24px, 4vw, 34px)" }}>{business.name}</h1>
          {business.description && (
            <p style={{ margin: 0, fontSize: 16, opacity: 0.92, maxWidth: 620 }}>{business.description}</p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 14, fontSize: 14, opacity: 0.92 }}>
            {business.address && <span>{business.address}</span>}
            {business.phone && <span>{business.phone}</span>}
          </div>
        </div>
      </header>

      <main
        style={{
          maxWidth: 940,
          margin: "0 auto",
          padding: "28px 16px 56px",
          display: "grid",
          gap: 22,
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          alignItems: "start",
        }}
      >
        <div>
          <h2 style={{ fontSize: 19, margin: "0 0 10px" }}>Parlez à notre accueil</h2>
          <p className="muted" style={{ fontSize: 14, margin: "0 0 14px" }}>
            {available
              ? "Posez votre question à voix haute. Notre accueil peut vous renseigner ou prendre un rendez-vous."
              : "L'accueil vocal est momentanément indisponible. Merci de nous joindre par téléphone."}
          </p>
          <div style={{ maxWidth: 400 }}>
            <VoiceWidget
              publicKey={business.publicKey}
              businessName={business.name}
              brandColor={business.brandColor}
              available={available}
            />
          </div>
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          {hours.length > 0 && (
            <section className="card" style={{ padding: 18 }}>
              <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Horaires</h2>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 14 }}>
                {hours
                  .slice()
                  .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                  .map((h) => (
                    <li
                      key={h.id}
                      style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0" }}
                    >
                      <span>{DAYS[h.dayOfWeek]}</span>
                      <span className="muted">{h.closed ? "Fermé" : `${h.opensAt} – ${h.closesAt}`}</span>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {svc.length > 0 && (
            <section className="card" style={{ padding: 18 }}>
              <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Prestations</h2>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 14 }}>
                {svc.map((s) => (
                  <li key={s.id} style={{ padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
                    <strong style={{ fontWeight: 600 }}>{s.name}</strong>
                    <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>
                      {s.durationMinutes} min
                      {s.price != null ? ` · ${s.price.toLocaleString("fr-FR")} ${s.currency}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {faq.length > 0 && (
            <section className="card" style={{ padding: 18 }}>
              <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Questions fréquentes</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {faq.map((f) => (
                  <div key={f.title}>
                    <strong style={{ fontSize: 14 }}>{f.title}</strong>
                    <p className="muted" style={{ margin: "2px 0 0", fontSize: 13.5 }}>
                      {f.content}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <footer style={{ borderTop: "1px solid var(--line)", padding: "18px 16px" }}>
        <p className="muted" style={{ maxWidth: 940, margin: "0 auto", fontSize: 13 }}>
          Accueil vocal propulsé par GeniusVoice.
        </p>
      </footer>
    </div>
  );
}
