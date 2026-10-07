"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/client";
import { Badge, Card, Empty, Notice, Spinner, Table, Td, useFlash } from "@/components/ui";

type Appointment = {
  id: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  scheduledLabel: string;
  durationMinutes: number;
  status: string;
  notes: string | null;
  serviceName: string | null;
};

const STATUS: Record<string, { label: string; tone: "good" | "warn" | "neutral" | "bad" }> = {
  pending: { label: "À confirmer", tone: "warn" },
  confirmed: { label: "Confirmé", tone: "good" },
  completed: { label: "Honoré", tone: "neutral" },
  cancelled: { label: "Annulé", tone: "bad" },
  no_show: { label: "Absent", tone: "bad" },
};

export default function AppointmentsClient({ initial }: { initial: { appointments: Appointment[] } }) {
  const [rows, setRows] = useState<Appointment[] | null>(initial.appointments);
  const [scope, setScope] = useState<"upcoming" | "all">("upcoming");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  /* La portée est pilotée par les boutons : le rechargement part d'un
   * événement utilisateur, jamais d'un effet au montage. */
  const load = useCallback(async (next: "upcoming" | "all") => {
    setRows(null);
    try {
      const data = await api<{ appointments: Appointment[] }>(`/api/appointments?scope=${next}`);
      setRows(data.appointments);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const switchScope = useCallback(
    (next: "upcoming" | "all") => {
      if (next === scope) return;
      setScope(next);
      void load(next);
    },
    [load, scope]
  );

  const setStatus = useCallback(
    async (id: string, status: string) => {
      try {
        await api("/api/appointments", { method: "PATCH", body: { id, status } });
        setFlash("Rendez-vous mis à jour.");
        await load(scope);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [load, scope, setFlash]
  );

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Rendez-vous</h1>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            className={scope === "upcoming" ? "btn btn-primary" : "btn btn-ghost"}
            style={{ fontSize: 13, padding: "5px 11px" }}
            onClick={() => switchScope("upcoming")}
          >
            À venir
          </button>
          <button
            className={scope === "all" ? "btn btn-primary" : "btn btn-ghost"}
            style={{ fontSize: 13, padding: "5px 11px" }}
            onClick={() => switchScope("all")}
          >
            Tous
          </button>
        </div>
      </div>
      <p className="muted" style={{ margin: "0 0 18px", fontSize: 14 }}>
        Pris par votre agent vocal ou saisis à la main. Les heures sont celles de votre établissement.
      </p>

      {error && <Notice kind="error">{error}</Notice>}
      {flash && <Notice kind="success">{flash}</Notice>}

      {!rows && !error ? (
        <Spinner />
      ) : rows && rows.length ? (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <Table head={["Créneau", "Client", "Contact", "Prestation", "Statut", "Action"]}>
            {rows.map((a) => (
              <tr key={a.id}>
                <Td>
                  <span style={{ fontWeight: 600 }}>{a.scheduledLabel}</span>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>
                    {a.durationMinutes} min
                  </span>
                </Td>
                <Td>
                  {a.customerName}
                  {a.notes && (
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>
                      {a.notes}
                    </span>
                  )}
                </Td>
                <Td>
                  <span style={{ fontSize: 13 }}>{a.customerPhone ?? "—"}</span>
                  {a.customerEmail && (
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>
                      {a.customerEmail}
                    </span>
                  )}
                </Td>
                <Td>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {a.serviceName ?? "—"}
                  </span>
                </Td>
                <Td>
                  <Badge tone={STATUS[a.status]?.tone ?? "neutral"}>{STATUS[a.status]?.label ?? a.status}</Badge>
                </Td>
                <Td>
                  <select
                    className="field"
                    style={{ padding: "4px 7px", fontSize: 12, width: 130 }}
                    value={a.status}
                    onChange={(e) => void setStatus(a.id, e.target.value)}
                  >
                    {Object.entries(STATUS).map(([value, meta]) => (
                      <option key={value} value={value}>
                        {meta.label}
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
          <Empty
            title={scope === "upcoming" ? "Aucun rendez-vous à venir" : "Aucun rendez-vous"}
            hint="Activez l'outil book_appointment sur votre agent pour qu'il puisse en prendre."
          />
        </Card>
      )}
    </>
  );
}
