// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import WidgetClient from "@/app/dashboard/widget/WidgetClient";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/client", () => ({ api }));
vi.mock("@/components/VoiceWidget", () => ({ default: () => null }));
afterEach(cleanup);

it("préremplit les réglages serveur et les conserve lors d'un enregistrement sans modification", async () => {
  const initial = {
    business: {
      id: "business", name: "Test", slug: "test", publicKey: "gv_test", timezone: "Africa/Abidjan",
      brandColor: "#123456", allowedDomains: ["client.example.test"],
    }, embedSnippet: "<script></script>", publicUrl: "https://app.example.test/sites/test",
  };
  api.mockResolvedValue(initial);
  render(<WidgetClient initial={initial} />);
  expect(screen.getByText("client.example.test")).toBeTruthy();
  expect(screen.getAllByDisplayValue("#123456")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() => expect(api).toHaveBeenCalledWith("/api/business", {
    method: "PATCH", body: { allowedDomains: ["client.example.test"], brandColor: "#123456" },
  }));
});
