import { guardOwner } from "@/lib/api-guard";
import { confirmPayment } from "@/lib/payments";
import { str } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const reference = str(new URL(req.url).searchParams.get("ref"));
  const guard = await guardOwner(req);
  if (!guard.ok) return guard.response;
  if (!reference) return Response.json({ error: "Référence absente." }, { status: 400 });

  const outcome = await confirmPayment(guard.user.id, reference);
  if (outcome.status === "unknown") {
    return Response.json({ error: outcome.message }, { status: 404 });
  }
  return Response.json({ ok: true, ...outcome });
}
