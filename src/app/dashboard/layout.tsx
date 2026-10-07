import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { businessesOf } from "@/lib/tenant";
import { minutesLabel } from "@/lib/format";
import LogoutButton from "./LogoutButton";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/dashboard", label: "Vue d'ensemble" },
  { href: "/dashboard/agents", label: "Agents" },
  { href: "/dashboard/connaissances", label: "Connaissances" },
  { href: "/dashboard/horaires", label: "Horaires & prestations" },
  { href: "/dashboard/conversations", label: "Conversations" },
  { href: "/dashboard/rendez-vous", label: "Rendez-vous" },
  { href: "/dashboard/prospects", label: "Prospects" },
  { href: "/dashboard/widget", label: "Intégration" },
  { href: "/dashboard/facturation", label: "Facturation" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/auth/login");

  const businesses = await businessesOf(user.id);
  const current = businesses[0];

  return (
    <div style={{ minHeight: "100vh" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "var(--card)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            maxWidth: 1180,
            margin: "0 auto",
            padding: "12px 16px",
          }}
        >
          <Link href="/dashboard" style={{ fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
            Genius<span style={{ color: "var(--color-brand-600)" }}>Voice</span>
          </Link>

          {current && (
            <div className="muted" style={{ fontSize: 13, minWidth: 0, flex: 1 }}>
              <span style={{ fontWeight: 600, color: "var(--fg)" }}>{current.name}</span>
              <span style={{ margin: "0 6px" }}>·</span>
              <span>{minutesLabel(current.secondsBalance)} restantes</span>
            </div>
          )}

          <LogoutButton />
        </div>

        <nav style={{ borderTop: "1px solid var(--line)", overflowX: "auto" }}>
          <div
            style={{
              display: "flex",
              gap: 2,
              maxWidth: 1180,
              margin: "0 auto",
              padding: "0 10px",
            }}
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: "10px 11px",
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  color: "var(--muted)",
                }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 16px 56px" }}>{children}</main>
    </div>
  );
}
