import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { guardOwner } from "@/lib/api-guard";
import { billingData } from "@/lib/queries";
import { PLANS, TOPUPS } from "@/lib/plan-config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await guardOwner(req);
  if (!guard.ok) return guard.response;
  return Response.json(await billingData(guard.business));
}
