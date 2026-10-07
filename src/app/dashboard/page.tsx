import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { businessesOf } from "@/lib/tenant";
import { overviewData } from "@/lib/queries";
import { minutesLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vue d'ensemble" };

const OUTCOME_LABEL: Record<string, string> = {
  rdv_pris: "rendez-vous",
  lead_capture: "prospect",
  transfert: "transfert",
  renseignement: "renseignement",
  abandon: "abandon",
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <p
        className="muted"
        style={{ margin: 0, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}
      >
        {label}
      </p>
      <p style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{value}</p>
      {hint && (
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export default async function OverviewPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const [business] = await businessesOf(user.id);
  if (!business) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <p style={{ fontWeight: 600, marginTop: 0 }}>Aucun établissement sur ce compte</p>
        <p className="muted" style={{ fontSize: 14, marginBottom: 0 }}>
          Contactez-nous pour en créer un et activer votre accueil vocal.
        </p>
      </div>
    );
  }

  // Toute la mesure du temps est faite dans la requête, pas pendant le rendu.
  const data = await overviewData(business, 30);
  const lowBalance = business.secondsBalance < 5 * 60;

  return (
    <>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Vue d&apos;ensemble</h1>
      <p className="muted" style={{ margin: "0 0 18px", fontSize: 14 }}>
        Trente derniers jours · {business.name}
      </p>

      {lowBalance && (
        <div
          className="card"
          style={{
            padding: 14,
            marginBottom: 18,
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            borderColor: "rgb(217 119 6 / 0.4)",
            background: "rgb(217 119 6 / 0.07)",
          }}
        >
          <div>
            <strong style={{ fontSize: 14 }}>Il vous reste {minutesLabel(business.secondsBalance)}</strong>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
              À zéro, votre agent cesse de décrocher.
            </p>
          </div>
          <Link href="/dashboard/facturation" className="btn btn-primary" style={{ fontSize: 13 }}>
            Recharger
          </Link>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          marginBottom: 22,
        }}
      >
        <Stat label="Appels reçus" value={String(data.totalCalls)} hint="Conversations vocales" />
        <Stat label="Temps consommé" value={minutesLabel(data.seconds)} />
        <Stat
          label="Rendez-vous"
          value={String(data.appointments)}
          hint={`${data.conversionPercent} % des appels`}
        />
        <Stat label="Prospects" value={String(data.leads)} />
        <Stat label="Transferts" value={String(data.transfers)} hint="Passés à un humain" />
        <Stat label="Solde" value={minutesLabel(business.secondsBalance)} hint={`Offre ${business.plan}`} />
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <div className="card" style={{ padding: 18 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Derniers appels</h2>
          {data.recent.length ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {data.recent.map((c) => (
                <li
                  key={c.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom: "1px solid var(--line)",
                    fontSize: 14,
                  }}
                >
                  <span className="muted">{c.label}</span>
                  <span style={{ textAlign: "right", flexShrink: 0 }}>
                    {minutesLabel(c.durationSeconds)}
                    {c.outcome ? ` · ${OUTCOME_LABEL[c.outcome] ?? c.outcome}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ fontSize: 14, margin: 0 }}>
              Aucun appel encore. Installez le widget pour commencer.
            </p>
          )}
          <Link
            href="/dashboard/conversations"
            style={{ display: "inline-block", marginTop: 12, fontSize: 13, color: "var(--color-brand-600)", fontWeight: 600 }}
          >
            Tout l&apos;historique →
          </Link>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Prochains rendez-vous</h2>
          {data.upcoming.length ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {data.upcoming.map((a) => (
                <li
                  key={a.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom: "1px solid var(--line)",
                    fontSize: 14,
                  }}
                >
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.customerName}
                  </span>
                  <span className="muted" style={{ textAlign: "right", flexShrink: 0 }}>
                    {a.label}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ fontSize: 14, margin: 0 }}>
              Rien de prévu.
            </p>
          )}
          <Link
            href="/dashboard/rendez-vous"
            style={{ display: "inline-block", marginTop: 12, fontSize: 13, color: "var(--color-brand-600)", fontWeight: 600 }}
          >
            Tous les rendez-vous →
          </Link>
        </div>
      </div>
    </>
  );
}
