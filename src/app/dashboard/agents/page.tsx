import { requireBusiness } from "@/lib/page-context";
import { agentsData } from "@/lib/queries";
import AgentsClient from "./AgentsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agents" };

export default async function AgentsPage() {
  const { business } = await requireBusiness();
  return <AgentsClient initial={await agentsData(business)} />;
}
