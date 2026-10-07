import { requireBusiness } from "@/lib/page-context";
import { leadsData } from "@/lib/queries";
import LeadsClient from "./LeadsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prospects" };

export default async function LeadsPage() {
  const { business } = await requireBusiness();
  return <LeadsClient initial={await leadsData(business)} />;
}
