import { createHash } from "node:crypto";
import type { Agent, Business } from "@/db/schema";
import { buildGreeting, buildInstructions } from "@/lib/agent-prompt";
import { toolDefsFor } from "@/lib/tools";

/** Modèle Realtime. gpt-realtime est l'alias stable depuis la GA ;
 *  l'ancien chemin /v1/realtime/sessions de la préversion ne répond plus. */
const MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1";
const CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

export const REALTIME_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;

export type RealtimeVoice = (typeof REALTIME_VOICES)[number];

export function isVoice(v: unknown): v is RealtimeVoice {
  return typeof v === "string" && (REALTIME_VOICES as readonly string[]).includes(v);
}

/** Identifiant de sécurité transmis à OpenAI : stable par business, sans
 *  rien révéler de nos identifiants internes. */
function safetyIdentifier(businessId: string): string {
  return createHash("sha256").update(`geniusvoice:${businessId}`).digest("hex").slice(0, 48);
}

export type MintedSession = {
  clientSecret: string;
  expiresAt: number | null;
  model: string;
  greeting: string;
};

/** Émet un secret client éphémère. La clé OpenAI réelle ne quitte jamais
 *  le serveur : le navigateur ne reçoit que ce jeton, déjà limité à cette
 *  session, à ces consignes et à ces outils. */
export async function mintClientSecret(business: Business, agent: Agent): Promise<MintedSession> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY manquant");

  const instructions = await buildInstructions({ business, agent });
  const tools = toolDefsFor(agent);

  const body = {
    session: {
      type: "realtime",
      model: MODEL,
      instructions,
      audio: {
        input: {
          format: { type: "audio/pcm", rate: 24000 },
          // Le VAD sémantique coupe sur le sens de la phrase et non sur un
          // silence : indispensable au téléphone, où les gens hésitent.
          turn_detection: { type: "semantic_vad" },
          // Sans transcription, le tableau de bord n'a aucune trace de ce
          // que le client a dit.
          transcription: { model: "gpt-4o-mini-transcribe", language: business.locale === "en" ? "en" : "fr" },
        },
        output: { voice: agent.voice },
      },
      tools,
      tool_choice: "auto",
    },
  };

  const res = await fetch(CLIENT_SECRETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": safetyIdentifier(business.id),
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail =
      (json.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`;
    console.error("[realtime] client_secrets échoué :", detail);
    throw new Error(detail);
  }

  // La GA renvoie { value, expires_at, session }. On tolère une variante
  // encapsulée pour ne pas casser à la prochaine révision.
  const value =
    (typeof json.value === "string" && json.value) ||
    ((json.client_secret as { value?: string } | undefined)?.value ?? null);
  if (!value) {
    console.error("[realtime] réponse inattendue :", JSON.stringify(json).slice(0, 300));
    throw new Error("Jeton éphémère absent de la réponse OpenAI");
  }

  const expires = json.expires_at;
  return {
    clientSecret: value,
    expiresAt: typeof expires === "number" ? expires : null,
    model: MODEL,
    greeting: buildGreeting({ business, agent }),
  };
}
