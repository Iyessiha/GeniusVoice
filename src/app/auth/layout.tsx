import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "18px 16px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <Link href="/" style={{ fontWeight: 700, fontSize: 16 }}>
            Genius<span style={{ color: "var(--color-brand-600)" }}>Voice</span>
          </Link>
        </div>
      </header>
      <main
        style={{
          flex: 1,
          display: "grid",
          placeItems: "center",
          padding: "32px 16px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 420 }}>{children}</div>
      </main>
    </div>
  );
}
