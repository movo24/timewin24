export interface StoreAssignment {
  store: { id: string; name: string };
}

export interface CostCountry {
  code: string;
  name: string;
  employerRate: number;
  minimumWageHour: number;
  reductionEnabled: boolean;
  reductionMaxCoeff: number;
  reductionThreshold: number;
}

export interface CostConfig {
  id: string;
  hourlyRateGross: number;
  fixedMissionCost: number | null;
  employerRateOverride: number | null;
  extraHourlyCostOverride: number | null;
  countryCode: string;
  country: CostCountry;
}

export interface Unavailability {
  id: string;
  type: "FIXED" | "VARIABLE";
  dayOfWeek: number | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  active: boolean;
  weeklyHours: number | null;
  contractType: string | null;
  priority: number;
  maxHoursPerDay: number | null;
  maxHoursPerWeek: number | null;
  minRestBetween: number | null;
  skills: string[];
  preferredStoreId: string | null;
  shiftPreference: string | null;
  stores: StoreAssignment[];
  costConfig: CostConfig | null;
  unavailabilities: Unavailability[];
  reliabilityScore: number | null;
  profileCategory: string | null;
  scoreUpdatedAt: string | null;
  // Access terrain
  employeeCode: string;
  accessStatus: "ACTIVE" | "BLOCKED" | "SUSPENDED";
  blockedAt: string | null;
  blockedReason: string | null;
  forceCodeChange: boolean;
  lastLoginAt: string | null;
  posPin: string | null;
}

export interface StoreOption {
  id: string;
  name: string;
  city: string | null;
}

export type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: string;
  active: boolean;
  weeklyHours: string;
  contractType: string;
  priority: string;
  maxHoursPerDay: string;
  maxHoursPerWeek: string;
  minRestBetween: string;
  skills: string[];
  preferredStoreId: string;
  shiftPreference: string;
  storeIds: string[];
  hourlyRateGross: string;
  fixedMissionCost: string;
};

export const CONTRACT_LABELS: Record<string, string> = {
  CDI: "CDI",
  CDD: "CDD",
  INTERIM: "Intérim",
  EXTRA: "Extra",
  STAGE: "Stage",
};

export const SKILL_LABELS: Record<string, string> = {
  CAISSE: "Caisse",
  OUVERTURE: "Ouverture",
  FERMETURE: "Fermeture",
  GESTION: "Gestion",
  MANAGER: "Manager",
  CONSEIL: "Conseil",
  STOCK: "Stock",
  SAV: "SAV",
};

export const SHIFT_PREF_LABELS: Record<string, string> = {
  MATIN: "Matin uniquement",
  APRES_MIDI: "Après-midi uniquement",
  JOURNEE: "Journée complète",
};

export const DAY_NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export function calcFillonCoeff(
  grossPeriod: number,
  smicPeriod: number,
  maxCoeff: number,
  threshold: number
): number {
  if (grossPeriod <= 0 || smicPeriod <= 0) return 0;
  const ratio = (threshold * smicPeriod) / grossPeriod;
  const C = (maxCoeff / 0.6) * (ratio - 1);
  return Math.max(0, Math.min(C, maxCoeff));
}

export function calcCostPerHour(
  hourlyRateGross: number,
  country: CostCountry,
  employerRateOverride: number | null
): number {
  const employerRate = employerRateOverride ?? country.employerRate;
  const chargesFull = hourlyRateGross * employerRate;
  let reduction = 0;
  if (country.reductionEnabled) {
    const coeff = calcFillonCoeff(
      hourlyRateGross,
      country.minimumWageHour,
      country.reductionMaxCoeff,
      country.reductionThreshold
    );
    reduction = hourlyRateGross * coeff;
    reduction = Math.min(reduction, chargesFull);
  }
  return Math.round((hourlyRateGross + chargesFull - reduction) * 100) / 100;
}
