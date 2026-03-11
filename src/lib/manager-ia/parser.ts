/**
 * Manager IA — Layer 1: Parser NLP français
 *
 * Analyse une commande en français naturel et extrait un ParsedIntent.
 * Entièrement déterministe, rule-based, pas d'appel LLM.
 */

import type { ActionType, ParsedIntent } from "./types";

// ─── Action Patterns ────────────────────────────

interface ActionPattern {
  action: ActionType;
  patterns: RegExp[];
}

const ACTION_PATTERNS: ActionPattern[] = [
  // ─── Conversational queries (highest priority) ───
  {
    action: "ANALYZE",
    patterns: [
      /\b(analyse|analyser|problème|problemes|problèmes|diagnostic|diagnostique)\b.*\b(planning|semaine|magasin)\b/i,
      /\b(quel|quels)\b.*\b(problème|problemes|problèmes|souci|soucis|alerte|alertes)\b/i,
      /\b(vérifie|vérifier|check|checker|scan|scanner)\b.*\b(planning|semaine)\b/i,
      /\b(problème|problemes|problèmes)\b/i,
    ],
  },
  {
    action: "QUERY_SCORE",
    patterns: [
      /\b(score|note|qualité|qualite)\b.*\b(planning|semaine)\b/i,
      /\bquel.*score\b/i,
      /\bquelle.*note\b/i,
      /\bcomment.*va.*planning\b/i,
    ],
  },
  {
    action: "FIND_REPLACEMENT",
    patterns: [
      /\b(remplaçant|remplacant|remplacement|remplacer|remplace)\b/i,
      /\bqui\b.*\b(remplacer|remplace|couvrir|couvre)\b.*\b(pour|de)\b/i,
    ],
  },
  {
    action: "QUERY_AVAILABLE",
    patterns: [
      /\bqui\b.*\b(peut|disponible|dispo|libre|couvrir|couvre)\b/i,
      /\b(disponible|dispo|libre)\b.*\bqui\b/i,
      /\bqui\b.*\btravailler\b/i,
      /\b(cherche|besoin)\b.*\b(quelqu|employé|monde)\b/i,
    ],
  },
  {
    action: "QUERY_SCHEDULE",
    patterns: [
      /\bqui\b.*\b(travaille|bosse|présent|present)\b/i,
      /\b(planning|shifts?)\b.*\bde\b.*\b(qui|quel)\b/i,
      /\bqui\b.*\b(est|sont)\b.*\b(là|la|prévu|prevue?s?)\b/i,
    ],
  },
  {
    action: "QUERY_HOURS",
    patterns: [
      /\b(combien|nombre)\b.*\b(heure|heures|h)\b/i,
      /\b(heure|heures)\b.*\b(a|de|pour)\b/i,
      /\b(total|recap|récap|résumé|resume)\b.*\b(heure|heures)\b/i,
    ],
  },
  // ─── Action commands ───
  {
    action: "DELETE",
    patterns: [
      /\b(supprime|enlève|retire|annule|vire)\b/i,
      /\b(supprimer|enlever|retirer|annuler|virer)\b/i,
    ],
  },
  {
    action: "MOVE",
    patterns: [
      /\b(déplace|bouge|transfère|change|déplacer|bouger|transférer|changer)\b/i,
    ],
  },
  {
    action: "SHORTEN",
    patterns: [
      /\b(raccourcis|réduis|coupe|raccourcir|réduire|couper)\b/i,
    ],
  },
  {
    action: "EXTEND",
    patterns: [
      /\b(rallonge|prolonge|étend|étends|rallonger|prolonger|étendre)\b/i,
    ],
  },
  {
    action: "ADD_BREAK",
    patterns: [
      /\b(ajoute|met[s]?)\s+(une\s+)?pause\b/i,
      /\bpause\b/i,
      /\bcoupure\b/i,
    ],
  },
  {
    action: "FILL_GAPS",
    patterns: [
      /\b(remplis|comble|couvre|remplir|combler|couvrir)\b.*\b(trou|gap|couverture|manque)\b/i,
      /\b(trou|gap|couverture|manque)\b.*\b(remplis|comble|couvre|remplir|combler|couvrir)\b/i,
    ],
  },
  {
    action: "OPTIMIZE_WEEK",
    patterns: [
      /\b(optimise|optimiser|améliore|améliorer)\b.*\b(semaine|tout)\b/i,
      /\b(toute?\s+la\s+semaine)\b.*\b(optimise|optimiser)\b/i,
    ],
  },
  {
    action: "OPTIMIZE_DAY",
    patterns: [
      /\b(optimise|optimiser|améliore|améliorer)\b/i,
    ],
  },
  {
    action: "CREATE",
    patterns: [
      /\b(met[s]?|ajoute|place|planifie|mettre|ajouter|placer|planifier)\b/i,
    ],
  },
];

