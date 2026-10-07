export default function SiteNotFound() {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "70vh", padding: "1rem", textAlign: "center" }}>
      <div>
        <h1 style={{ fontSize: 26, margin: "0 0 8px" }}>Établissement introuvable</h1>
        <p className="muted" style={{ margin: 0 }}>
          Ce lien n&apos;est plus actif, ou l&apos;établissement a été désactivé.
        </p>
      </div>
    </main>
  );
}
