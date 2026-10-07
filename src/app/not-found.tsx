import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "70vh", padding: "1rem", textAlign: "center" }}>
      <div>
        <p className="muted" style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Erreur 404
        </p>
        <h1 style={{ fontSize: 28, margin: "0.5rem 0 0.75rem" }}>Cette page n&apos;existe pas</h1>
        <p className="muted" style={{ marginBottom: "1.5rem" }}>
          Le lien est peut-être obsolète, ou l&apos;établissement a changé d&apos;adresse.
        </p>
        <Link href="/" className="btn btn-primary">
          Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
