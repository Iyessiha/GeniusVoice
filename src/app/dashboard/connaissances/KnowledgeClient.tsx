"use client";

import { useCallback, useState } from "react";
import { Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { Card, Empty, Field, Notice, SectionTitle, Spinner, useFlash } from "@/components/ui";

type Item = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string | Date;
};

export default function KnowledgeClient({ initial }: { initial: { items: Item[] } }) {
  const [items, setItems] = useState<Item[] | null>(initial.items);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ items: Item[] }>("/api/knowledge");
      setItems(data.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);


  const pinnedCount = items?.filter((i) => i.pinned).length ?? 0;

  return (
    <>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Base de connaissances</h1>
      <p className="muted" style={{ margin: "0 0 18px", fontSize: 14, maxWidth: 680 }}>
        Tout ce que votre agent est autorisé à affirmer. Hors de cette base, il refuse de répondre plutôt que
        d&apos;inventer — c&apos;est la règle qui vous protège. Épinglez les quelques fiches essentielles : elles sont
        toujours présentes à son esprit, les autres sont recherchées à la demande.
      </p>

      {error && <Notice kind="error">{error}</Notice>}
      {flash && <Notice kind="success">{flash}</Notice>}

      <Card style={{ marginBottom: 20 }}>
        <SectionTitle title="Ajouter une fiche" />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim() || !content.trim()) return;
            setBusy(true);
            try {
              await api("/api/knowledge", { body: { title, content, pinned } });
              setTitle("");
              setContent("");
              setPinned(false);
              setFlash("Fiche ajoutée.");
              await load();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Intitulé" hint="La question telle qu'un client la poserait.">
            <input
              className="field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Quels moyens de paiement acceptez-vous ?"
            />
          </Field>
          <Field label="Réponse" hint="Rédigez-la comme vous la diriez au téléphone.">
            <textarea
              className="field"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Nous acceptons les espèces, Orange Money, MTN Money et Wave. Pas de carte bancaire."
            />
          </Field>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 14 }}>
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            Épingler (toujours dans le prompt de l&apos;agent)
          </label>
          <button className="btn btn-primary" disabled={busy || !title.trim() || !content.trim()}>
            <Plus size={16} />
            Ajouter
          </button>
        </form>
      </Card>

      {!items && !error ? (
        <Spinner />
      ) : items && items.length ? (
        <>
          <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            {items.length} fiche{items.length > 1 ? "s" : ""} · {pinnedCount} épinglée{pinnedCount > 1 ? "s" : ""}
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((item) => (
              <Card key={item.id} style={{ padding: 14 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ fontSize: 14 }}>{item.title}</strong>
                    <p className="muted" style={{ margin: "4px 0 0", fontSize: 13, whiteSpace: "pre-wrap" }}>
                      {item.content}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      className="btn btn-ghost"
                      title={item.pinned ? "Désépingler" : "Épingler"}
                      style={{ padding: "5px 9px" }}
                      onClick={async () => {
                        try {
                          await api("/api/knowledge", { method: "PATCH", body: { id: item.id, pinned: !item.pinned } });
                          await load();
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      {item.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                    <button
                      className="btn btn-ghost"
                      title="Supprimer"
                      style={{ padding: "5px 9px", color: "#dc2626" }}
                      onClick={async () => {
                        if (!confirm("Supprimer cette fiche ?")) return;
                        try {
                          await api(`/api/knowledge?id=${item.id}`, { method: "DELETE" });
                          setFlash("Fiche supprimée.");
                          await load();
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Card>
          <Empty
            title="Aucune fiche pour l'instant"
            hint="Commencez par vos cinq questions les plus fréquentes : tarifs, horaires, adresse, moyens de paiement, délais."
          />
        </Card>
      )}
    </>
  );
}
