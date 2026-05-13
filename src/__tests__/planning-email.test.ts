import {
  computeShiftHours,
  escHtml,
  formatDayLabel,
  formatWeekLabel,
  buildPlanningEmailHtml,
  type ShiftRow,
} from "@/lib/notifications/planning-email";

// ─── Test 1 : Calcul d'heures simples (10:00 → 18:00 = 8h) ─────────────
describe("computeShiftHours", () => {
  it("retourne 8h pour 10:00 → 18:00", () => {
    expect(computeShiftHours("10:00", "18:00")).toBe(8);
  });

  it("retourne 7.5h pour 09:00 → 16:30", () => {
    expect(computeShiftHours("09:00", "16:30")).toBe(7.5);
  });

  // ─── Test 3 : Shift qui passe minuit ──────────────────────────────────
  it("retourne 8h pour 22:00 → 06:00 (overnight)", () => {
    expect(computeShiftHours("22:00", "06:00")).toBe(8);
  });

  it("retourne 1h pour 23:30 → 00:30 (overnight court)", () => {
    expect(computeShiftHours("23:30", "00:30")).toBe(1);
  });

  it("retourne 8h pour 00:00 → 08:00 (juste après minuit)", () => {
    expect(computeShiftHours("00:00", "08:00")).toBe(8);
  });

  it("retourne 0h pour 10:00 → 10:00 (shift vide)", () => {
    expect(computeShiftHours("10:00", "10:00")).toBe(0);
  });

  it("retourne 24h pour 10:00 → 10:00 si on considère wrap (cas limite — actuellement 0)", () => {
    // Documentation : un shift identique start === end est traité comme 0h, pas 24h.
    // Pour 24h on devrait passer endTime=09:59 ou 10:00 du lendemain via une autre source.
    expect(computeShiftHours("10:00", "10:00")).toBe(0);
  });
});

// ─── Test 6 (partiel) : Échappement HTML pour XSS ──────────────────────
describe("escHtml", () => {
  it("échappe les balises HTML", () => {
    expect(escHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });

  it("échappe les guillemets", () => {
    expect(escHtml('Hello "world"')).toBe("Hello &quot;world&quot;");
  });

  it("échappe les ampersands", () => {
    expect(escHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("retourne chaîne vide pour null/undefined", () => {
    expect(escHtml(null)).toBe("");
    expect(escHtml(undefined)).toBe("");
  });

  it("préserve un texte normal", () => {
    expect(escHtml("Hamza Khaled")).toBe("Hamza Khaled");
  });
});

// ─── Date formatting (FR locale, UTC-safe) ──────────────────────────────
describe("formatDayLabel / formatWeekLabel", () => {
  it("formate un jour en français court", () => {
    // 2026-04-20 = lundi
    expect(formatDayLabel("2026-04-20")).toBe("Lun. 20 avr.");
  });

  it("formate la semaine du 20 au 26 avril 2026", () => {
    expect(formatWeekLabel("2026-04-20")).toBe("semaine du 20 au 26 avr. 2026");
  });

  it("formate une semaine qui chevauche deux mois", () => {
    // 2026-04-27 lundi → 2026-05-03 dimanche
    expect(formatWeekLabel("2026-04-27")).toBe(
      "semaine du 27 avr. au 3 mai 2026"
    );
  });
});

// ─── Test 1 + 2 : Template HTML — semaine vs jour ───────────────────────
describe("buildPlanningEmailHtml", () => {
  const baseShifts: ShiftRow[] = [
    {
      date: "2026-04-20",
      dayLabel: "Lun. 20 avr.",
      storeName: "Châtelet Quai",
      startTime: "10:00",
      endTime: "18:00",
      hours: 8,
    },
  ];

  it("affiche 'Total semaine' par défaut", () => {
    const html = buildPlanningEmailHtml({
      employeeFirstName: "Hamza",
      weekLabel: "semaine du 20 au 26 avr. 2026",
      shifts: baseShifts,
      totalHours: 8,
    });
    expect(html).toContain("Total semaine");
    expect(html).not.toContain("Total journée");
    expect(html).toContain("8.0h");
  });

  it("affiche 'Total journée' quand isSingleDay=true", () => {
    const html = buildPlanningEmailHtml({
      employeeFirstName: "Hamza",
      weekLabel: "Lun. 20 avr.",
      shifts: baseShifts,
      totalHours: 8,
      isSingleDay: true,
    });
    expect(html).toContain("Total journée");
    expect(html).not.toContain("Total semaine");
  });

  // ─── Test 5 : Aucun shift ────────────────────────────────────────────
  it("affiche le message 'Aucun shift prévu cette semaine'", () => {
    const html = buildPlanningEmailHtml({
      employeeFirstName: "Hamza",
      weekLabel: "semaine du 20 au 26 avr. 2026",
      shifts: [],
      totalHours: 0,
    });
    expect(html).toContain("Aucun shift prévu cette semaine");
    expect(html).not.toContain("<table");
  });

  it("affiche 'Aucun shift prévu ce jour' en mode jour vide", () => {
    const html = buildPlanningEmailHtml({
      employeeFirstName: "Hamza",
      weekLabel: "Lun. 20 avr.",
      shifts: [],
      totalHours: 0,
      isSingleDay: true,
    });
    expect(html).toContain("Aucun shift prévu ce jour");
  });

  // ─── Test 6 : XSS prévention dans le template ────────────────────────
  it("échappe les noms d'employé et magasin pour empêcher XSS", () => {
    const malicious: ShiftRow[] = [
      {
        date: "2026-04-20",
        dayLabel: "Lun. 20 avr.",
        storeName: '<script>alert("xss")</script>',
        startTime: "10:00",
        endTime: "18:00",
        hours: 8,
      },
    ];
    const html = buildPlanningEmailHtml({
      employeeFirstName: '<img src=x onerror=alert(1)>',
      weekLabel: "semaine du 20 au 26 avr. 2026",
      shifts: malicious,
      totalHours: 8,
    });
    // Aucune balise <script> ou <img> active — toutes doivent être inertes (échappées)
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<img\b/i);
    // Vérifie que les balises malicieuses sont bien présentes mais sous forme échappée
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
    // Et les guillemets aussi
    expect(html).toContain('&quot;xss&quot;');
  });

  it("inclut un bouton 'Voir mon planning' si appUrl fourni", () => {
    const html = buildPlanningEmailHtml({
      employeeFirstName: "Hamza",
      weekLabel: "semaine du 20 au 26 avr. 2026",
      shifts: baseShifts,
      totalHours: 8,
      appUrl: "https://timewin24.fr",
    });
    expect(html).toContain("https://timewin24.fr");
    expect(html).toContain("Voir mon planning");
  });

  it("n'inclut pas le bouton si appUrl absent", () => {
    const html = buildPlanningEmailHtml({
      employeeFirstName: "Hamza",
      weekLabel: "semaine du 20 au 26 avr. 2026",
      shifts: baseShifts,
      totalHours: 8,
    });
    expect(html).not.toContain("Voir mon planning");
  });
});
