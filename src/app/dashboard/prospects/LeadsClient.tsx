"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/client";
import { dateLabel } from "@/lib/format";
import { Badge, Card, Empty, Notice, Spinner, Table, Td, useFlash } from "@/components/ui";

type Lead = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  intent: string | null;
  qualification: Record<string, string>;
  score: number;
  status: string;
  createdAt: string | Date;
};

const STATUS_LABEL: Record<string, string> = {
  nouveau: "Nouveau",
  contacte: "Contacté",
  qualifie: "Qualifié",
  gagne: "Gagné",
  perdu: "Perdu",
};

function tone(score: number): "good" | "warn" | "bad" {
  if (score >= 70) return "good";
  if (score >= 40) return "warn";
  return "bad";
}

export default function LeadsClient({ initial }: { initial: { leads: Lead[]; statuses: string[] } }) {
  const [rows, setRows] = useState<Lead[] | null>(initial.leads);
  const [statuses, setStatuses] = useState<string[]>(initial.statuses);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  const load = useCallback(async () => {
    try {
      const data = await api<{ leads: Lead[]; statuses: string[] }>("/api/leads");
      setRows(data.leads);
      setStatuses(data.statuses);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);


  return (
    <>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Prospects</h1>
      <p className="muted" style={{ margin: "0 0 18px", fontSize: 14 }}>
        Captés par votre agent quand l&apos;appel n&apos;aboutit pas à un rendez-vous. La note est celle que l&apos;agent
        a attribuée pendant la conversation.
      </p>

      {error && <Notice kind="error">{error}</Notice>}
      {flash && <Notice kind="success">{flash}</Notice>}

      {!rows && !error ? (
        <Spinner />
      ) : rows && rows.length ? (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <Table head={["Reçu", "Prospect", "Contact", "Besoin", "Note", "Suivi"]}>
            {rows.map((l) => (
              <tr key={l.id}>
                <Td>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {dateLabel(l.createdAt)}
                  </span>
                </Td>
                <Td>{l.name ?? <span className="muted">anonyme</span>}</Td>
                <Td>
                  <span style={{ fontSize: 13 }}>{l.phone ?? "—"}</span>
                  {l.email && (
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>
                      {l.email}
                    </span>
                  )}
                </Td>
                <Td style={{ maxWidth: 280 }}>
                  <span style={{ fontSize: 13 }}>{l.intent ?? "—"}</span>
                  {Object.keys(l.qualification).length > 0 && (
                    <span className="muted" style={{ display: "block", fontSize: 12, marginTop: 3 }}>
                      {Object.entries(l.qualification)
                        .map(([k, v]) => `${k} : ${v}`)
                        .join(" · ")}
                    </span>
                  )}
                </Td>
                <Td>
                  <Badge tone={tone(l.score)}>{l.score}</Badge>
                </Td>
                <Td>
                  <select
                    className="field"
                    style={{ padding: "4px 7px", fontSize: 12, width: 120 }}
                    value={l.status}
                    onChange={async (e) => {
                      try {
                        await api("/api/leads", { method: "PATCH", body: { id: l.id, status: e.target.value } });
                        setFlash("Prospect mis à jour.");
                        await load();
                      } catch (err) {
                        setError((err as Error).message);
                      }
                    }}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s] ?? s}
                      </option>
                    ))}
                  </select>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : (
        <Card>
          <Empty title="Aucun prospect" hint="Activez l'outil capture_lead sur votre agent pour qu'il recueille les coordonnées." />
        </Card>
      )}
    </>
  );
}
