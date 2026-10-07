import { notFound } from "next/navigation";
import VoiceWidget from "@/components/VoiceWidget";
import { businessByPublicKey, defaultAgent } from "@/lib/tenant";
import { hasEnoughBalance } from "@/lib/minutes";

export const dynamic = "force-dynamic";

/* Page chargée dans l'iframe injectée chez le client.
 *
 * Elle ne décide rien : le contrôle d'origine a lieu sur les routes
 * /api/realtime/*, appelées depuis cette iframe. Afficher le widget ne
 * consomme aucune minute. */

export default async function EmbedPage({ params }: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = await params;
  const business = await businessByPublicKey(publicKey);
  if (!business || business.status !== "active") notFound();

  const agent = await defaultAgent(business.id);
  const available = Boolean(agent) && hasEnoughBalance(business);

  return (
    <>
      {/* Fond transparent : l'iframe se fond dans la page du client. */}
      <style>{`html,body{background:transparent!important;margin:0;padding:0;height:100%;overflow:hidden}`}</style>
      <div style={{ height: "100vh", display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: 0 }}>
        <VoiceWidget
          publicKey={publicKey}
          businessName={business.name}
          brandColor={business.brandColor}
          embedded
          available={available}
        />
      </div>
    </>
  );
}