// ─── Date Patterns ──────────────────────────────

const DATE_KEYWORDS: Record<string, string> = {
  "aujourd'hui": "today",
  "aujourdhui": "today",
  "aujourd hui": "today",
  "auj": "today",
  "demain": "tomorrow",
  "après-demain": "day_after_tomorrow",
  "apres-demain": "day_after_tomorrow",
  "après demain": "day_after_tomorrow",
  "apres demain": "day_after_tomorrow",
};

const DAY_NAMES: Record<string, number> = {
  "lundi": 1,
  "mardi": 2,
  "mercredi": 3,
  "jeudi": 4,
  "vendredi": 5,
  "samedi": 6,
  "dimanche": 0,
  "lun": 1,
  "mar": 2,
  "mer": 3,
  "jeu": 4,
  "ven": 5,
  "sam": 6,
  "dim": 0,
};

// ─── Time Slot Patterns ─────────────────────────

const TIME_SLOT_KEYWORDS: Record<string, string> = {
  "matin": "matin",
  "matinée": "matin",
  "matinee": "matin",
  "après-midi": "apres-midi",
  "apres-midi": "apres-midi",
  "après midi": "apres-midi",
  "apres midi": "apres-midi",
  "aprèm": "apres-midi",
  "aprem": "apres-midi",
  "soir": "soir",
  "soirée": "soir",
  "soiree": "soir",
  "journée": "journee",
  "journee": "journee",
  "toute la journée": "journee",
  "toute la journee": "journee",
};

// ─── Levenshtein Distance ───────────────────────

function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  const matrix: number[][] = [];
  for (let i = 0; i <= la; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lb; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[la][lb];
}

// ─── Fuzzy Matching ─────────────────────────────

/**
 * Fuzzy match a query against a list of known names.
 * Returns the best match if Levenshtein distance ≤ threshold.
 */
export function fuzzyMatch(
  query: string,
  candidates: string[],
  threshold: number = 2
): string | null {
  const q = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let bestMatch: string | null = null;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const c = candidate.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Exact match
    if (c === q) return candidate;

    // Starts with
    if (c.startsWith(q) || q.startsWith(c)) {
      const dist = Math.abs(c.length - q.length);
      if (dist < bestDist) {
        bestDist = dist;
        bestMatch = candidate;
      }
      continue;
    }

    // Levenshtein
    const dist = levenshtein(q, c);
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

// ─── Normalize Text ─────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// ─── Extract Action ─────────────────────────────

function extractAction(text: string): ActionType {
  const lower = text.toLowerCase();

  for (const { action, patterns } of ACTION_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(lower)) {
        return action;
      }
    }
  }

  return "CREATE"; // default
}

// ─── Extract Employee Name ──────────────────────

/**
 * Extract employee name from the command by matching against known names.
 * Tries first names, then last names, then full names.
 */
export function extractEmployeeName(
  text: string,
  knownEmployees: { firstName: string; lastName: string }[]
): string | null {
  const normalizedText = normalize(text);
  const words = normalizedText.split(/\s+/);

  // Build candidate lists
  const firstNames = knownEmployees.map((e) => e.firstName);
  const lastNames = knownEmployees.map((e) => e.lastName);
  const fullNames = knownEmployees.map((e) => `${e.firstName} ${e.lastName}`);

  // Try full name match first (2 consecutive words)
  for (let i = 0; i < words.length - 1; i++) {
    const twoWords = `${words[i]} ${words[i + 1]}`;
    const match = fuzzyMatch(twoWords, fullNames, 3);
    if (match) return match;
  }

  // Try each word against first names
  for (const word of words) {
    // Skip common French words
    if (isCommonWord(word)) continue;

    const match = fuzzyMatch(word, firstNames, 2);
    if (match) return match;
  }

  // Try each word against last names
  for (const word of words) {
    if (isCommonWord(word)) continue;

    const match = fuzzyMatch(word, lastNames, 2);
    if (match) return match;
  }

  return null;
}

// ─── Extract Store Name ─────────────────────────

