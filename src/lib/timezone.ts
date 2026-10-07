/** Conversions entre l'heure murale d'un établissement et l'UTC.
 *
 *  L'agent dicte « jeudi 9h30 » : c'est une heure murale, pas un instant.
 *  Sans cette couche, un business à Lagos (UTC+1) verrait ses rendez-vous
 *  décalés d'une heure en base. Aucune dépendance externe : Intl porte
 *  déjà la base de fuseaux.
 */

const PARTS: Intl.DateTimeFormatOptions = {
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
};

function partsIn(date: Date, timeZone: string): Record<string, number> {
  const fmt = new Intl.DateTimeFormat("en-US", { ...PARTS, timeZone });
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = parseInt(p.value, 10);
  }
  // "24" peut apparaître pour minuit selon l'implémentation.
  if (out.hour === 24) out.hour = 0;
  return out;
}

/** Décalage du fuseau, en millisecondes, à l'instant donné. */
function offsetAt(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - date.getTime();
}

/** Normalise "2026-10-14T09:30", "…T09:30:00" ou avec fuseau explicite. */
function splitNaive(input: string): { naive: string; hasZone: boolean } {
  const trimmed = input.trim().replace(" ", "T");
  const hasZone = /([Zz]|[+-]\d{2}:?\d{2})$/.test(trimmed);
  if (hasZone) return { naive: trimmed, hasZone };
  const m = trimmed.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return { naive: trimmed, hasZone: false };
  return { naive: `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? "00"}`, hasZone: false };
}

/** Heure murale d'un fuseau → instant UTC. Renvoie null si illisible. */
export function zonedToUtc(input: string, timeZone: string): Date | null {
  const { naive, hasZone } = splitNaive(input);
  if (hasZone) {
    const d = new Date(naive);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(naive)) return null;

  // Première estimation en lisant la date comme de l'UTC, puis correction
  // par le décalage réel. Une passe suffit hors transition d'heure d'été ;
  // la seconde couvre les rares cas limites.
  const guess = new Date(`${naive}Z`);
  if (Number.isNaN(guess.getTime())) return null;
  let utc = new Date(guess.getTime() - offsetAt(guess, timeZone));
  utc = new Date(guess.getTime() - offsetAt(utc, timeZone));
  return utc;
}

/** Instant UTC → minutes depuis minuit dans le fuseau donné. */
export function minutesInZone(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  return p.hour * 60 + p.minute;
}

/** Instant UTC → "AAAA-MM-JJ" dans le fuseau donné. */
export function dateInZone(date: Date, timeZone: string): string {
  const p = partsIn(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Libellé lisible pour l'agent et le tableau de bord. */
export function formatInZone(date: Date, timeZone: string, locale = "fr-FR"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Jour de la semaine (0 = dimanche) d'une date nue "AAAA-MM-JJ". */
export function weekdayOfDate(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}
