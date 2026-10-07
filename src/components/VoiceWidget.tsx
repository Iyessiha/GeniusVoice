"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Loader2, AlertCircle, X } from "lucide-react";
import { useRealtimeVoice } from "@/hooks/useRealtimeVoice";

/* Interface vocale complète. Utilisée telle quelle sur nos pages et dans
 * l'iframe embarquée chez les clients : une seule implémentation du
 * protocole, donc un seul endroit à corriger. */

export type VoiceWidgetProps = {
  publicKey: string;
  businessName: string;
  brandColor?: string;
  /** Racine de l'API quand le composant tourne hors de notre origine. */
  apiBase?: string;
  /** true dans l'iframe : le widget gère son propre bouton et sa taille. */
  embedded?: boolean;
  available?: boolean;
};

const PANEL = { w: 368, h: 560 };
const BUBBLE = { w: 220, h: 84 };

function statusLabel(status: string, agentName: string | null): string {
  switch (status) {
    case "requesting_mic":
      return "Autorisez le micro…";
    case "connecting":
      return "Mise en relation…";
    case "connected":
      return "En ligne";
    case "listening":
      return "Je vous écoute";
    case "speaking":
      return `${agentName ?? "L'agent"} parle`;
    case "ended":
      return "Appel terminé";
    case "error":
      return "Erreur";
    default:
      return "Prêt";
  }
}

