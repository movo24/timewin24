import {
  fuzzyMatch,
  extractEmployeeName,
  extractStoreName,
  extractDateExpr,
  extractTargetDateExpr,
  extractTimeSlot,
  extractDuration,
  parseCommand,
} from "@/lib/manager-ia/parser";

// M116 / Manager IA — parser NLP francais 100% deterministe (rule-based, sans
// LLM). Verrouille l'extraction d'intention a partir de commandes en langage
// naturel : action, employe (fuzzy), magasin, date, creneau, duree.

const ctx = {
  knownEmployees: [
    { firstName: "Alice", lastName: "Martin" },
    { firstName: "Bob", lastName: "Durand" },
  ],
  knownStores: ["Wesley Centre", "Wesley Gare"],
};

describe("fuzzyMatch", () => {
  it("match exact (insensible casse/accents)", () => {
    expect(fuzzyMatch("alice", ["Alice", "Bob"])).toBe("Alice");
    expect(fuzzyMatch("DURAND", ["Durand"])).toBe("Durand");
  });
  it("tolere une faute de frappe sous le seuil Levenshtein", () => {
    expect(fuzzyMatch("alise", ["Alice"], 2)).toBe("Alice");
  });
  it("retourne null au-dela du seuil", () => {
    expect(fuzzyMatch("xyzzy", ["Alice", "Bob"], 2)).toBeNull();
  });
  it("gere le prefixe (startsWith)", () => {
    expect(fuzzyMatch("ali", ["Alice"])).toBe("Alice");
  });
});

describe("extractEmployeeName", () => {
  it("trouve un prenom connu", () => {
    expect(extractEmployeeName("mets Alice demain", ctx.knownEmployees)).toBe("Alice");
  });
  it("trouve via nom complet flou", () => {
    expect(extractEmployeeName("planifie alice martin", ctx.knownEmployees)).toBe("Alice Martin");
  });
  it("ignore les mots communs et retourne null si aucun employe", () => {
    expect(extractEmployeeName("optimise la semaine", ctx.knownEmployees)).toBeNull();
  });
});

describe("extractStoreName", () => {
  it("trouve un magasin par inclusion directe", () => {
    expect(extractStoreName("mets Alice à Wesley Gare", ctx.knownStores)).toBe("Wesley Gare");
  });
  it("retourne null si aucun magasin", () => {
    expect(extractStoreName("optimise demain", ctx.knownStores)).toBeNull();
  });
});

describe("extractDateExpr", () => {
  it("reconnait les mots-cles relatifs", () => {
    expect(extractDateExpr("mets Alice demain")).toBe("tomorrow");
    expect(extractDateExpr("planifie aujourd'hui")).toBe("today");
  });
  it("reconnait un jour de semaine", () => {
    expect(extractDateExpr("Alice travaille mardi")).toBe("weekday:2");
    expect(extractDateExpr("planning dimanche")).toBe("weekday:0");
  });
  it("reconnait une date explicite 'le 15'", () => {
    expect(extractDateExpr("mets Alice le 15")).toBe("day:15");
  });
  it("retourne null sans date", () => {
    expect(extractDateExpr("optimise le planning")).toBeNull();
  });
});

describe("extractTargetDateExpr", () => {
  it("extrait la destination d'un MOVE ('à mercredi')", () => {
    expect(extractTargetDateExpr("déplace de mardi à mercredi")).toBe("weekday:3");
  });
  it("retourne null sans destination", () => {
    expect(extractTargetDateExpr("supprime mardi")).toBeNull();
  });
});

describe("extractTimeSlot", () => {
  it("parse une plage horaire explicite 'de 9h à 17h'", () => {
    expect(extractTimeSlot("de 9h à 17h")).toEqual({ timeSlot: null, startTime: "09:00", endTime: "17:00" });
  });
  it("parse 'jusqu'à 18h' (fin seule)", () => {
    expect(extractTimeSlot("rallonge jusqu'à 18h")).toEqual({ timeSlot: null, startTime: null, endTime: "18:00" });
  });
  it("parse 'à partir de 10h30' (début seul)", () => {
    expect(extractTimeSlot("à partir de 10h30")).toEqual({ timeSlot: null, startTime: "10:30", endTime: null });
  });
  it("reconnait un creneau nomme (matin)", () => {
    expect(extractTimeSlot("mets Alice le matin")).toEqual({ timeSlot: "matin", startTime: null, endTime: null });
  });
  it("retourne tout null sans info horaire", () => {
    expect(extractTimeSlot("optimise")).toEqual({ timeSlot: null, startTime: null, endTime: null });
  });
});

describe("extractDuration", () => {
  it("parse 'de 2h30' en minutes", () => {
    expect(extractDuration("ajoute un shift de 2h30")).toBe(150);
  });
  it("parse 'de 30 min'", () => {
    expect(extractDuration("pause de 30 min")).toBe(30);
  });
  it("parse 'de 1 heure'", () => {
    expect(extractDuration("de 1 heure")).toBe(60);
  });
  it("retourne null sans duree", () => {
    expect(extractDuration("optimise la semaine")).toBeNull();
  });
});

describe("parseCommand (integration)", () => {
  it("compose un intent complet de creation", () => {
    const intent = parseCommand("mets Alice à Wesley Gare mardi de 9h à 17h", ctx);
    expect(intent.action).toBe("CREATE");
    expect(intent.employeeName).toBe("Alice");
    expect(intent.storeName).toBe("Wesley Gare");
    expect(intent.dateExpr).toBe("weekday:2");
    expect(intent.startTimeExpr).toBe("09:00");
    expect(intent.endTimeExpr).toBe("17:00");
    expect(intent.rawCommand).toContain("Alice");
  });
  it("detecte l'action DELETE", () => {
    expect(parseCommand("supprime le shift d'Alice mardi", ctx).action).toBe("DELETE");
  });
  it("MOVE : source et destination distinctes", () => {
    const intent = parseCommand("déplace Alice de mardi à mercredi", ctx);
    expect(intent.action).toBe("MOVE");
    expect(intent.dateExpr).toBe("weekday:2");
    expect(intent.targetDateExpr).toBe("weekday:3");
  });
});
