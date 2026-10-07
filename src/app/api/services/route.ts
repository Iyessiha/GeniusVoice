import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { services } from "@/db/schema";
import { guardOwner } from "@/lib/api-guard";
import { servicesData } from "@/lib/queries";
import { int, str } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await guardOwner(req);
  if (!guard.ok) return guard.response;
  return Response.json(await servicesData(guard.business));
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const guard = await guardOwner(req, body.businessId);
  if (!guard.ok) return guard.response;

  const name = str(body.name);
  if (!name) return Response.json({ error: "Nom de la prestation requis." }, { status: 400 });

  const duration = int(body.durationMinutes) ?? 30;
  if (duration < 5 || duration > 480) {
    return Response.json({ error: "La durée doit être comprise entre 5 et 480 minutes." }, { status: 400 });
  }
  const price = int(body.price);
  if (price !== undefined && price < 0) {
    return Response.json({ error: "Tarif invalide." }, { status: 400 });
  }

  const [service] = await db
    .insert(services)
    .values({
      businessId: guard.business.id,
      name: name.slice(0, 120),
      description: str(body.description)?.slice(0, 600) ?? null,
      durationMinutes: duration,
      price: price ?? null,
      currency: str(body.currency) === "USD" ? "USD" : "XOF",
    })
    .returning();

  return Response.json({ ok: true, service });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const guard = await guardOwner(req, body.businessId);
  if (!guard.ok) return guard.response;

  const id = str(body.id);
  if (!id) return Response.json({ error: "Prestation non précisée." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  const name = str(body.name);
  if (name) patch.name = name.slice(0, 120);
  if ("description" in body) patch.description = str(body.description)?.slice(0, 600) ?? null;
  const duration = int(body.durationMinutes);
  if (duration !== undefined) {
    if (duration < 5 || duration > 480) {
      return Response.json({ error: "Durée invalide." }, { status: 400 });
    }
    patch.durationMinutes = duration;
  }
  if ("price" in body) {
    const price = int(body.price);
    if (price !== undefined && price < 0) return Response.json({ error: "Tarif invalide." }, { status: 400 });
    patch.price = price ?? null;
  }
  if (typeof body.active === "boolean") patch.active = body.active;
  if (!Object.keys(patch).length) return Response.json({ error: "Rien à modifier." }, { status: 400 });

  const [service] = await db
    .update(services)
    .set(patch)
    .where(and(eq(services.id, id), eq(services.businessId, guard.business.id)))
    .returning();
  if (!service) return Response.json({ error: "Prestation introuvable." }, { status: 404 });
  return Response.json({ ok: true, service });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const guard = await guardOwner(req, url.searchParams.get("businessId"));
  if (!guard.ok) return guard.response;
  if (!id) return Response.json({ error: "Prestation non précisée." }, { status: 400 });

  const deleted = await db
    .delete(services)
    .where(and(eq(services.id, id), eq(services.businessId, guard.business.id)))
    .returning({ id: services.id });
  if (!deleted.length) return Response.json({ error: "Prestation introuvable." }, { status: 404 });
  return Response.json({ ok: true });
}
