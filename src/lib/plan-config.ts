/** Offres en FCFA. Le produit se vend à la minute de conversation :
 *  c'est la seule unité que le client comprend et la seule que nous
 *  payons réellement à OpenAI. */

export type Plan = {
  id: string;
  label: string;
  minutes: number;
  xof: number;
  agents: number;
  highlight?: string;
};

export const PLANS: Plan[] = [
  { id: "essai", label: "Essai", minutes: 20, xof: 0, agents: 1, highlight: "20 minutes offertes" },
  { id: "demarrage", label: "Démarrage", minutes: 300, xof: 15_000, agents: 2 },
  { id: "pro", label: "Pro", minutes: 1_200, xof: 45_000, agents: 5, highlight: "Le plus choisi" },
  { id: "entreprise", label: "Entreprise", minutes: 4_000, xof: 120_000, agents: 20 },
];

export const TOPUPS: Plan[] = [
  { id: "recharge_100", label: "Recharge 100 min", minutes: 100, xof: 6_000, agents: 0 },
  { id: "recharge_500", label: "Recharge 500 min", minutes: 500, xof: 25_000, agents: 0 },
];

export function findPlan(id: string | undefined): Plan | undefined {
  if (!id) return undefined;
  return [...PLANS, ...TOPUPS].find((p) => p.id === id);
}

export function planAgentLimit(planId: string): number {
  return PLANS.find((p) => p.id === planId)?.agents ?? 1;
}

/** Minutes offertes à la création d'un business. */
export const TRIAL_SECONDS = 20 * 60;