export function extractStoreName(
  text: string,
  knownStores: string[]
): string | null {
  const normalizedText = normalize(text);

  // Try matching against store names (they can be multi-word)
  for (const store of knownStores) {
    const normalizedStore = normalize(store);
    if (normalizedText.includes(normalizedStore)) {
      return store;
    }
  }

  // Try fuzzy match with each store name
  // Extract "à <store>" or "au <store>" or "chez <store>" patterns
  const storePatterns = [
    /(?:à|au|chez|pour|dans|sur)\s+(.+?)(?:\s+(?:le|la|les|de|du|des|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|aujourd|matin|après|soir|$))/i,
    /(?:à|au|chez|pour|dans|sur)\s+(.+)$/i,
  ];

  for (const pattern of storePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const storePart = match[1].trim();
      const fuzzyResult = fuzzyMatch(storePart, knownStores, 3);
      if (fuzzyResult) return fuzzyResult;
    }
  }

  // Last resort: try each store against the full text
  for (const store of knownStores) {
    const parts = store.toLowerCase().split(/\s+/);
    // If any significant part of the store name appears in the text
    const significantParts = parts.filter((p) => p.length > 3);
    if (significantParts.length > 0 && significantParts.every((p) => normalizedText.includes(p))) {
      return store;
    }
  }

  return null;
}

// ─── Extract Date Expression ────────────────────

export function extractDateExpr(text: string): string | null {
  const lower = text.toLowerCase();

  // Check keywords (aujourd'hui, demain, etc.)
  for (const [keyword, value] of Object.entries(DATE_KEYWORDS)) {
    if (lower.includes(keyword)) return value;
  }

  // Check day names (lundi, mardi, etc.)
  for (const [dayName, dayNum] of Object.entries(DAY_NAMES)) {
    const regex = new RegExp(`\\b${dayName}\\b`, "i");
    if (regex.test(lower)) return `weekday:${dayNum}`;
  }

  // Check explicit date: "le 15", "15 mars", "15/03"
  const explicitDate = lower.match(/\ble\s+(\d{1,2})\b/);
  if (explicitDate) return `day:${explicitDate[1]}`;

  const monthDate = lower.match(/(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)/);
  if (monthDate) return `${monthDate[1]} ${monthDate[2]}`;

  return null;
}

/**
 * Extract target date for MOVE action (e.g., "de mardi à mercredi")
 */
export function extractTargetDateExpr(text: string): string | null {
  const lower = text.toLowerCase();

  // Pattern: "à <day>" or "vers <day>" (target destination)
  const movePattern = /(?:à|vers|au)\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/i;
  const match = lower.match(movePattern);
  if (match) {
    const dayNum = DAY_NAMES[match[1].toLowerCase()];
    if (dayNum !== undefined) return `weekday:${dayNum}`;
  }

  return null;
}

// ─── Extract Time Slot ──────────────────────────

export function extractTimeSlot(text: string): {
  timeSlot: string | null;
  startTime: string | null;
  endTime: string | null;
} {
  const lower = text.toLowerCase();

  // Check explicit time range: "de 9h à 17h", "de 9h00 à 17h00"
  const rangeMatch = lower.match(
    /de\s+(\d{1,2})\s*h\s*(\d{0,2})\s*(?:à|au|jusqu['']?(?:à|a))\s*(\d{1,2})\s*h\s*(\d{0,2})/
  );
  if (rangeMatch) {
    const startH = rangeMatch[1].padStart(2, "0");
    const startM = (rangeMatch[2] || "00").padStart(2, "0");
    const endH = rangeMatch[3].padStart(2, "0");
    const endM = (rangeMatch[4] || "00").padStart(2, "0");
    return {
      timeSlot: null,
      startTime: `${startH}:${startM}`,
      endTime: `${endH}:${endM}`,
    };
  }

  // Check "jusqu'à 18h" pattern
  const untilMatch = lower.match(/jusqu['']?(?:à|a)\s*(\d{1,2})\s*h\s*(\d{0,2})/);
  if (untilMatch) {
    const endH = untilMatch[1].padStart(2, "0");
    const endM = (untilMatch[2] || "00").padStart(2, "0");
    return { timeSlot: null, startTime: null, endTime: `${endH}:${endM}` };
  }

  // Check "à partir de 10h" pattern
  const fromMatch = lower.match(/(?:à\s+partir\s+de|dès|des)\s*(\d{1,2})\s*h\s*(\d{0,2})/);
  if (fromMatch) {
    const startH = fromMatch[1].padStart(2, "0");
    const startM = (fromMatch[2] || "00").padStart(2, "0");
    return { timeSlot: null, startTime: `${startH}:${startM}`, endTime: null };
  }

  // Check time slot keywords (matin, après-midi, soir)
  for (const [keyword, slot] of Object.entries(TIME_SLOT_KEYWORDS)) {
    if (lower.includes(keyword)) {
      return { timeSlot: slot, startTime: null, endTime: null };
    }
  }

  return { timeSlot: null, startTime: null, endTime: null };
}

