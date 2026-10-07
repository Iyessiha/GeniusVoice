import Script from "next/script";
import Link from "next/link";
import { businessByPublicKey } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export const metadata = { title: "Démonstration du widget" };

/** Simule le site d'un client pour vérifier l'intégration réelle :
 *  la même balise <script> que celle qu'il collera chez lui. */
export default async function WidgetDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  const business = key ? await businessByPublicKey(key) : null;

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ borderBottom: "1px solid var(--line)", background: "var(--card)" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "14px 16px", display: "flex", gap: 12 }}>
          <Link href="/" style={{ fontWeight: 700 }}>
            Genius<span style={{ color: "var(--color-brand-600)" }}>Voice</span>
          </Link>
          <span className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>
            Page de démonstration
          </span>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: "0 auto", padding: "40px 16px 80px" }}>
        <h1 style={{ margin: "0 0 10px", fontSize: 26 }}>Ceci imite le site d&apos;un client</h1>

        {business ? (
          <>
            <p className="muted" style={{ fontSize: 15, marginBottom: 20 }}>
              Le widget de <strong style={{ color: "var(--fg)" }}>{business.name}</strong> est chargé en bas à droite,
              par la même balise <code>&lt;script&gt;</code> que celle fournie dans votre tableau de bord. Cliquez
              dessus pour parler à l&apos;agent — l&apos;appel consomme les minutes de l&apos;établissement.
            </p>
            <p className="muted" style={{ fontSize: 14 }}>
              Pour que ce test fonctionne depuis un autre domaine que GeniusVoice, ce domaine doit figurer dans les
              domaines autorisés de l&apos;établissement.
            </p>
            {/* Charge le script d'intégration exactement comme le ferait le client. */}
            <Script src={`/widget.js`} data-key={business.publicKey} strategy="afterInteractive" />
          </>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 15, marginBottom: 20 }}>
              Ajoutez votre clé publique à l&apos;adresse pour charger votre widget :
            </p>
            <pre
              className="card"
              style={{ padding: 13, fontSize: 13, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}
            >
              /widget-demo?key=gv_votre_cle_publique
            </pre>
            <p className="muted" style={{ fontSize: 14, marginTop: 16 }}>
              Vous trouverez votre clé dans{" "}
              <Link href="/dashboard/widget" style={{ color: "var(--color-brand-600)", fontWeight: 600 }}>
                Intégration
              </Link>
              .
            </p>
          </>
        )}

        <div style={{ marginTop: 40, display: "grid", gap: 14 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="card" style={{ padding: 18 }}>
              <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>Contenu factice {i}</h2>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                Du texte pour donner de la hauteur à la page et vérifier que le widget reste bien fixé au coin de
                l&apos;écran pendant le défilement.
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
