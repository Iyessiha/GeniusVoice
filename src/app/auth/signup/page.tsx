"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { Card, Field, Notice } from "@/components/ui";
import { INDUSTRIES } from "@/lib/industries";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    businessName: "",
    industry: "hopital",
    displayName: "",
    email: "",
    phone: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <Card style={{ padding: 24 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 21 }}>Créer votre accueil vocal</h1>
      <p className="muted" style={{ margin: "0 0 18px", fontSize: 14 }}>
        Vingt minutes offertes, sans carte bancaire. Votre agent est opérationnel dès l&apos;inscription.
      </p>

      {error && <Notice kind="error">{error}</Notice>}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api("/api/auth/signup", { body: form });
            router.push("/dashboard");
            router.refresh();
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <Field label="Nom de l'établissement">
          <input
            className="field"
            required
            value={form.businessName}
            onChange={set("businessName")}
            placeholder="Clinique Saint-Jean"
          />
        </Field>

        <Field label="Secteur" hint="Détermine le cadrage de votre agent : ce qu'il priorise et ce qu'il s'interdit de dire.">
          <select className="field" value={form.industry} onChange={set("industry")}>
            {INDUSTRIES.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Votre nom">
          <input className="field" value={form.displayName} onChange={set("displayName")} autoComplete="name" />
        </Field>

        <Field label="Adresse e-mail">
          <input
            className="field"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={set("email")}
          />
        </Field>

        <Field label="Téléphone" hint="Numéro vers lequel l'agent transférera les appels délicats.">
          <input className="field" value={form.phone} onChange={set("phone")} placeholder="+225 ..." />
        </Field>

        <Field label="Mot de passe" hint="Huit caractères minimum.">
          <input
            className="field"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
          />
        </Field>

        <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? "Création…" : "Créer mon accueil vocal"}
        </button>
      </form>

      <p className="muted" style={{ fontSize: 13, marginTop: 16, marginBottom: 0, textAlign: "center" }}>
        Déjà inscrit ?{" "}
        <Link href="/auth/login" style={{ color: "var(--color-brand-600)", fontWeight: 600 }}>
          Se connecter
        </Link>
      </p>
    </Card>
  );
}
