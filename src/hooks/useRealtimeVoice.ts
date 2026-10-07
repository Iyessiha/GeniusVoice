"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────────────────
 * Transport WebRTC vers l'API Realtime d'OpenAI.
 *
 * Deux points qui cassent toutes les intégrations écrites avant la GA :
 *   • le SDP s'échange sur /v1/realtime/calls (et non /v1/realtime?model=)
 *   • le jeton vient de /v1/realtime/client_secrets, émis par NOTRE serveur
 * La clé OpenAI ne touche jamais le navigateur.
 *
 * Les outils ne s'exécutent pas ici : le modèle demande, on relaie à
 * /api/realtime/tool, le serveur décide. Un visiteur qui bidouille la
 * console ne peut donc rien écrire en base.
 * ──────────────────────────────────────────────────────────────────── */

const CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const DATA_CHANNEL = "oai-events";
const VISITOR_KEY = "gv_visitor";

export type VoiceStatus =
  | "idle"
  | "requesting_mic"
  | "connecting"
  | "connected"
  | "listening"
  | "speaking"
  | "ended"
  | "error";

export type TranscriptLine = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export type UseRealtimeVoiceOptions = {
  publicKey: string;
  /** Racine de l'API. Vide = même origine (notre app). Le widget embarqué
   *  la renseigne avec l'URL de l'application. */
  apiBase?: string;
  agentId?: string;
  onEnded?: (reason: string | null) => void;
  onError?: (message: string) => void;
};

type SessionPayload = {
  clientSecret: string;
  model: string;
  greeting: string;
  conversationId: string;
  agent: { id: string; name: string; voice: string };
  business: { name: string; brandColor: string };
  limits: { maxSeconds: number; heartbeatSeconds: number };
};

