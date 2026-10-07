/** Secteurs proposés à l'inscription. Module sans dépendance serveur :
 *  importable depuis un composant client. */

export const INDUSTRIES = [
  { id: "hopital", label: "Hôpital / Clinique" },
  { id: "dentaire", label: "Cabinet dentaire" },
  { id: "immobilier", label: "Agence immobilière" },
  { id: "commerce", label: "Commerce / Boutique" },
  { id: "salon", label: "Salon / Spa" },
  { id: "hotel", label: "Hôtel" },
  { id: "juridique", label: "Cabinet juridique" },
  { id: "automobile", label: "Garage / Concession" },
  { id: "restaurant", label: "Restaurant" },
  { id: "fitness", label: "Salle de sport" },
  { id: "services", label: "Services à domicile" },
  { id: "autre", label: "Autre" },
] as const;

export function isIndustry(v: unknown): boolean {
  return typeof v === "string" && INDUSTRIES.some((i) => i.id === v);
}
