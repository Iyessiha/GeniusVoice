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
 * /api/realtime/tool, le serveur vérifie les outils autorisés. Les appels
 * client restent non fiables : leurs arguments doivent être validés serveur.
 * ──────────────────────────────────────────────────────────────────── */

const CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const DATA_CHANNEL = "oai-events";
const VISITOR_KEY = "gv_visitor";
const CONNECT_TIMEOUT_MS = 45_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_HEARTBEAT_FAILURES = 3;

type VoiceAttempt = {
  controller: AbortController;
  connectTimeout: ReturnType<typeof setTimeout> | null;
  maxDurationTimeout: ReturnType<typeof setTimeout> | null;
};

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
  // Une tentative existe dès le premier clic, pas seulement après création
  // du peer connection. Son identité invalide tous les retours asynchrones.
  const attemptRef = useRef<VoiceAttempt | null>(null);
  const mountedRef = useRef(false);
  const callbacksRef = useRef({ onEnded, onError });
  useEffect(() => {
    callbacksRef.current = { onEnded, onError };
  }, [onEnded, onError]);

  const api = useCallback((path: string) => `${apiBase.replace(/\/$/, "")}${path}`, [apiBase]);

  const post = useCallback(
    async (path: string, body: Record<string, unknown>, signal?: AbortSignal) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (signal?.aborted) abort();
      signal?.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(abort, REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(api(path), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) throw new Error((json.error as string) || `HTTP ${res.status}`);
        return json;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
      }
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

  const finalizeSession = useCallback((session: SessionPayload) => {
    // Best-effort seulement : une clôture navigateur ne remplace pas un
    // watchdog serveur pour les sessions abandonnées (audit A04).
    void fetch(api("/api/realtime/heartbeat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicKey, conversationId: session.conversationId, finalize: true }),
      keepalive: true,
    }).catch(() => {});
  }, [api, publicKey]);

  const teardown = useCallback(
    (reason: string | null, nextStatus: VoiceStatus) => {
      const attempt = attemptRef.current;
      if (!attempt) return;
      // Invalider AVANT de fermer : close/abort peuvent produire des événements.
      attemptRef.current = null;
      attempt.controller.abort();
      if (attempt.connectTimeout) clearTimeout(attempt.connectTimeout);
      if (attempt.maxDurationTimeout) clearTimeout(attempt.maxDurationTimeout);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;

      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) finalizeSession(session);

      const dc = dcRef.current;
      const pc = pcRef.current;
      dcRef.current = null;
      pcRef.current = null;
      if (dc) {
        dc.onopen = dc.onclose = dc.onerror = dc.onmessage = null;
        try { dc.close(); } catch {}
      }
      if (pc) {
        pc.ontrack = pc.onconnectionstatechange = null;
        try { pc.close(); } catch {}
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (audioRef.current) {
        audioRef.current.srcObject = null;
        audioRef.current.remove();
        audioRef.current = null;
      }
      handledCallsRef.current.clear();
      if (mountedRef.current) {
        setMuted(false);
        setStatus(nextStatus);
        callbacksRef.current.onEnded?.(reason);
      }
    },
    [finalizeSession]
  );

  const disconnect = useCallback(() => teardown(null, "ended"), [teardown]);

  const failWith = useCallback(
    (message: string) => {
      if (!attemptRef.current || !mountedRef.current) return;
      setError(message);
      teardown("error", "error");
      callbacksRef.current.onError?.(message);
    },
    [teardown]
  );

  /* ──────────────────────── Appels d'outils ──────────────────────── */

  const runToolCall = useCallback(
    async (callId: string, name: string, rawArgs: string) => {
      if (handledCallsRef.current.has(callId)) return;
      handledCallsRef.current.add(callId);

      const session = sessionRef.current;
      const attempt = attemptRef.current;
      if (!session || !attempt) return;

      let output: string;
      try {
        const json = await post("/api/realtime/tool", {
          publicKey,
          conversationId: session.conversationId,
          name,
          arguments: rawArgs,
        }, attempt.controller.signal);
        output = JSON.stringify(json.result ?? {});
      } catch (e) {
        // On rend l'échec au modèle plutôt que de le laisser attendre :
        // il saura s'en excuser auprès du client.
        output = JSON.stringify({
          error: (e as Error)?.message || "Outil indisponible.",
          consigne: "Dis au client que tu n'arrives pas à effectuer l'opération et propose un transfert.",
        });
      }

      if (attemptRef.current !== attempt || sessionRef.current !== session) return;
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
        failWith("Le service vocal a rencontré une erreur. Vous pouvez rappeler.");
      }
    },
    [failWith, pushLine, runToolCall]
  );

  /* ──────────────────────────── Connexion ──────────────────────────── */

  const connect = useCallback(async () => {
    if (attemptRef.current || !mountedRef.current) return;
    const attempt: VoiceAttempt = {
      controller: new AbortController(), connectTimeout: null, maxDurationTimeout: null,
    };
    attemptRef.current = attempt;
    const isCurrent = () => mountedRef.current && attemptRef.current === attempt;
    attempt.connectTimeout = setTimeout(() => {
      if (isCurrent()) failWith("La connexion prend trop de temps. Vous pouvez rappeler.");
    }, CONNECT_TIMEOUT_MS);
    setError(null);
    setTranscript([]);
    setRemainingSeconds(null);
    setAgentName(null);
    setMuted(false);

    try {
      // Demander le micro AVANT de créer une conversation facturable.
      // getUserMedia n'est pas annulable : stopper un éventuel retour tardif.
      setStatus("requesting_mic");
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        if (isCurrent()) failWith("Micro refusé. Autorisez le microphone pour parler à l'agent.");
        return;
      }
      if (!isCurrent()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setStatus("connecting");

      // Ne pas annuler le minting au clic Annuler : récupérer sa réponse
      // permet de clôturer la conversation éventuellement créée serveur.
      // Un timeout/perte réseau peut toujours laisser un orphelin (A04).
      const session = await post("/api/realtime/session", {
        publicKey, agentId, visitorRef: visitorRef(),
      }) as unknown as SessionPayload;
      if (!isCurrent()) {
        finalizeSession(session);
        return;
      }
      sessionRef.current = session;
      setAgentName(session.agent?.name ?? null);

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      audio.hidden = true;
      document.body.appendChild(audio);
      audioRef.current = audio;
      pc.ontrack = (event) => {
        if (isCurrent()) audio.srcObject = event.streams[0];
      };
      pc.addTrack(stream.getAudioTracks()[0], stream);

      const dc = pc.createDataChannel(DATA_CHANNEL);
      dcRef.current = dc;
      dc.onmessage = (event) => {
        if (!isCurrent()) return;
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(event.data); } catch { return; }
        handleEvent(parsed);
      };
      dc.onerror = () => {
        if (isCurrent()) failWith("Connexion vocale interrompue. Vous pouvez rappeler.");
      };
      dc.onclose = () => {
        if (isCurrent()) failWith("Connexion vocale interrompue. Vous pouvez rappeler.");
      };
      dc.onopen = () => {
        if (!isCurrent()) return;
        if (attempt.connectTimeout) clearTimeout(attempt.connectTimeout);
        attempt.connectTimeout = null;
        setStatus("connected");
        send({
          type: "response.create",
          response: {
            instructions: `Dis exactement, d'un ton chaleureux : « ${session.greeting} » Puis tais-toi et écoute.`,
          },
        });

        // Défense locale uniquement : ne garantit PAS le budget d'un client
        // modifié. La supervision prestataire côté serveur reste nécessaire.
        const maxSeconds = Math.max(1, Math.min(1800, session.limits?.maxSeconds || 1800));
        attempt.maxDurationTimeout = setTimeout(() => {
          if (isCurrent()) teardown("duree_max", "ended");
        }, maxSeconds * 1000);
        const everyMs = Math.max(1, session.limits?.heartbeatSeconds || 15) * 1000;
        let pending = false;
        let failures = 0;
        heartbeatRef.current = setInterval(async () => {
          if (!isCurrent() || pending) return;
          pending = true;
          try {
            const json = await post("/api/realtime/heartbeat", {
              publicKey, conversationId: session.conversationId,
            }, attempt.controller.signal);
            if (!isCurrent()) return;
            failures = 0;
            setRemainingSeconds(Number(json.remainingSeconds ?? 0));
            if (json.shouldStop) teardown(String(json.reason ?? "arret"), "ended");
          } catch {
            if (isCurrent() && ++failures >= MAX_HEARTBEAT_FAILURES) {
              failWith("Connexion au serveur perdue. L'appel a été arrêté ; vous pouvez rappeler.");
            }
          } finally { pending = false; }
        }, everyMs);
      };
      pc.onconnectionstatechange = () => {
        if (isCurrent() && (pc.connectionState === "failed" || pc.connectionState === "disconnected")) {
          failWith("Connexion vocale interrompue. Vous pouvez rappeler.");
        }
      };

      const offer = await pc.createOffer();
      if (!isCurrent()) return;
      await pc.setLocalDescription(offer);
      if (!isCurrent()) return;
      const sdpRes = await fetch(CALLS_URL, {
        method: "POST", body: offer.sdp, signal: attempt.controller.signal,
        headers: { Authorization: `Bearer ${session.clientSecret}`, "Content-Type": "application/sdp" },
      });
      if (!isCurrent()) return;
      if (!sdpRes.ok) throw new Error(`Négociation vocale refusée (${sdpRes.status}). Vous pouvez rappeler.`);
      const sdp = await sdpRes.text();
      if (!isCurrent()) return;
      await pc.setRemoteDescription({ type: "answer", sdp });
    } catch (error) {
      if (isCurrent()) failWith((error as Error)?.message || "Impossible d'établir la liaison vocale.");
    }
  }, [agentId, failWith, finalizeSession, handleEvent, post, publicKey, send, teardown]);

  /* ───────────────────────────── Micro ───────────────────────────── */

  const toggleMute = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

  /* Le nettoyage dépend uniquement de l'identité API/tenant, jamais des
   * callbacks utilisateur ni d'un changement de statut/transcript. */
  useEffect(() => {
    mountedRef.current = true;
    const onHide = () => teardown("page_quittee", "ended");
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      mountedRef.current = false;
      teardown("page_quittee", "ended");
    };
  }, [teardown, agentId]);

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
