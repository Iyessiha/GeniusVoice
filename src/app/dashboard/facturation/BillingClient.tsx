"use client";

import { useCallback, useState } from "react";
import { Check } from "lucide-react";
import { api } from "@/lib/client";
import { minutesLabel, xof } from "@/lib/format";
import { Card, Notice, SectionTitle, Spinner, useFlash } from "@/components/ui";

type Plan = { id: string; label: string; minutes: number; xof: number; agents: number; highlight?: string };
type Payload = {
  business: { id: string; plan: string; secondsBalance: number };
  plans: Plan[];
  topups: Plan[];
  invoices: Array<{ invoiceNumber: string; plan: string; seconds: number; amount: number; createdAt: string | Date }>;
};

export default function BillingClient({
  initial,
  notice,
}: {
  initial: Payload;
  notice?: { kind: "error" | "success"; text: string };
}) {
  const [data, setData] = useState<Payload | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash(8000);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Payload>("/api/billing/plans"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);


  const buy = useCallback(async (planId: string) => {
    setBusy(planId);
    setError(null);
    try {
      const res = await api<{ paymentUrl: string }>("/api/billing/checkout", { body: { plan: planId } });
      window.location.href = res.paymentUrl;
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }, []);

  if (!data && !error) return <Spinner />;

  return (
    <>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Facturation</h1>
      <p className="muted" style={{ margin: "0 0 18px", fontSize: 14 }}>
        Vous payez les minutes de conversation réellement consommées. Paiement par mobile money.
      </p>

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {flash && <Notice kind="success">{flash}</Notice>}

      {data && (
        <>
          <Card style={{ marginBottom: 18 }}>
            <p className="muted" style={{ margin: 0, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Solde actuel
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 30, fontWeight: 700 }}>
              {minutesLabel(data.business.secondsBalance)}
            </p>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
              Offre en cours : {data.business.plan}
            </p>
          </Card>

          <SectionTitle title="Offres" hint="Changer d'offre crédite les minutes et relève la limite d'agents." />
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              marginBottom: 24,
            }}
          >
            {data.plans.map((plan) => {
              const current = plan.id === data.business.plan;
              const free = plan.xof <= 0;
              return (
                <div
                  key={plan.id}
                  className="card"
                  style={{
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    borderColor: plan.highlight ? "var(--color-brand-500)" : undefined,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <strong style={{ fontSize: 16 }}>{plan.label}</strong>
                    {current && <Check size={15} style={{ color: "var(--color-live-600)" }} />}
                  </div>
                  <p style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 700 }}>
                    {free ? "Offert" : xof(plan.xof)}
                  </p>
                  <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
                    {plan.minutes} minutes · {plan.agents} agent{plan.agents > 1 ? "s" : ""}
                  </p>
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: "auto" }}
                    disabled={free || current || busy !== null}
                    onClick={() => void buy(plan.id)}
                  >
                    {busy === plan.id ? "Redirection…" : current ? "Offre actuelle" : free ? "À l'inscription" : "Choisir"}
                  </button>
                </div>
              );
            })}
          </div>

          <SectionTitle title="Recharges" hint="Des minutes en plus, sans changer d'offre." />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
            {data.topups.map((t) => (
              <div key={t.id} className="card" style={{ padding: 14, minWidth: 190 }}>
                <strong style={{ fontSize: 15 }}>{t.label}</strong>
                <p style={{ margin: "4px 0 10px", fontSize: 18, fontWeight: 700 }}>{xof(t.xof)}</p>
                <button className="btn btn-ghost" disabled={busy !== null} onClick={() => void buy(t.id)}>
                  {busy === t.id ? "Redirection…" : "Recharger"}
                </button>
              </div>
            ))}
          </div>

          {data.invoices.length > 0 && (
            <>
              <SectionTitle title="Factures" />
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <tbody>
                    {data.invoices.map((inv) => (
                      <tr key={inv.invoiceNumber}>
                        <td style={{ padding: 11, borderBottom: "1px solid var(--line)" }}>
                          <code style={{ fontSize: 13 }}>{inv.invoiceNumber}</code>
                        </td>
                        <td style={{ padding: 11, borderBottom: "1px solid var(--line)" }}>{inv.plan}</td>
                        <td style={{ padding: 11, borderBottom: "1px solid var(--line)" }}>
                          {minutesLabel(inv.seconds)}
                        </td>
                        <td style={{ padding: 11, borderBottom: "1px solid var(--line)", textAlign: "right" }}>
                          {xof(inv.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </>
      )}
    </>
  );
}
