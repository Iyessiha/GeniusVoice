import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { businessHours } from "@/db/schema";
import { guardOwner } from "@/lib/api-guard";
import { int, str } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Remplace les horaires d'ouverture. L'agent s'appuie dessus pour
 *  annoncer des créneaux : une incohérence ici se traduit par des
 *  rendez-vous pris porte fermée. */
export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const guard = await guardOwner(req, body.businessId);
  if (!guard.ok) return guard.response;
  const { business } = guard;

  if (!Array.isArray(body.hours)) return Response.json({ error: "Horaires absents." }, { status: 400 });

  const rows: Array<{ dayOfWeek: number; opensAt: string; closesAt: string; closed: boolean }> = [];
  for (const raw of body.hours) {
    if (!raw || typeof raw !== "object") continue;
    const h = raw as Record<string, unknown>;
    const day = int(h.dayOfWeek);
    if (day === undefined || day < 0 || day > 6) {
      return Response.json({ error: "Jour invalide." }, { status: 400 });
    }
    const closed = h.closed === true;
    const opensAt = str(h.opensAt) ?? "08:00";
    const closesAt = str(h.closesAt) ?? "18:00";
    if (!closed) {
      if (!TIME.test(opensAt) || !TIME.test(closesAt)) {
        return Response.json({ error: "Heure invalide (format attendu : 08:30)." }, { status: 400 });
      }
      if (opensAt >= closesAt) {
        return Response.json(
          { error: "L'heure de fermeture doit être postérieure à l'ouverture." },
          { status: 400 }
        );
      }
    }
    rows.push({ dayOfWeek: day, opensAt, closesAt, closed });
  }

  for (const r of rows) {
    await db
      .update(businessHours)
      .set({ opensAt: r.opensAt, closesAt: r.closesAt, closed: r.closed })
      .where(and(eq(businessHours.businessId, business.id), eq(businessHours.dayOfWeek, r.dayOfWeek)));
  }

  const updated = await db.select().from(businessHours).where(eq(businessHours.businessId, business.id));
  return Response.json({ ok: true, hours: updated.sort((a, b) => a.dayOfWeek - b.dayOfWeek) });
}
