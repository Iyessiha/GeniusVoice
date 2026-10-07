"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { Card, Field, Notice } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Card style={{ padding: 24 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 21 }}>Connexion</h1>
      <p className="muted" style={{ margin: "0 0 18px", fontSize: 14 }}>
        Accédez à votre accueil vocal.
      </p>

      {error && <Notice kind="error">{error}</Notice>}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api("/api/auth/login", { body: { email, password } });
            router.push("/dashboard");
            router.refresh();
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <Field label="Adresse e-mail">
          <input
            className="field"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Mot de passe">
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>

      <p className="muted" style={{ fontSize: 13, marginTop: 16, marginBottom: 0, textAlign: "center" }}>
        Pas encore de compte ?{" "}
        <Link href="/auth/signup" style={{ color: "var(--color-brand-600)", fontWeight: 600 }}>
          Créer un compte
        </Link>
      </p>
    </Card>
  );
}
