// ─── POS Business Analyzer ───────────────────────
// Analyse IA des données POS — diagnostic business brutal et actionnable
// Style : direct, chiffré, avec verdicts clairs et plan d'action

import { generateText } from "../shared/gemini-client";
import type { PosAnalysisData } from "./data-collector";

export interface PosAnalysisResult {
  analysis: string; // Markdown formatté
  tokensUsed: number;
  generatedAt: string;
}

/**
 * Génère une analyse business complète à partir des données POS
 */
export async function analyzePosData(
  data: PosAnalysisData,
  customQuestion?: string
): Promise<PosAnalysisResult> {
  const prompt = buildPrompt(data, customQuestion);

  const { text, tokensUsed } = await generateText(prompt, {
    systemInstruction: SYSTEM_INSTRUCTION,
    temperature: 0.4,
    maxOutputTokens: 4096,
  });

  return {
    analysis: text,
    tokensUsed,
    generatedAt: new Date().toISOString(),
  };
}

const SYSTEM_INSTRUCTION = `Tu es un analyste business senior spécialisé dans le retail / point de vente.

STYLE OBLIGATOIRE :
- Parle en FRANÇAIS
- Sois BRUTAL et DIRECT — pas de langue de bois
- Utilise des emojis pour structurer (📊 💰 ⚠️ 🎯 💥 🔥 etc.)
- Chaque section doit avoir un VERDICT clair
- Donne des CHIFFRES PRÉCIS, pas des approximations vagues
- Calcule les projections mensuelles/annuelles automatiquement
- Compare toujours au seuil de rentabilité
- Identifie les problèmes critiques AVANT les détails
- Termine par un PLAN D'ACTION concret avec des étapes numérotées

FORMAT :
- Utilise des sections numérotées avec emojis
- Chaque insight = une ligne, pas un paragraphe
- Mets les chiffres importants en gras
- Utilise des flèches ➡️ pour les conclusions
- Verdict final : RENTABLE / PAS RENTABLE / À PIVOTER

NE FAIS JAMAIS :
- Des réponses génériques type "il faudrait améliorer les ventes"
- Des recommandations sans chiffres
- Des analyses sans verdict
- Des textes longs sans structure`;

function buildPrompt(data: PosAnalysisData, customQuestion?: string): string {
  const { store, period, revenue, costs, staffing, trends, alerts } = data;

  // Build daily breakdown
  const dailyLines = revenue.byDay
    .map((d) => `  ${d.date}: ${d.revenue}€ | ${d.transactions} tx | panier ${d.avgBasket}€`)
    .join("\n");

  // Build hourly peaks
  const hourlyLines = revenue.byHour
    .map((h) => `  ${h.hour}h: ${h.revenue}€ (${h.transactions} tx)`)
    .join("\n");

  // Trends section
  const trendLines = [];
  if (trends.revenueGrowth !== null) trendLines.push(`CA vs période précédente: ${trends.revenueGrowth > 0 ? "+" : ""}${trends.revenueGrowth}%`);
  if (trends.transactionGrowth !== null) trendLines.push(`Transactions vs précédent: ${trends.transactionGrowth > 0 ? "+" : ""}${trends.transactionGrowth}%`);
  if (trends.basketTrend !== null) trendLines.push(`Panier moyen vs précédent: ${trends.basketTrend > 0 ? "+" : ""}${trends.basketTrend}%`);

  let prompt = `ANALYSE BUSINESS — DONNÉES RÉELLES POS

MAGASIN: ${store.name} (${store.city || "ville inconnue"})
DEVISE: ${store.currency}
PÉRIODE: ${period.from} → ${period.to} (${period.days} jours)

═══ CHIFFRES BRUTS ═══

CA total: ${revenue.total}€
Transactions: ${revenue.transactions}
Articles vendus: ${revenue.itemsSold}
Panier moyen: ${revenue.avgBasket}€
CA journalier moyen: ${revenue.dailyAvg}€

═══ DÉTAIL PAR JOUR ═══
${dailyLines || "  Pas de données journalières"}

═══ RÉPARTITION HORAIRE ═══
${hourlyLines || "  Pas de données horaires"}

═══ TENDANCES ═══
${trendLines.length > 0 ? trendLines.join("\n") : "Pas de période de comparaison disponible"}

═══ STAFFING ═══
Employés assignés: ${staffing.employeesCount}
Shifts sur la période: ${staffing.shiftsCount}
Shifts/jour moyen: ${staffing.avgShiftsPerDay}
`;

  if (costs.hasData) {
    prompt += `
═══ COÛTS (estimés charges incluses) ═══
Coût salarial estimé période: ${costs.totalEmployeeCost}€
Employés avec config coût: ${costs.employeeCount}
Heures planifiées: ${costs.scheduledHours}h
CA par heure travaillée: ${costs.scheduledHours > 0 ? Math.round((revenue.total / costs.scheduledHours) * 100) / 100 : "N/A"}€/h
`;
  }

  if (alerts.count > 0) {
    prompt += `
═══ ALERTES RÉCENTES ═══
${alerts.recent.map((a) => `  [${a.type}] ${a.title} (${a.date})`).join("\n")}
`;
  }

  prompt += `
═══ MISSION ═══

Analyse ces données comme un consultant business senior.
Donne-moi :

1. 📊 Chiffres clés du jour / de la période
2. 💰 Projection mensuelle réaliste (CA, marge estimée 70% sauf si info contraire)
3. 🧾 Comparaison charges vs marge (si données de coûts disponibles)
4. 💣 Résultat net estimé — VERDICT : rentable ou pas ?
5. ⚠️ Problèmes critiques identifiés (panier trop bas, heures creuses, etc.)
6. 📈 Analyse des tendances (croissance, stagnation, déclin)
7. 🎯 Top 3 actions prioritaires avec impact chiffré attendu
8. 🔥 Verdict final BRUTAL en une phrase
`;

  if (customQuestion) {
    prompt += `\n═══ QUESTION SPÉCIFIQUE ═══\n${customQuestion}\n`;
  }

  return prompt;
}
