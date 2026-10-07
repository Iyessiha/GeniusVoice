"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="card" style={{ padding: 18, ...style }}>
      {children}
    </div>
  );
}

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 650 }}>{title}</h2>
      {hint && (
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 5 }}>{label}</span>
      {children}
      {hint && (
        <span className="muted" style={{ display: "block", fontSize: 12, marginTop: 4 }}>
          {hint}
        </span>
      )}
    </label>
  );
}

/** Bandeau d'état. Les messages d'erreur d'API s'affichent tels quels :
 *  ils sont rédigés pour l'utilisateur, pas pour les journaux. */
export function Notice({ kind, children }: { kind: "error" | "success"; children: ReactNode }) {
  const error = kind === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      style={{
        display: "flex",
        gap: 9,
        alignItems: "flex-start",
        padding: "10px 12px",
        marginBottom: 14,
        borderRadius: 10,
        fontSize: 13,
        background: error ? "rgb(220 38 38 / 0.08)" : "rgb(5 150 105 / 0.1)",
        border: `1px solid ${error ? "rgb(220 38 38 / 0.25)" : "rgb(5 150 105 / 0.28)"}`,
      }}
    >
      {error ? (
        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1, color: "#dc2626" }} />
      ) : (
        <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1, color: "#059669" }} />
      )}
      <span>{children}</span>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="muted" style={{ display: "flex", alignItems: "center", gap: 8, padding: "18px 0", fontSize: 14 }}>
      <Loader2 size={16} className="animate-spin" />
      {label ?? "Chargement…"}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ textAlign: "center", padding: "32px 12px" }}>
      <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{title}</p>
      {hint && (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const tones = {
    neutral: { bg: "var(--color-brand-50)", fg: "var(--color-brand-700)" },
    good: { bg: "rgb(5 150 105 / 0.12)", fg: "#047857" },
    warn: { bg: "rgb(217 119 6 / 0.12)", fg: "#b45309" },
    bad: { bg: "rgb(220 38 38 / 0.1)", fg: "#b91c1c" },
  }[tone];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: tones.bg,
        color: tones.fg,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** Message éphémère après une action réussie. */
export function useFlash(ms = 3200) {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), ms);
    return () => clearTimeout(t);
  }, [message, ms]);
  return [message, setMessage] as const;
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="muted"
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  borderBottom: "1px solid var(--line)",
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  style,
  colSpan,
}: {
  children: ReactNode;
  style?: React.CSSProperties;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{ padding: "10px", borderBottom: "1px solid var(--line)", verticalAlign: "top", ...style }}
    >
      {children}
    </td>
  );
}