function visitorRef(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const ref = `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(VISITOR_KEY, ref);
    return ref;
  } catch {
    // Mode privé ou stockage bloqué : la conversation reste anonyme.
    return `v_${Math.random().toString(36).slice(2)}`;
  }
}

export function useRealtimeVoice(opts: UseRealtimeVoiceOptions) {
  const { publicKey, apiBase = "", agentId, onEnded, onError } = opts;

  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<SessionPayload | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Évite qu'un double événement rejoue deux fois le même appel d'outil. */
  const handledCallsRef = useRef<Set<string>>(new Set());
  /** Garde contre une fermeture concurrente (bouton + solde épuisé). */
  const closingRef = useRef(false);

  const api = useCallback((path: string) => `${apiBase.replace(/\/$/, "")}${path}`, [apiBase]);

  const post = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      const res = await fetch(api(path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error((json.error as string) || `HTTP ${res.status}`);
      return json;
    },
    [api]
  );

  const send = useCallback((event: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (dc?.readyState === "open") dc.send(JSON.stringify(event));
  }, []);

  const pushLine = useCallback(
    (role: "user" | "assistant", text: string) => {
      const clean = text.trim();
      if (!clean) return;
      setTranscript((prev) => [...prev, { id: `${role}-${Date.now()}-${prev.length}`, role, text: clean }]);

      const session = sessionRef.current;
      if (!session) return;
      // Historique best-effort : une perte de réplique ne doit jamais
      // interrompre la conversation en cours.
      void post("/api/realtime/transcript", {
        publicKey,
        conversationId: session.conversationId,
        role,
        content: clean,
      }).catch(() => {});
    },
    [post, publicKey]
  );

  /* ─────────────────────────── Fermeture ─────────────────────────── */

  const teardown = useCallback(
    (reason: string | null, nextStatus: VoiceStatus) => {
      if (closingRef.current) return;
      closingRef.current = true;

      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      const session = sessionRef.current;
      if (session) {
        // Clôture comptable. keepalive permet au débit final de partir même
        // si l'onglet se ferme dans la seconde.
        const payload = JSON.stringify({
          publicKey,
          conversationId: session.conversationId,
          finalize: true,
        });
        try {
          void fetch(api("/api/realtime/heartbeat"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        } catch {
          /* rien à faire : le serveur rattrapera via started_at */
        }
      }

      try {
        dcRef.current?.close();
      } catch {}
      try {
        pcRef.current?.close();
      } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioRef.current) {
        audioRef.current.srcObject = null;
        audioRef.current.remove();
      }

      dcRef.current = null;
      pcRef.current = null;
      streamRef.current = null;
      audioRef.current = null;
      sessionRef.current = null;
      handledCallsRef.current.clear();

      setStatus(nextStatus);
      onEnded?.(reason);
      closingRef.current = false;
    },
    [api, onEnded, publicKey]
  );

  const disconnect = useCallback(() => {
    teardown(null, "ended");
  }, [teardown]);

  const failWith = useCallback(
    (message: string) => {
      setError(message);
      onError?.(message);
      teardown("error", "error");
    },
    [onError, teardown]
  );

  /* ──────────────────────── Appels d'outils ──────────────────────── */

  const runToolCall = useCallback(
    async (callId: string, name: string, rawArgs: string) => {
      if (handledCallsRef.current.has(callId)) return;
      handledCallsRef.current.add(callId);

      const session = sessionRef.current;
      if (!session) return;

      let output: string;
      try {
        const json = await post("/api/realtime/tool", {
          publicKey,
          conversationId: session.conversationId,
          name,
          arguments: rawArgs,
        });
        output = JSON.stringify(json.result ?? {});
      } catch (e) {
        // On rend l'échec au modèle plutôt que de le laisser attendre :
        // il saura s'en excuser auprès du client.
        output = JSON.stringify({
          error: (e as Error)?.message || "Outil indisponible.",
          consigne: "Dis au client que tu n'arrives pas à effectuer l'opération et propose un transfert.",
        });
      }

      send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output } });
      send({ type: "response.create" });
    },
    [post, publicKey, send]
  );

  /* ─────────────────── Événements du canal de données ─────────────────── */

  const handleEvent = useCallback(
    (evt: Record<string, unknown>) => {
      const type = String(evt.type ?? "");

      // Transcription de ce que dit le visiteur.
      if (type === "conversation.item.input_audio_transcription.completed") {
        pushLine("user", String(evt.transcript ?? ""));
        return;
      }

      // Transcription de ce que dit l'agent. Le nom a changé à la GA ;
      // on accepte les deux pour survivre aux révisions.
      if (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") {
        pushLine("assistant", String(evt.transcript ?? ""));
        return;
      }

      if (type === "output_audio_buffer.started" || type === "response.output_audio.delta") {
        setStatus("speaking");
        return;
      }
      if (type === "output_audio_buffer.stopped" || type === "response.done") {
        setStatus("listening");
      }
      if (type === "input_audio_buffer.speech_started") {
        setStatus("listening");
        return;
      }

      // Appel d'outil : la voie fiable est l'item terminé, qui porte à la
      // fois le nom, le call_id et les arguments complets.
      if (type === "response.output_item.done") {
        const item = evt.item as Record<string, unknown> | undefined;
        if (item?.type === "function_call") {
          void runToolCall(String(item.call_id ?? ""), String(item.name ?? ""), String(item.arguments ?? "{}"));
        }
        return;
      }

      // Filet de sécurité : certaines réponses ne livrent les appels que
      // dans response.done.
      if (type === "response.done") {
        const resp = evt.response as { output?: Array<Record<string, unknown>> } | undefined;
        for (const item of resp?.output ?? []) {
          if (item?.type === "function_call") {
            void runToolCall(String(item.call_id ?? ""), String(item.name ?? ""), String(item.arguments ?? "{}"));
          }
        }
        return;
      }

      if (type === "error") {
        const err = evt.error as { message?: string } | undefined;
        console.error("[realtime] erreur serveur :", err?.message ?? evt);
      }
    },
    [pushLine, runToolCall]
  );

  /* ──────────────────────────── Connexion ──────────────────────────── */

  const connect = useCallback(async () => {
    if (pcRef.current) return;
    setError(null);
    setTranscript([]);

    let session: SessionPayload;
    try {
      setStatus("connecting");
      const json = (await post("/api/realtime/session", {
        publicKey,
        agentId,
        visitorRef: visitorRef(),
      })) as unknown as SessionPayload;
      session = json;
      sessionRef.current = json;
      setAgentName(json.agent?.name ?? null);
    } catch (e) {
      failWith((e as Error)?.message || "Service vocal indisponible.");
      return;
    }

    let stream: MediaStream;
    try {
      setStatus("requesting_mic");
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
    } catch {
      failWith("Micro refusé. Autorisez le microphone pour parler à l'agent.");
      return;
    }

    try {
      setStatus("connecting");
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audioRef.current = audio;
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0];
      };

      pc.addTrack(stream.getTracks()[0]);

      const dc = pc.createDataChannel(DATA_CHANNEL);
      dcRef.current = dc;

      dc.onmessage = (e) => {
        try {
          handleEvent(JSON.parse(e.data));
        } catch {
          /* trame non-JSON : rien à traiter */
        }
      };

      dc.onopen = () => {
        setStatus("connected");
        // L'agent parle en premier : un silence à l'ouverture fait
        // raccrocher. On dicte la phrase d'accueil plutôt que de l'espérer.
        send({
          type: "response.create",
          response: {
            instructions: `Dis exactement, d'un ton chaleureux : « ${session.greeting} » Puis tais-toi et écoute.`,
          },
        });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          failWith("Connexion vocale interrompue.");
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(CALLS_URL, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${session.clientSecret}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpRes.ok) {
        throw new Error(`négociation refusée (${sdpRes.status})`);
      }
      await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });

      setStatus("listening");

      // Compteur : c'est le serveur qui décide quand on raccroche.
      const everyMs = (session.limits?.heartbeatSeconds ?? 15) * 1000;
      heartbeatRef.current = setInterval(async () => {
        const current = sessionRef.current;
        if (!current) return;
        try {
          const json = await post("/api/realtime/heartbeat", {
            publicKey,
            conversationId: current.conversationId,
          });
          setRemainingSeconds(Number(json.remainingSeconds ?? 0));
          if (json.shouldStop) teardown(String(json.reason ?? "arret"), "ended");
        } catch {
          /* perte réseau passagère : la relève suivante rattrapera */
        }
      }, everyMs);
    } catch (e) {
      failWith((e as Error)?.message || "Impossible d'établir la liaison vocale.");
    }
  }, [agentId, failWith, handleEvent, post, publicKey, send, teardown]);

  /* ───────────────────────────── Micro ───────────────────────────── */

  const toggleMute = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

  /* Fermeture propre : onglet quitté, composant démonté. */
  useEffect(() => {
    const onHide = () => {
      if (sessionRef.current) teardown("page_quittee", "ended");
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      onHide();
    };
  }, [teardown]);

  const isLive = status === "connected" || status === "listening" || status === "speaking";

  return {
    status,
    isLive,
    error,
    transcript,
    remainingSeconds,
    agentName,
    muted,
    connect,
    disconnect,
    toggleMute,
  };
}

export default useRealtimeVoice;
