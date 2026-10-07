"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { api } from "@/lib/client";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      className="btn btn-ghost"
      disabled={busy}
      style={{ padding: "6px 11px", fontSize: 13, flexShrink: 0 }}
      onClick={async () => {
        setBusy(true);
        try {
          await api("/api/auth/logout", { method: "POST" });
        } finally {
          router.push("/auth/login");
          router.refresh();
        }
      }}
    >
      <LogOut size={15} />
      Quitter
    </button>
  );
}
