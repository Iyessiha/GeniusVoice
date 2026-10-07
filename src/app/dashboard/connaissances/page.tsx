import { requireBusiness } from "@/lib/page-context";
import { knowledgeData } from "@/lib/queries";
import KnowledgeClient from "./KnowledgeClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connaissances" };

export default async function KnowledgePage() {
  const { business } = await requireBusiness();
  return <KnowledgeClient initial={await knowledgeData(business)} />;
}
