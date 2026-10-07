import { requireBusiness } from "@/lib/page-context";
import { conversationsData } from "@/lib/queries";
import ConversationsClient from "./ConversationsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversations" };

export default async function ConversationsPage() {
  const { business } = await requireBusiness();
  return <ConversationsClient initial={await conversationsData(business, { days: 90, limit: 100 })} />;
}