export default function VoiceWidget({
  publicKey,
  businessName,
  brandColor = "#1e4db7",
  apiBase = "",
  embedded = false,
  available = true,
}: VoiceWidgetProps) {
  const [open, setOpen] = useState(!embedded);
  const [endedReason, setEndedReason] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const voice = useRealtimeVoice({
    publicKey,
    apiBase,
    onEnded: (reason) => setEndedReason(reason),
  });

  const { status, isLive, error, transcript, remainingSeconds, agentName, muted, connect, disconnect, toggleMute } =
    voice;

  /* L'iframe se redimensionne elle-même : le script hôte ne connaît pas
   * nos dimensions internes et n'a pas à les connaître. */
  useEffect(() => {
    if (!embedded) return;
    const size = open ? PANEL : BUBBLE;
    window.parent?.postMessage({ type: "gv:resize", ...size }, "*");
  }, [embedded, open]);

  /* La page hôte peut ouvrir le widget elle-même, par exemple depuis son
   * propre bouton « Nous appeler » : window.GeniusVoice.open(). */
  useEffect(() => {
    if (!embedded) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "gv:open") setOpen(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [embedded]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript.length]);

  const start = useCallback(() => {
    setEndedReason(null);
    void connect();
  }, [connect]);

  const busy = status === "connecting" || status === "requesting_mic";

  /* ── Bulle fermée ── */
  if (embedded && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label={`Parler à ${businessName}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 18px 12px 14px",
          background: brandColor,
          color: "#fff",
          border: "none",
          borderRadius: 999,
          fontWeight: 600,
          fontSize: 14,
          boxShadow: "0 8px 24px rgb(15 37 71 / 0.28)",
        }}
      >
        <span
          style={{
            position: "relative",
            display: "grid",
            placeItems: "center",
            width: 34,
            height: 34,
            borderRadius: 999,
            background: "rgb(255 255 255 / 0.18)",
          }}
        >
          <Mic size={17} />
        </span>
        Parler à notre accueil
      </button>
    );
  }

  const canTalk = available && status !== "error";

  return (
    <div
      className="card"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: embedded ? "100%" : undefined,
        maxHeight: embedded ? "100%" : 560,
        minHeight: embedded ? undefined : 420,
        overflow: "hidden",
        boxShadow: embedded ? "0 12px 36px rgb(15 37 71 / 0.22)" : undefined,
      }}
    >
      {/* ── En-tête ── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 16px",
          background: brandColor,
          color: "#fff",
          flexShrink: 0,
        }}
      >
        <span
          className={isLive ? "gv-pulse" : undefined}
          style={{
            position: "relative",
            width: 9,
            height: 9,
            borderRadius: 999,
            background: isLive ? "#34d399" : "rgb(255 255 255 / 0.5)",
            color: "#34d399",
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <strong style={{ display: "block", fontSize: 14, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {businessName}
          </strong>
          <span style={{ fontSize: 12, opacity: 0.85 }}>{statusLabel(status, agentName)}</span>
        </div>
        {remainingSeconds !== null && remainingSeconds < 120 && isLive && (
          <span style={{ fontSize: 11, opacity: 0.85, flexShrink: 0 }}>
            {Math.max(0, Math.floor(remainingSeconds / 60))} min
          </span>
        )}
        {embedded && (
          <button
            onClick={() => {
              if (isLive) disconnect();
              setOpen(false);
            }}
            aria-label="Fermer"
            style={{ background: "none", border: "none", color: "#fff", opacity: 0.8, padding: 4, display: "grid" }}
          >
            <X size={17} />
          </button>
        )}
      </header>

      {/* ── Corps ── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16, minHeight: 0 }}>
        {!transcript.length && !error && (
          <div style={{ textAlign: "center", padding: "24px 8px" }}>
            <div
              style={{
                display: "grid",
                placeItems: "center",
                width: 58,
                height: 58,
                margin: "0 auto 14px",
                borderRadius: 999,
                background: "var(--color-brand-50)",
                color: brandColor,
              }}
            >
              <Mic size={26} />
            </div>
            <p style={{ margin: "0 0 6px", fontWeight: 600, fontSize: 15 }}>
              {available ? "Posez votre question à voix haute" : "Accueil vocal indisponible"}
            </p>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {available
                ? "Notre accueil peut vous renseigner, prendre un rendez-vous ou transmettre votre demande."
                : "Le service est momentanément interrompu. Merci de nous joindre par téléphone."}
            </p>
          </div>
        )}

        {transcript.map((line) => (
          <div
            key={line.id}
            style={{
              display: "flex",
              justifyContent: line.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                maxWidth: "84%",
                padding: "9px 12px",
                borderRadius: 12,
                fontSize: 14,
                background: line.role === "user" ? brandColor : "var(--color-raised)",
                color: line.role === "user" ? "#fff" : "var(--fg)",
                border: line.role === "user" ? "none" : "1px solid var(--line)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {line.text}
            </div>
          </div>
        ))}

        {error && (
          <div
            role="alert"
            style={{
              display: "flex",
              gap: 9,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgb(220 38 38 / 0.08)",
              border: "1px solid rgb(220 38 38 / 0.25)",
              fontSize: 13,
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2, color: "#dc2626" }} />
            <span>{error}</span>
          </div>
        )}

        {endedReason === "solde_epuise" && (
          <p className="muted" style={{ fontSize: 13, textAlign: "center", marginTop: 12 }}>
            Le temps d&apos;accueil vocal de cet établissement est épuisé.
          </p>
        )}
      </div>

      {/* ── Commandes ── */}
      <footer
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 12,
          borderTop: "1px solid var(--line)",
          flexShrink: 0,
        }}
      >
        {!isLive ? (
          <button
            onClick={start}
            disabled={busy || !canTalk}
            className="btn btn-primary"
            style={{ flex: 1, background: brandColor }}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
            {busy ? "Connexion…" : status === "ended" || status === "error" ? "Rappeler" : "Démarrer l'appel"}
          </button>
        ) : (
          <>
            <button onClick={toggleMute} className="btn btn-ghost" aria-pressed={muted} style={{ flexShrink: 0 }}>
              {muted ? <MicOff size={16} /> : <Mic size={16} />}
              {muted ? "Micro coupé" : "Micro"}
            </button>
            <button onClick={disconnect} className="btn btn-danger" style={{ flex: 1 }}>
              <PhoneOff size={16} />
              Raccrocher
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
