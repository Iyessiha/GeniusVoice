"use client";

import { useCallback, useState } from "react";
import { Check, Copy, Plus, X } from "lucide-react";
import { api } from "@/lib/client";
import { Card, Field, Notice, SectionTitle, Spinner, useFlash } from "@/components/ui";
import VoiceWidget from "@/components/VoiceWidget";

type Business = {
  id: string;
  name: string;
  slug: string;
  publicKey: string;
  brandColor: string;
  allowedDomains: string[];
  timezone: string;
};

type Payload = { business: Business; embedSnippet: string; publicUrl: string };

export default function WidgetClient({ initial }: { initial: Payload }) {
  const [data, setData] = useState<Payload | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const [domains, setDomains] = useState<string[]>(initial.business.allowedDomains);
  const [newDomain, setNewDomain] = useState("");
  const [color, setColor] = useState(initial.business.brandColor);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const payload = await api<Payload>("/api/business");
      setData(payload);
      setDomains(payload.business.allowedDomains);
      setColor(payload.business.brandColor);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);


  const saveSettings = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/business", { method: "PATCH", body: { allowedDomains: domains, brandColor: color } });
      setFlash("Réglages enregistrés.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [color, domains, load, setFlash]);

  if (!data && !error) return <Spinner />;

  return (
    <>
      <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>Intégration du widget</h1>
      <p className="muted" style={{ margin: "0 0 18px", fontSize: 14, maxWidth: 680 }}>
        Une ligne à coller dans votre site. Le widget s&apos;affiche en bas à droite et ne consomme aucune minute tant
        que personne ne lance d&apos;appel.
      </p>

      {error && <Notice kind="error">{error}</Notice>}
      {flash && <Notice kind="success">{flash}</Notice>}

      {data && (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1fr)" }}>
          <Card>
            <SectionTitle title="Code à coller" hint="Juste avant la balise </body> de votre site." />
            <pre
              style={{
                margin: 0,
                padding: 13,
                background: "var(--color-raised)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                fontSize: 12.5,
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {data.embedSnippet}
            </pre>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(data.embedSnippet);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2200);
                  } catch {
                    setError("Copie impossible. Sélectionnez le code à la main.");
                  }
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copié" : "Copier le code"}
              </button>
              <a className="btn btn-ghost" href={data.publicUrl} target="_blank" rel="noreferrer">
                Voir la page publique
              </a>
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
              Options : <code>data-position=&quot;left&quot;</code> pour placer le widget à gauche,{" "}
              <code>data-offset=&quot;30&quot;</code> pour l&apos;écarter des bords. Depuis votre propre code,{" "}
              <code>window.GeniusVoice.open()</code> ouvre le widget.
            </p>
          </Card>

          <Card>
            <SectionTitle
              title="Domaines autorisés"
              hint="Votre clé est visible dans le code source de votre site : c'est normal. Cette liste est ce qui empêche un tiers de l'utiliser et de consommer vos minutes."
            />

            {domains.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
                {domains.map((d) => (
                  <span
                    key={d}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 7px 4px 10px",
                      borderRadius: 999,
                      fontSize: 13,
                      background: "var(--color-brand-50)",
                      color: "var(--color-brand-700)",
                      fontWeight: 600,
                    }}
                  >
                    {d}
                    <button
                      onClick={() => setDomains(domains.filter((x) => x !== d))}
                      aria-label={`Retirer ${d}`}
                      style={{ background: "none", border: "none", display: "grid", color: "inherit", padding: 2 }}
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <Notice kind="error">
                Aucun domaine autorisé : le widget ne fonctionnera que depuis GeniusVoice, pas sur votre site. Ajoutez
                votre domaine ci-dessous.
              </Notice>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const clean = newDomain
                  .trim()
                  .toLowerCase()
                  .replace(/^https?:\/\//, "")
                  .replace(/\/.*$/, "");
                if (!clean) return;
                if (!/^[a-z0-9.*-]+(:\d+)?$/.test(clean)) {
                  setError("Domaine invalide. Exemple attendu : clinique-abc.ci");
                  return;
                }
                if (!domains.includes(clean)) setDomains([...domains, clean]);
                setNewDomain("");
              }}
              style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}
            >
              <div style={{ flex: "1 1 240px" }}>
                <Field label="Ajouter un domaine" hint="Préfixez d'une étoile pour inclure les sous-domaines : *.clinique-abc.ci">
                  <input
                    className="field"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    placeholder="clinique-abc.ci"
                  />
                </Field>
              </div>
              <button className="btn btn-ghost" style={{ marginBottom: 12 }}>
                <Plus size={16} />
                Ajouter
              </button>
            </form>

            <Field label="Couleur du widget">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{ width: 52, height: 38, border: "1px solid var(--line)", borderRadius: 8, background: "none" }}
                />
                <input
                  className="field"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{ maxWidth: 140 }}
                />
              </div>
            </Field>

            <button className="btn btn-primary" disabled={busy} onClick={() => void saveSettings()}>
              Enregistrer
            </button>
          </Card>

          <Card>
            <SectionTitle
              title="Tester l'agent"
              hint="Un test consomme vos minutes exactement comme un vrai appel : c'est le même chemin, le même agent, la même facturation."
            />
            {testing ? (
              <div style={{ maxWidth: 380 }}>
                <VoiceWidget
                  publicKey={data.business.publicKey}
                  businessName={data.business.name}
                  brandColor={color}
                />
                <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setTesting(false)}>
                  Fermer le test
                </button>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={() => setTesting(true)}>
                Lancer un test
              </button>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
