"use client";

import { Fragment, useCallback, useState } from "react";
import { api } from "@/lib/client";
import { dateLabel, minutesLabel } from "@/lib/format";
import { Badge, Card, Empty, Notice, Spinner, Table, Td } from "@/components/ui";

type Row = {
  id: string;
  startedAt: string | Date;
  durationSeconds: number;
  status: string;
  outcome: string | null;
  originDomain: string | null;
  agentName: string | null;
};

type Message = { id: string; role: string; content: string; createdAt: string };

const OUTCOME: Record<string, { label: string; tone: "good" | "warn" | "neutral" | "bad" }> = {
  rdv_pris: { label: "Rendez-vous pris", tone: "good" },
  lead_capture: { label: "Prospect capté", tone: "good" },
  transfert: { label: "Transféré", tone: "warn" },
  renseignement: { label: "Renseignement", tone: "neutral" },
  abandon: { label: "Abandon", tone: "bad" },
};

export default function ConversationsClient({ initial }: { initial: { conversations: Row[] } }) {
  const [rows, setRows] = useState<Row[] | null>(initial.conversations);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ conversations: Row[] }>("/api/conversations?days=90&limit=100");
      setRows(data.conversations);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);


  const openTranscript = useCallback(async (id: string) => {
    if (openId === id) {
      setOpenId(null);
      setMessages(null);
      return;
    }
    setOpenId(id);
    setMessages(null);
    try {
      const data = await api<{ messages: Message[] }>(`/api/conversations?id=${id}`);
      setMessages(data.messages);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [openId]);

  return (
    <>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Conversations</h1>
      <p className="muted" style={{ margin: "0 0 18px", fontSize: 14 }}>
        Quatre-vingt-dix derniers jours. Ouvrez une ligne pour lire la transcription.
      </p>

      {error && <Notice kind="error">{error}</Notice>}

      {!rows && !error ? (
        <Spinner />
      ) : rows && rows.length ? (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <Table head={["Date", "Durée", "Agent", "Résultat", "Origine", ""]}>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <Td>{dateLabel(r.startedAt)}</Td>
                  <Td>{minutesLabel(r.durationSeconds)}</Td>
                  <Td>{r.agentName ?? "—"}</Td>
                  <Td>
                    {r.outcome ? (
                      <Badge tone={OUTCOME[r.outcome]?.tone ?? "neutral"}>
                        {OUTCOME[r.outcome]?.label ?? r.outcome}
                      </Badge>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </Td>
                  <Td>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {r.originDomain ?? "—"}
                    </span>
                  </Td>
                  <Td style={{ textAlign: "right" }}>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "4px 9px", fontSize: 12 }}
                      onClick={() => void openTranscript(r.id)}
                    >
                      {openId === r.id ? "Fermer" : "Transcription"}
                    </button>
                  </Td>
                </tr>
                {openId === r.id && (
                  <tr>
                    <Td colSpan={6} style={{ background: "var(--color-raised)" }}>
                      {!messages ? (
                        <Spinner label="Chargement de la transcription…" />
                      ) : messages.length ? (
                        <div style={{ display: "grid", gap: 7, maxWidth: 640 }}>
                          {messages.map((m) => (
                            <div key={m.id} style={{ fontSize: 13 }}>
                              <strong
                                style={{
                                  color: m.role === "user" ? "var(--color-brand-700)" : "var(--color-live-600)",
                                }}
                              >
                                {m.role === "user" ? "Client" : "Agent"}
                              </strong>
                              <span style={{ marginLeft: 8, whiteSpace: "pre-wrap" }}>{m.content}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                          Aucune transcription enregistrée pour cet appel.
                        </p>
                      )}
                    </Td>
                  </tr>
                )}
              </Fragment>
            ))}
          </Table>
        </Card>
      ) : (
        <Card>
          <Empty title="Aucune conversation" hint="Installez le widget sur votre site pour recevoir vos premiers appels." />
        </Card>
      )}
    </>
  );
}
