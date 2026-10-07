import { requireBusiness } from "@/lib/page-context";
import { appointmentsData } from "@/lib/queries";
import AppointmentsClient from "./AppointmentsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rendez-vous" };

export default async function AppointmentsPage() {
  const { business } = await requireBusiness();
  return <AppointmentsClient initial={await appointmentsData(business, "upcoming")} />;
}
