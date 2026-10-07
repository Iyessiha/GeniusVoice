import { guardWidget, preflight } from "@/lib/widget-auth";
import { defaultAgent } from "@/lib/tenant";
import { hasEnoughBalance } from "@/lib/minutes";

export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return preflight(req);
}

/** Apparence et disponibilité du widget, avant toute ouverture de micro.
 *  Ne renvoie que du public : rien de ce qui est ici n'est sensible. */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  const guard = await guardWidget(req, key);
  if (!guard.ok) return guard.response;
  const { business, cors } = guard;

  const agent = await defaultAgent(business.id);

  return Response.json(
    {
      ok: true,
      business: { name: business.name, brandColor: business.brandColor, locale: business.locale },
      agent: agent ? { id: agent.id, name: agent.name, role: agent.role } : null,
      available: Boolean(agent) && hasEnoughBalance(business),
    },
    { headers: { ...cors, "Cache-Control": "no-store" } }
  );
}
