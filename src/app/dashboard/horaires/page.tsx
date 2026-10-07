import { requireBusiness } from "@/lib/page-context";
import { appUrl } from "@/lib/page-context";
import { businessData, servicesData } from "@/lib/queries";
import HoursClient from "./HoursClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Horaires & prestations" };

export default async function HoursPage() {
  const { business } = await requireBusiness();
  const [b, s] = await Promise.all([businessData(business, appUrl()), servicesData(business)]);
  return <HoursClient initial={{ hours: b.hours, services: s.services }} />;
}
