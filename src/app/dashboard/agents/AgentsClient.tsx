"use client";

import { useCallback, useState } from "react";
import { Plus, Trash2, Star } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Card, Field, Notice, SectionTitle, Spinner, useFlash } from "@/components/ui";

type Agent = {
  id: string;
  name: string;
  role: string;
  voice: string;
  greeting: string | null;
  instructions: string | null;
  transferPhone: string | null;
  enabledTools: string[];
  isDefault: boolean;
  active: boolean;
};

type Payload = {
  agents: Agent[];
  voices: string[];
  roles: string[];
  tools: Array<{ name: string; description: string }>;
  limit: number;
};

const ROLE_LABEL: Record<string, string> = {
  receptionniste: "Réceptionniste",
  commercial: "Commercial",
  support: "Support",
};

export default function AgentsClient({ initial }: { initial: Payload }) {
  const [data, setData] = useState<Payload | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const [editing, setEditing] = useState<Agent | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<Payload>("/api/agents"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);


  const save = useCallback(
    async (agent: Agent) => {
      setBusy(true);
      setError(null);
      try {
        await api("/api/agents", {
          method: "PATCH",
          body: {
            id: agent.id,
            name: agent.name,
            role: agent.role,
            voice: agent.voice,
            greeting: agent.greeting,
            instructions: agent.instructions,
            transferPhone: agent.transferPhone,
            enabledTools: agent.enabledTools,
            active: agent.active,
          },
        });
        setFlash("Agent enregistré.");
        setEditing(null);
        await load();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [load, setFlash]
  );

  if (!data && !error) return <Spinner />;

  return (
    <>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Agents vocaux</h1>
      <p className="muted" style={{ margin: "0 0 18px", fontSize: 14 }}>
        Chaque agent a sa voix, ses consignes et ses outils. L&apos;agent par défaut est celui qui décroche dans le widget.
      </p>

      {error && <Notice kind="error">{error}</Notice>}
      {flash && <Notice kind="success">{flash}</Notice>}

      {data && (
        <>
          <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
            {data.agents.map((agent) => (
              <Card key={agent.id}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <strong style={{ fontSize: 16 }}>{agent.name}</strong>
                  <Badge>{ROLE_LABEL[agent.role] ?? agent.role}</Badge>
                  <Badge tone="neutral">voix : {agent.voice}</Badge>
                  {agent.isDefault && <Badge tone="good">par défaut</Badge>}
                  {!agent.active && <Badge tone="bad">inactif</Badge>}
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    {!agent.isDefault && (
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 13, padding: "5px 10px" }}
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await api("/api/agents", { method: "PATCH", body: { id: agent.id, isDefault: true } });
                            setFlash(`${agent.name} décroche désormais par défaut.`);
                            await load();
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Star size={14} /> Par défaut
                      </button>
                    )}
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 13, padding: "5px 10px" }}
                      onClick={() => setEditing(editing?.id === agent.id ? null : { ...agent })}
                    >
                      {editing?.id === agent.id ? "Fermer" : "Modifier"}
                    </button>
                    {data.agents.length > 1 && (
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: 13, padding: "5px 10px", color: "#dc2626" }}
                        disabled={busy}
                        onClick={async () => {
                          if (!confirm(`Supprimer l'agent ${agent.name} ?`)) return;
                          setBusy(true);
                          try {
                            await api(`/api/agents?id=${agent.id}`, { method: "DELETE" });
                            setFlash("Agent supprimé.");
                            await load();
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  {agent.greeting || "Phrase d'accueil générée automatiquement."}
                </p>

                {editing?.id === agent.id && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                    <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
                      <Field label="Nom de l'agent">
                        <input
                          className="field"
                          value={editing.name}
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        />
                      </Field>
                      <Field label="Rôle">
                        <select
                          className="field"
                          value={editing.role}
                          onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                        >
                          {data.roles.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r] ?? r}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Voix" hint="Écoutez-les avant de choisir : le timbre change tout au téléphone.">
                        <select
                          className="field"
                          value={editing.voice}
                          onChange={(e) => setEditing({ ...editing, voice: e.target.value })}
                        >
                          {data.voices.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Numéro de transfert" hint="Vers qui basculer un appel délicat.">
                        <input
                          className="field"
                          value={editing.transferPhone ?? ""}
                          placeholder="+225 ..."
                          onChange={(e) => setEditing({ ...editing, transferPhone: e.target.value })}
                        />
                      </Field>
                    </div>

                    <Field label="Phrase d'accueil" hint="La première phrase prononcée. Laissez vide pour la phrase automatique.">
                      <input
                        className="field"
                        value={editing.greeting ?? ""}
                        onChange={(e) => setEditing({ ...editing, greeting: e.target.value })}
                      />
                    </Field>

                    <Field
                      label="Consignes métier"
                      hint="Ce que l'agent doit savoir ou éviter de dire. Les faits (tarifs, horaires) vont plutôt dans les connaissances."
                    >
                      <textarea
                        className="field"
                        rows={5}
                        value={editing.instructions ?? ""}
                        onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
                      />
                    </Field>

                    <Field label="Outils autorisés" hint="Un outil décoché ne s'exécute pas, même si le modèle le réclame.">
                      <div style={{ display: "grid", gap: 7 }}>
                        {data.tools.map((tool) => {
                          const on = editing.enabledTools.includes(tool.name);
                          return (
                            <label key={tool.name} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13 }}>
                              <input
                                type="checkbox"
                                checked={on}
                                style={{ marginTop: 3 }}
                                onChange={() =>
                                  setEditing({
                                    ...editing,
                                    enabledTools: on
                                      ? editing.enabledTools.filter((t) => t !== tool.name)
                                      : [...editing.enabledTools, tool.name],
                                  })
                                }
                              />
                              <span>
                                <code style={{ fontWeight: 600 }}>{tool.name}</code>
                                <span className="muted" style={{ display: "block", fontSize: 12 }}>
                                  {tool.description.split(".")[0]}.
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </Field>

                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 14 }}>
                      <input
                        type="checkbox"
                        checked={editing.active}
                        onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                      />
                      Agent actif
                    </label>

                    <button className="btn btn-primary" disabled={busy} onClick={() => void save(editing)}>
                      Enregistrer
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </div>

          <Card>
            <SectionTitle
              title="Ajouter un agent"
              hint={`Votre offre autorise ${data.limit} agent${data.limit > 1 ? "s" : ""}. Vous en avez ${data.agents.length}.`}
            />
            <NewAgentForm
              disabled={data.agents.length >= data.limit}
              roles={data.roles}
              voices={data.voices}
              onCreated={async (msg) => {
                setFlash(msg);
                await load();
              }}
              onError={setError}
            />
          </Card>
        </>
      )}
    </>
  );
}

function NewAgentForm({
  disabled,
  roles,
  voices,
  onCreated,
  onError,
}: {
  disabled: boolean;
  roles: string[];
  voices: string[];
  onCreated: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("receptionniste");
  const [voice, setVoice] = useState("marin");
  const [busy, setBusy] = useState(false);

  if (disabled) {
    return (
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        Vous avez atteint la limite de votre offre. Passez à une offre supérieure pour ajouter un agent.
      </p>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        try {
          await api("/api/agents", { body: { name, role, voice } });
          setName("");
          await onCreated("Agent créé.");
        } catch (err) {
          onError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
      style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}
    >
      <div style={{ flex: "1 1 180px" }}>
        <Field label="Nom">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Awa" />
        </Field>
      </div>
      <div style={{ flex: "0 1 170px" }}>
        <Field label="Rôle">
          <select className="field" value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r] ?? r}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div style={{ flex: "0 1 150px" }}>
        <Field label="Voix">
          <select className="field" value={voice} onChange={(e) => setVoice(e.target.value)}>
            {voices.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <button className="btn btn-primary" disabled={busy || !name.trim()} style={{ marginBottom: 12 }}>
        <Plus size={16} />
        Ajouter
      </button>
    </form>
  );
}
