import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments } from "@/db/schema";
import { guardOwner } from "@/lib/api-guard";
import { appointmentsData, APPOINTMENT_STATUSES } from "@/lib/queries";
import { zonedToUtc } from "@/lib/timezone";
import { int, str } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const guard = await guardOwner(req);
  if (!guard.ok) return guard.response;
  const scope = url.searchParams.get("scope") === "all" ? "all" : "upcoming";
  return Response.json(
    await appointmentsData(guard.business, scope, int(url.searchParams.get("limit")) ?? 100)
  );
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const guard = await guardOwner(req, body.businessId);
  if (!guard.ok) return guard.response;
  const { business } = guard;

  const customerName = str(body.customerName);
  const when = str(body.scheduledAt);
  if (!customerName || !when) {
    return Response.json({ error: "Nom du client et date du rendez-vous requis." }, { status: 400 });
  }

  const scheduledAt = zonedToUtc(when, business.timezone);
  if (!scheduledAt) return Response.json({ error: "Date invalide." }, { status: 400 });

  const [appointment] = await db
    .insert(appointments)
    .values({
      businessId: business.id,
      customerName: customerName.slice(0, 120),
      customerPhone: str(body.customerPhone)?.slice(0, 40) ?? null,
      customerEmail: str(body.customerEmail)?.slice(0, 160) ?? null,
      scheduledAt,
      durationMinutes: Math.min(480, Math.max(5, int(body.durationMinutes) ?? 30)),
      status: "confirmed",
      notes: str(body.notes)?.slice(0, 1000) ?? null,
    })
    .returning();

  return Response.json({ ok: true, appointment: { ...appointment, confirmToken: undefined } });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const guard = await guardOwner(req, body.businessId);
  if (!guard.ok) return guard.response;
  const { business } = guard;

  const id = str(body.id);
  if (!id) return Response.json({ error: "Rendez-vous non précisé." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  const status = str(body.status);
  if (status) {
    if (!(APPOINTMENT_STATUSES as readonly string[]).includes(status)) return Response.json({ error: "Statut inconnu." }, { status: 400 });
    patch.status = status;
  }
  if ("notes" in body) patch.notes = str(body.notes)?.slice(0, 1000) ?? null;
  const when = str(body.scheduledAt);
  if (when) {
    const scheduledAt = zonedToUtc(when, business.timezone);
    if (!scheduledAt) return Response.json({ error: "Date invalide." }, { status: 400 });
    patch.scheduledAt = scheduledAt;
  }
  if (!Object.keys(patch).length) return Response.json({ error: "Rien à modifier." }, { status: 400 });

  const [appointment] = await db
    .update(appointments)
    .set(patch)
    .where(and(eq(appointments.id, id), eq(appointments.businessId, business.id)))
    .returning();
  if (!appointment) return Response.json({ error: "Rendez-vous introuvable." }, { status: 404 });

  return Response.json({ ok: true, appointment: { ...appointment, confirmToken: undefined } });
}
