"use client";

import { useCallback, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { Card, Empty, Field, Notice, SectionTitle, Spinner, useFlash } from "@/components/ui";

type Hour = { id: string; dayOfWeek: number; opensAt: string; closesAt: string; closed: boolean };
type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number | null;
  currency: string;
  active: boolean;
};

const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export default function HoursClient({ initial }: { initial: { hours: Hour[]; services: Service[] } }) {
  const [hours, setHours] = useState<Hour[] | null>(initial.hours);
  const [services, setServices] = useState<Service[] | null>(initial.services);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([
        api<{ hours: Hour[] }>("/api/business"),
        api<{ services: Service[] }>("/api/services"),
      ]);
      setHours(b.hours);
      setServices(s.services);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);


  return (
    <>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Horaires &amp; prestations</h1>
      <p className="muted" style={{ margin: "0 0 18px", fontSize: 14, maxWidth: 680 }}>
        L&apos;agent ne propose un créneau qu&apos;après avoir consulté ces horaires et les rendez-vous déjà pris. Une
        erreur ici se traduit par un client devant une porte fermée.
      </p>

      {error && <Notice kind="error">{error}</Notice>}
      {flash && <Notice kind="success">{flash}</Notice>}

      <Card style={{ marginBottom: 20 }}>
        <SectionTitle title="Horaires d'ouverture" />
        {!hours ? (
          <Spinner />
        ) : (
          <>
            <div style={{ display: "grid", gap: 8 }}>
              {hours.map((h, idx) => (
                <div
                  key={h.id}
                  style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 14 }}
                >
                  <span style={{ width: 96, fontWeight: 600 }}>{DAYS[h.dayOfWeek]}</span>
                  <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={h.closed}
                      onChange={(e) => {
                        const next = [...hours];
                        next[idx] = { ...h, closed: e.target.checked };
                        setHours(next);
                      }}
                    />
                    Fermé
                  </label>
                  <input
                    type="time"
                    className="field"
                    style={{ width: 120 }}
                    value={h.opensAt}
                    disabled={h.closed}
                    onChange={(e) => {
                      const next = [...hours];
                      next[idx] = { ...h, opensAt: e.target.value };
                      setHours(next);
                    }}
                  />
                  <span className="muted">→</span>
                  <input
                    type="time"
                    className="field"
                    style={{ width: 120 }}
                    value={h.closesAt}
                    disabled={h.closed}
                    onChange={(e) => {
                      const next = [...hours];
                      next[idx] = { ...h, closesAt: e.target.value };
                      setHours(next);
                    }}
                  />
                </div>
              ))}
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 14 }}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/api/hours", { method: "PUT", body: { hours } });
                  setFlash("Horaires enregistrés.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Enregistrer les horaires
            </button>
          </>
        )}
      </Card>

      <Card>
        <SectionTitle
          title="Prestations réservables"
          hint="L'agent annonce la durée et le tarif issus de cette liste avant de réserver."
        />
        <NewService
          onCreated={async () => {
            setFlash("Prestation ajoutée.");
            await load();
          }}
          onError={setError}
        />

        {!services ? (
          <Spinner />
        ) : services.length ? (
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {services.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: "9px 0",
                  borderTop: "1px solid var(--line)",
                  fontSize: 14,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{s.name}</strong>
                  <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>
                    {s.durationMinutes} min{s.price != null ? ` · ${s.price.toLocaleString("fr-FR")} ${s.currency}` : " · sur devis"}
                  </span>
                  {s.description && (
                    <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                      {s.description}
                    </p>
                  )}
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ padding: "5px 9px", color: "#dc2626", flexShrink: 0 }}
                  onClick={async () => {
                    if (!confirm(`Supprimer « ${s.name} » ?`)) return;
                    try {
                      await api(`/api/services?id=${s.id}`, { method: "DELETE" });
                      await load();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Aucune prestation" hint="Sans catalogue, l'agent réserve des créneaux génériques de 30 minutes." />
        )}
      </Card>
    </>
  );
}

function NewService({ onCreated, onError }: { onCreated: () => Promise<void>; onError: (m: string) => void }) {
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("30");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        try {
          await api("/api/services", {
            body: {
              name,
              durationMinutes: Number(duration) || 30,
              ...(price.trim() ? { price: Number(price) } : {}),
            },
          });
          setName("");
          setPrice("");
          await onCreated();
        } catch (err) {
          onError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
      style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}
    >
      <div style={{ flex: "1 1 200px" }}>
        <Field label="Prestation">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Consultation" />
        </Field>
      </div>
      <div style={{ flex: "0 1 130px" }}>
        <Field label="Durée (min)">
          <input
            className="field"
            type="number"
            min={5}
            max={480}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </Field>
      </div>
      <div style={{ flex: "0 1 150px" }}>
        <Field label="Tarif (FCFA)">
          <input
            className="field"
            type="number"
            min={0}
            value={price}
            placeholder="optionnel"
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
      </div>
      <button className="btn btn-primary" disabled={busy || !name.trim()} style={{ marginBottom: 12 }}>
        <Plus size={16} />
        Ajouter
      </button>
    </form>
  );
}