// ─── Extract Duration ───────────────────────────

export function extractDuration(text: string): number | null {
  const lower = text.toLowerCase();

  // "de 1h", "de 2h30", "de 1 heure"
  const hourMatch = lower.match(/de\s+(\d+)\s*h\s*(\d{0,2})/);
  if (hourMatch) {
    const hours = parseInt(hourMatch[1]);
    const mins = hourMatch[2] ? parseInt(hourMatch[2]) : 0;
    return hours * 60 + mins;
  }

  // "de 30 min", "de 30 minutes"
  const minMatch = lower.match(/de\s+(\d+)\s*min/);
  if (minMatch) {
    return parseInt(minMatch[1]);
  }

  // "de 1 heure", "de 2 heures"
  const heureMatch = lower.match(/de\s+(\d+)\s*heure/);
  if (heureMatch) {
    return parseInt(heureMatch[1]) * 60;
  }

  return null;
}

// ─── Common Words Filter ────────────────────────

const COMMON_WORDS = new Set([
  "le", "la", "les", "de", "du", "des", "un", "une",
  "et", "ou", "en", "au", "aux", "ce", "cette", "ces",
  "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses",
  "pour", "par", "sur", "sous", "dans", "avec", "sans",
  "qui", "que", "quoi", "dont", "où",
  "je", "tu", "il", "elle", "nous", "vous", "ils", "elles",
  "ne", "pas", "plus", "tout", "tous", "toute", "toutes",
  "mets", "met", "ajoute", "place", "planifie",
  "déplace", "bouge", "transfère", "change",
  "supprime", "enlève", "retire", "annule",
  "raccourcis", "réduis", "coupe",
  "rallonge", "prolonge", "étend", "étends",
  "optimise", "améliore",
  "remplis", "comble", "couvre",
  "shift", "shifts", "planning",
  "demain", "aujourd", "hui", "après",
  "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
  "matin", "midi", "soir", "soirée", "journée", "nuit",
  "heure", "heures", "minute", "minutes", "min",
  "pause", "break", "coupure",
  "trous", "trou", "gaps", "gap", "couverture", "manque",
  "semaine", "jour", "jours",
  "à", "a",
]);

function isCommonWord(word: string): boolean {
  return COMMON_WORDS.has(word) || word.length <= 2;
}

// ─── Main Parse Function ────────────────────────

export interface ParseContext {
  knownEmployees: { firstName: string; lastName: string }[];
  knownStores: string[];
}

export function parseCommand(
  command: string,
  context: ParseContext
): ParsedIntent {
  const action = extractAction(command);
  const employeeName = extractEmployeeName(command, context.knownEmployees);
  const storeName = extractStoreName(command, context.knownStores);
  const dateExpr = extractDateExpr(command);
  const targetDateExpr = action === "MOVE" ? extractTargetDateExpr(command) : null;
  const { timeSlot, startTime, endTime } = extractTimeSlot(command);
  const duration = extractDuration(command);

  // For MOVE: if we detected "de <day> à <day>", the main dateExpr is the source
  // and targetDateExpr is the destination
  let finalDateExpr = dateExpr;
  if (action === "MOVE" && targetDateExpr && !dateExpr) {
    // Try to extract source date from "de <day>" pattern
    const lower = command.toLowerCase();
    const sourceMatch = lower.match(
      /de\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/i
    );
    if (sourceMatch) {
      const dayNum = DAY_NAMES[sourceMatch[1].toLowerCase()];
      if (dayNum !== undefined) finalDateExpr = `weekday:${dayNum}`;
    }
  }

  return {
    action,
    employeeName,
    storeName,
    dateExpr: finalDateExpr,
    targetDateExpr,
    timeSlot,
    startTimeExpr: startTime,
    endTimeExpr: endTime,
    duration,
    rawCommand: command,
  };
}
