// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRealtimeVoice } from "@/hooks/useRealtimeVoice";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class FakeChannel {
  readyState = "open";
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  close = vi.fn();
  send = vi.fn();
}
class FakePeer {
  static instances: FakePeer[] = [];
  channel = new FakeChannel();
  connectionState = "connected";
  ontrack = null;
  onconnectionstatechange: (() => void) | null = null;
  constructor() { FakePeer.instances.push(this); }
  addTrack = vi.fn();
  createDataChannel = vi.fn(() => this.channel);
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "offer" }));
  setLocalDescription = vi.fn(async () => {});
  setRemoteDescription = vi.fn(async () => { this.channel.onopen?.(); });
  close = vi.fn();
}

const session = (id = "conv-1") => ({
  conversationId: id, clientSecret: "ephemeral-test", greeting: "Bonjour", agent: { name: "Awa" },
  limits: { maxSeconds: 1800, heartbeatSeconds: 15 },
});
const track = () => ({ enabled: true, stop: vi.fn() });
const stream = (t = track()) => ({ getTracks: () => [t], getAudioTracks: () => [t] });
let media: ReturnType<typeof stream>;
let getUserMedia: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;
function requests(path: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes(path));
}
function finalizations() {
  return requests("/heartbeat").filter(([, init]) => JSON.parse(init.body).finalize);
}

