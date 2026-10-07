import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "GeniusVoice — Réceptionniste IA vocale pour votre établissement",
    template: "%s · GeniusVoice",
  },
  description:
    "Un agent vocal IA qui répond à vos clients, prend les rendez-vous et qualifie vos prospects, 24 h sur 24. Pour cliniques, agences immobilières et commerces.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f0f4ff" },
    { media: "(prefers-color-scheme: dark)", color: "#080e1a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
