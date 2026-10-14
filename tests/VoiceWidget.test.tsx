// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VoiceWidget from "@/components/VoiceWidget";

const { voice } = vi.hoisted(() => ({ voice: {
  status: "error", isLive: false, error: "Micro refusé", transcript: [], remainingSeconds: null,
  agentName: null, muted: false, connect: vi.fn(), disconnect: vi.fn(), toggleMute: vi.fn(),
} }));
vi.mock("@/hooks/useRealtimeVoice", () => ({ useRealtimeVoice: () => voice }));
beforeEach(() => { HTMLElement.prototype.scrollTo = vi.fn(); });
afterEach(() => { cleanup(); voice.status = "error"; });

describe("commandes du widget", () => {
  it("rend Rappeler utilisable après une erreur", () => {
    render(<VoiceWidget publicKey="gv_test" businessName="Test" />);
    const retry = screen.getByRole("button", { name: "Rappeler" });
    expect((retry as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(retry);
    expect(voice.connect).toHaveBeenCalledOnce();
  });
  it("permet d'annuler la connexion en cours", () => {
    voice.status = "requesting_mic";
    render(<VoiceWidget publicKey="gv_test" businessName="Test" />);
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(voice.disconnect).toHaveBeenCalledOnce();
  });
  it("fermer le panneau annule aussi une connexion non encore active", () => {
    voice.status = "connecting";
    render(<VoiceWidget publicKey="gv_test" businessName="Test" embedded />);
    fireEvent.click(screen.getByRole("button", { name: "Parler à Test" }));
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(voice.disconnect).toHaveBeenCalledOnce();
  });
});
