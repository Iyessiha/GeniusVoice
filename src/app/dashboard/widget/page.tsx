import { appUrl, requireBusiness } from "@/lib/page-context";
import { businessData } from "@/lib/queries";
import WidgetClient from "./WidgetClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Intégration" };

export default async function WidgetPage() {
  const { business } = await requireBusiness();
  return <WidgetClient initial={await businessData(business, appUrl())} />;
}
