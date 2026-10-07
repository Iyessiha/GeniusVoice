import Link from "next/link";
import { ArrowRight, CalendarCheck, Clock, PhoneIncoming, ShieldCheck, UserPlus } from "lucide-react";
import { PLANS } from "@/lib/plan-config";
import { INDUSTRIES } from "@/lib/industries";
import { xof } from "@/lib/format";

export const metadata = {
  title: "GeniusVoice — Votre accueil téléphonique ne sonne plus dans le vide",
};

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: 28,
          height: 28,
          borderRadius: 999,
          background: "var(--color-brand-700)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        {n}
      </span>
      <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{title}</h3>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        {children}
      </p>
    </div>
  );
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <span style={{ color: "var(--color-brand-600)", flexShrink: 0, marginTop: 2 }}>{icon}</span>
      <div>
        <h3 style={{ margin: "0 0 3px", fontSize: 15 }}>{title}</h3>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          {children}
        </p>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div>
      <header style={{ borderBottom: "1px solid var(--line)", background: "var(--card)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            maxWidth: 1080,
            margin: "0 auto",
            padding: "14px 16px",
          }}
        >
          <Link href="/" style={{ fontWeight: 700, fontSize: 17 }}>
            Genius<span style={{ color: "var(--color-brand-600)" }}>Voice</span>
          </Link>
          <nav style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <Link href="/auth/login" className="btn btn-ghost" style={{ fontSize: 14 }}>
              Connexion
            </Link>
            <Link href="/auth/signup" className="btn btn-primary" style={{ fontSize: 14 }}>
              Essayer
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Accroche ── */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "56px 16px 40px" }}>
        <div style={{ maxWidth: 680 }}>
          <p
            style={{
              display: "inline-block",
              padding: "4px 11px",
              borderRadius: 999,
              background: "var(--color-brand-50)",
              color: "var(--color-brand-700)",
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            Accueil vocal IA · multi-établissements
          </p>
          <h1 style={{ margin: "0 0 14px", fontSize: "clamp(28px, 5vw, 42px)", lineHeight: 1.12, letterSpacing: "-0.02em" }}>
            Chaque appel manqué est un patient, un locataire ou un client qui appelle ailleurs.
          </h1>
          <p className="muted" style={{ margin: "0 0 24px", fontSize: 17, lineHeight: 1.55 }}>
            GeniusVoice installe sur votre site un accueil vocal qui répond à voix haute, renseigne vos clients, prend
            les rendez-vous dans vos créneaux réels et vous transmet les demandes qu&apos;il ne peut pas traiter. En
            français, jour et nuit.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Link href="/auth/signup" className="btn btn-primary" style={{ fontSize: 15, padding: "11px 18px" }}>
              Commencer — 20 minutes offertes
              <ArrowRight size={17} />
            </Link>
            <Link href="/widget-demo" className="btn btn-ghost" style={{ fontSize: 15, padding: "11px 18px" }}>
              Voir la démonstration
            </Link>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
            Sans carte bancaire. Paiement par mobile money.
          </p>
        </div>
      </section>

      {/* ── Mise en place ── */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "0 16px 48px" }}>
        <h2 style={{ fontSize: 22, margin: "0 0 4px" }}>Trois étapes, un après-midi</h2>
        <p className="muted" style={{ margin: "0 0 18px", fontSize: 15 }}>
          Aucune installation téléphonique, aucun matériel.
        </p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <Step n={1} title="Décrivez votre établissement">
            Horaires, prestations, tarifs, et les réponses à vos questions les plus fréquentes. C&apos;est tout ce que
            votre agent est autorisé à dire.
          </Step>
          <Step n={2} title="Collez une ligne de code">
            Une balise <code>&lt;script&gt;</code> dans votre site. Le widget apparaît en bas à droite, à vos couleurs.
          </Step>
          <Step n={3} title="Suivez les résultats">
            Transcriptions, rendez-vous pris, prospects captés, minutes consommées. Tout est dans votre tableau de bord.
          </Step>
        </div>
      </section>

      {/* ── Ce que fait l'agent ── */}
      <section style={{ background: "var(--card)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "44px 16px" }}>
          <h2 style={{ fontSize: 22, margin: "0 0 20px" }}>Ce que votre agent sait faire</h2>
          <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))" }}>
            <Feature icon={<PhoneIncoming size={20} />} title="Répondre et renseigner">
              Il répond à voix haute, sur votre base de connaissances. Hors de cette base, il refuse de répondre plutôt
              que d&apos;inventer.
            </Feature>
            <Feature icon={<CalendarCheck size={20} />} title="Prendre des rendez-vous">
              Il consulte vos horaires et vos créneaux déjà pris avant d&apos;annoncer une disponibilité. Pas de
              double-réservation.
            </Feature>
            <Feature icon={<UserPlus size={20} />} title="Qualifier vos prospects">
              Budget, délai, zone, type de bien : il recueille ce qu&apos;il faut pour que votre commercial rappelle
              utilement.
            </Feature>
            <Feature icon={<Clock size={20} />} title="Travailler la nuit">
              Les appels hors horaires ne sont plus perdus : il prend le message, le rendez-vous ou les coordonnées.
            </Feature>
            <Feature icon={<ShieldCheck size={20} />} title="Savoir s'arrêter">
              Urgence médicale, réclamation, demande de parler à une personne : il transfère au lieu d&apos;improviser.
            </Feature>
          </div>
        </div>
      </section>

      {/* ── Secteurs ── */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "44px 16px" }}>
        <h2 style={{ fontSize: 22, margin: "0 0 4px" }}>Un cadrage par métier</h2>
        <p className="muted" style={{ margin: "0 0 18px", fontSize: 15, maxWidth: 620 }}>
          Un agent de clinique ne parle pas comme un agent immobilier, et surtout ne s&apos;autorise pas les mêmes
          choses. Le secteur que vous choisissez détermine ses priorités et ses interdits.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {INDUSTRIES.filter((i) => i.id !== "autre").map((i) => (
            <span
              key={i.id}
              className="card"
              style={{ padding: "6px 12px", fontSize: 14, borderRadius: 999 }}
            >
              {i.label}
            </span>
          ))}
        </div>
      </section>

      {/* ── Tarifs ── */}
      <section style={{ background: "var(--card)", borderTop: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "44px 16px" }}>
          <h2 style={{ fontSize: 22, margin: "0 0 4px" }}>Vous payez les minutes parlées</h2>
          <p className="muted" style={{ margin: "0 0 20px", fontSize: 15 }}>
            Pas d&apos;abonnement au siège vide : la facturation suit le temps de conversation réellement consommé.
          </p>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className="card"
                style={{
                  padding: 18,
                  background: "var(--bg)",
                  borderColor: plan.highlight ? "var(--color-brand-500)" : undefined,
                }}
              >
                {plan.highlight && (
                  <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "var(--color-brand-600)" }}>
                    {plan.highlight}
                  </p>
                )}
                <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>{plan.label}</h3>
                <p style={{ margin: "0 0 2px", fontSize: 24, fontWeight: 700 }}>
                  {plan.xof > 0 ? xof(plan.xof) : "Offert"}
                </p>
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                  {plan.minutes} minutes · {plan.agents} agent{plan.agents > 1 ? "s" : ""}
                </p>
              </div>
            ))}
          </div>
          <Link
            href="/auth/signup"
            className="btn btn-primary"
            style={{ marginTop: 20, fontSize: 15, padding: "11px 18px" }}
          >
            Créer mon accueil vocal
            <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <footer style={{ borderTop: "1px solid var(--line)", padding: "24px 16px" }}>
        <div
          className="muted"
          style={{
            maxWidth: 1080,
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            justifyContent: "space-between",
            fontSize: 13,
          }}
        >
          <span>GeniusVoice — MonWe Infinity LLC</span>
          <span>Accueil vocal IA pour l&apos;Afrique de l&apos;Ouest</span>
        </div>
      </footer>
    </div>
  );
}
