import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },

  async rewrites() {
    // Les clients collent <script src="https://app.genius.ci/widget.js">.
    return [{ source: "/widget.js", destination: "/api/widget-script" }];
  },

  async headers() {
    const base = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Le widget a besoin du micro sur notre propre origine — y compris
      // lorsqu'il tourne dans l'iframe embarquée, qui est de cette origine.
      { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
    ];

    return [
      {
        // Tout sauf /embed : la négation est nécessaire parce que Next
        // applique TOUTES les entrées qui correspondent, sans priorité.
        // Sans elle, X-Frame-Options empêcherait le widget de s'afficher
        // chez le client — le produit entier ne fonctionnerait pas.
        source: "/((?!embed/).*)",
        headers: [...base, { key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        // La page du widget est faite pour être encadrée sur des domaines
        // tiers : pas de X-Frame-Options, et on laisse le contrôle
        // d'origine aux routes /api/realtime/* plutôt qu'à une liste
        // frame-ancestors qu'il faudrait regénérer à chaque client.
        source: "/embed/:path*",
        headers: base,
      },
      {
        // Le script lui-même est public et ne contient aucun secret.
        source: "/widget.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=300, s-maxage=300" },
        ],
      },
    ];
  },
};

export default nextConfig;
