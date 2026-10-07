import { guardOwner } from "@/lib/api-guard";
import { conversationDetail, conversationsData } from "@/lib/queries";
import { int, str } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const guard = await guardOwner(req);
  if (!guard.ok) return guard.response;

  const id = str(url.searchParams.get("id"));
  if (id) {
    const detail = await conversationDetail(guard.business, id);
    if (!detail) return Response.json({ error: "Conversation introuvable." }, { status: 404 });
    return Response.json(detail);
  }

  return Response.json(
    await conversationsData(guard.business, {
      days: int(url.searchParams.get("days")) ?? 90,
      limit: int(url.searchParams.get("limit")) ?? 100,
    })
  );
}