beforeEach(() => {
  FakePeer.instances = [];
  media = stream();
  getUserMedia = vi.fn(async () => media);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal("RTCPeerConnection", FakePeer);
  fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/session")) return Response.json(session());
    if (url.includes("/calls")) return new Response("answer");
    if (url.includes("/tool")) return Response.json({ result: { ok: true } });
    return Response.json({ remainingSeconds: 500, shouldStop: false });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

function mount() {
  const ended = vi.fn();
  const errors = vi.fn();
  const hook = renderHook(({ revision }) => useRealtimeVoice({
    publicKey: "gv_test",
    // Intentionnellement instable : le hook doit tolérer ses appelants.
    onEnded: (reason) => ended(revision, reason),
    onError: (message) => errors(revision, message),
  }), { initialProps: { revision: 1 }, wrapper });
  return { ...hook, ended, errors };
}

async function connect(hook: ReturnType<typeof mount>) {
  await act(async () => { await hook.result.current.connect(); });
}

describe("cycle de vie vocal", () => {
  it("ne raccroche pas aux re-rendus, transcripts, mute et nouvelles identités de callback (StrictMode)", async () => {
    const hook = mount();
    await connect(hook);
    expect(hook.result.current.status).toBe("connected");
    hook.rerender({ revision: 2 });
    act(() => hook.result.current.toggleMute());
    const peer = FakePeer.instances[0];
    await act(async () => peer.channel.onmessage?.({ data: JSON.stringify({
      type: "response.output_audio_transcript.done", transcript: "Bonjour !",
    }) }));
    expect(hook.result.current.transcript).toHaveLength(1);
    expect(hook.result.current.muted).toBe(true);
    expect(peer.close).not.toHaveBeenCalled();
    expect(finalizations()).toHaveLength(0);
    act(() => { hook.result.current.disconnect(); hook.result.current.disconnect(); });
    expect(finalizations()).toHaveLength(1);
    expect(hook.ended).toHaveBeenCalledExactlyOnceWith(2, null);
    expect(media.getTracks()[0].stop).toHaveBeenCalledOnce();
    expect(document.querySelector("audio")).toBeNull();
  });

  it("ne crée pas de session avant consentement micro et bloque le double clic", async () => {
    const pending = deferred<ReturnType<typeof stream>>();
    getUserMedia.mockReturnValue(pending.promise);
    const hook = mount();
    let first!: Promise<void>;
    act(() => { first = hook.result.current.connect(); void hook.result.current.connect(); });
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(requests("/session")).toHaveLength(0);
    expect(hook.result.current.status).toBe("requesting_mic");
    await act(async () => { pending.resolve(media); await first; });
    expect(requests("/session")).toHaveLength(1);
    expect(FakePeer.instances).toHaveLength(1);
    expect(hook.result.current.isLive).toBe(true);
  });

  it("annule une permission micro lente et stoppe ses tracks si elle arrive après annulation", async () => {
    const pending = deferred<ReturnType<typeof stream>>();
    getUserMedia.mockReturnValue(pending.promise);
    const hook = mount();
    let connection!: Promise<void>;
    act(() => { connection = hook.result.current.connect(); });
    act(() => hook.result.current.disconnect());
    await act(async () => { pending.resolve(media); await connection; });
    expect(media.getTracks()[0].stop).toHaveBeenCalledOnce();
    expect(requests("/session")).toHaveLength(0);
    expect(FakePeer.instances).toHaveLength(0);
    expect(hook.result.current.status).toBe("ended");
  });

  it("clôture une réponse de session tardive sans rouvrir de peer connection", async () => {
    const pending = deferred<Response>();
    fetchMock.mockImplementation(async (url: string) => url.includes("/session") ? pending.promise : Response.json({}));
    const hook = mount();
    let connection!: Promise<void>;
    await act(async () => { connection = hook.result.current.connect(); });
    act(() => hook.result.current.disconnect());
    await act(async () => { pending.resolve(Response.json(session())); await connection; });
    expect(FakePeer.instances).toHaveLength(0);
    expect(finalizations()).toHaveLength(1);
    expect(hook.result.current.status).toBe("ended");
  });

  it("ignore l'erreur d'une ancienne tentative après un nouvel appel réussi", async () => {
    const oldResponse = deferred<Response>();
    fetchMock.mockImplementationOnce(() => oldResponse.promise);
    const hook = mount();
    let oldConnection!: Promise<void>;
    await act(async () => { oldConnection = hook.result.current.connect(); });
    act(() => hook.result.current.disconnect());
    await connect(hook);
    await act(async () => { oldResponse.reject(new Error("ancienne erreur")); await oldConnection; });
    expect(hook.result.current.isLive).toBe(true);
    expect(hook.errors).not.toHaveBeenCalled();
    expect(FakePeer.instances[0].close).not.toHaveBeenCalled();
  });

  it("permet de rappeler après un refus du micro et ne facture pas ce refus", async () => {
    getUserMedia.mockRejectedValueOnce(new Error("NotAllowedError"));
    const hook = mount();
    await connect(hook);
    expect(hook.result.current.status).toBe("error");
    expect(requests("/session")).toHaveLength(0);
    await connect(hook);
    expect(hook.result.current.status).toBe("connected");
    expect(hook.result.current.error).toBeNull();
  });

  it("interrompt la négociation SDP et empêche sa réponse tardive de réactiver l'appel", async () => {
    const pending = deferred<Response>();
    fetchMock.mockImplementation(async (url: string) => url.includes("/calls") ? pending.promise : Response.json(session()));
    const hook = mount();
    let connection!: Promise<void>;
    await act(async () => { connection = hook.result.current.connect(); });
    const signal = requests("/calls")[0][1].signal as AbortSignal;
    act(() => hook.result.current.disconnect());
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(new Response("answer")); await connection; });
    expect(FakePeer.instances[0].setRemoteDescription).not.toHaveBeenCalled();
    expect(finalizations()).toHaveLength(1);
    expect(hook.result.current.status).toBe("ended");
  });

  it.each(["pagehide", "unmount"])("clôture et libère les ressources une seule fois sur %s", async (mode) => {
    const hook = mount();
    await connect(hook);
    if (mode === "pagehide") act(() => { window.dispatchEvent(new Event("pagehide")); });
    hook.unmount();
    expect(finalizations()).toHaveLength(1);
    expect(FakePeer.instances[0].close).toHaveBeenCalledOnce();
    expect(media.getTracks()[0].stop).toHaveBeenCalledOnce();
  });

  it("expire une permission micro bloquée et arrête le retour tardif", async () => {
    vi.useFakeTimers();
    const pending = deferred<ReturnType<typeof stream>>();
    getUserMedia.mockReturnValue(pending.promise);
    const hook = mount();
    let connection!: Promise<void>;
    act(() => { connection = hook.result.current.connect(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });
    expect(hook.result.current.status).toBe("error");
    await act(async () => { pending.resolve(media); await connection; });
    expect(media.getTracks()[0].stop).toHaveBeenCalledOnce();
    expect(FakePeer.instances).toHaveLength(0);
  });

  it("ne laisse pas l'appel continuer après trois échecs de relève", async () => {
    vi.useFakeTimers();
    const hook = mount();
    await connect(hook);
    fetchMock.mockImplementation(async () => { throw new Error("network down"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });
    expect(hook.result.current.status).toBe("error");
    expect(hook.result.current.error).toContain("serveur perdue");
    expect(FakePeer.instances[0].close).toHaveBeenCalledOnce();
  });

  it("applique une durée maximale locale même si le serveur ne demande pas l'arrêt", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/session")) return Response.json({ ...session(), limits: { maxSeconds: 30, heartbeatSeconds: 15 } });
      if (url.includes("/calls")) return new Response("answer");
      return Response.json({ shouldStop: false, remainingSeconds: 500 });
    });
    const hook = mount();
    await connect(hook);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(hook.result.current.status).toBe("ended");
    expect(hook.ended).toHaveBeenCalledWith(1, "duree_max");
    expect(finalizations()).toHaveLength(1);
  });

  it("un résultat outil tardif ne peut pas être transmis à une nouvelle session", async () => {
    const pending = deferred<Response>();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/session")) return Response.json(session());
      if (url.includes("/calls")) return new Response("answer");
      if (url.includes("/tool")) return pending.promise;
      return Response.json({});
    });
    const hook = mount();
    await connect(hook);
    await act(async () => FakePeer.instances[0].channel.onmessage?.({ data: JSON.stringify({
      type: "response.output_item.done", item: { type: "function_call", call_id: "tool-1", name: "capture_lead", arguments: "{}" },
    }) }));
    act(() => hook.result.current.disconnect());
    await connect(hook);
    await act(async () => { pending.resolve(Response.json({ result: { ok: true } })); });
    const outputs = FakePeer.instances[1].channel.send.mock.calls.filter(([raw]) => JSON.parse(raw).type === "conversation.item.create");
    expect(outputs).toHaveLength(0);
    expect(hook.result.current.isLive).toBe(true);
  });
});
