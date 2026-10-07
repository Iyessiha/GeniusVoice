/** Formateurs partagés entre composants serveur et client : ce module ne
 *  porte donc aucune directive "use client". */

export function minutesLabel(seconds: number): string {
  if (seconds <= 0) return "0 min";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, "0")}`;
}

export function dateLabel(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function xof(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} FCFA`;
}
