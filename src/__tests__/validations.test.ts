import {
  storeCreateSchema,
  employeeCreateSchema,
  shiftCreateSchema,
  unavailabilityCreateSchema,
  autoGenerateSchema,
  productCreateSchema,
} from "@/lib/validations";

// M116 — couverture des schémas Zod (frontière de validation de chaque écriture API).

describe("storeCreateSchema", () => {
  it("accepte un magasin minimal et applique les défauts", () => {
    const r = storeCreateSchema.safeParse({ name: "Wesley" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe("ACTIVE");
      expect(r.data.maxSimultaneous).toBe(1);
      expect(r.data.needsManager).toBe(false);
    }
  });
  it("refuse un nom vide", () => {
    expect(storeCreateSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("borne la latitude à [-90, 90]", () => {
    expect(storeCreateSchema.safeParse({ name: "X", latitude: 91 }).success).toBe(false);
    expect(storeCreateSchema.safeParse({ name: "X", latitude: 48.85 }).success).toBe(true);
  });
  it("convertit latitude '' → null (emptyToNull)", () => {
    const r = storeCreateSchema.safeParse({ name: "X", latitude: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.latitude).toBeNull();
  });
  it("borne maxOverlapMinutes à [0, 60]", () => {
    expect(storeCreateSchema.safeParse({ name: "X", maxOverlapMinutes: 61 }).success).toBe(false);
  });
});

describe("employeeCreateSchema", () => {
  const base = { firstName: "A", lastName: "B", email: "a@b.fr" };
  it("accepte un employé valide avec défauts", () => {
    const r = employeeCreateSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.role).toBe("EMPLOYEE");
      expect(r.data.shiftPreference).toBe("JOURNEE");
      expect(r.data.priority).toBe(1);
    }
  });
  it("refuse un email invalide", () => {
    expect(employeeCreateSchema.safeParse({ ...base, email: "pas-un-email" }).success).toBe(false);
  });
  it("exige un mot de passe ≥ 8 caractères s'il est fourni", () => {
    expect(employeeCreateSchema.safeParse({ ...base, password: "court" }).success).toBe(false);
    expect(employeeCreateSchema.safeParse({ ...base, password: "longmotdepasse" }).success).toBe(true);
  });
  it("borne la priorité à [1, 3]", () => {
    expect(employeeCreateSchema.safeParse({ ...base, priority: 4 }).success).toBe(false);
  });
  it("convertit weeklyHours '' → null", () => {
    const r = employeeCreateSchema.safeParse({ ...base, weeklyHours: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.weeklyHours).toBeNull();
  });
});

describe("shiftCreateSchema", () => {
  const base = { storeId: "s1", date: "2026-06-22", startTime: "09:00", endTime: "17:00" };
  it("accepte un shift valide", () => {
    expect(shiftCreateSchema.safeParse(base).success).toBe(true);
  });
  it("refuse un format d'heure invalide", () => {
    expect(shiftCreateSchema.safeParse({ ...base, startTime: "9:00" }).success).toBe(false);
    expect(shiftCreateSchema.safeParse({ ...base, endTime: "25:00" }).success).toBe(false);
  });
  it("refuse fin ≤ début (refine)", () => {
    expect(shiftCreateSchema.safeParse({ ...base, startTime: "17:00", endTime: "09:00" }).success).toBe(false);
  });
});

describe("unavailabilityCreateSchema", () => {
  it("accepte une indispo FIXED valide", () => {
    expect(unavailabilityCreateSchema.safeParse({ employeeId: "e1", type: "FIXED", dayOfWeek: 1 }).success).toBe(true);
  });
  it("refuse un type inconnu", () => {
    expect(unavailabilityCreateSchema.safeParse({ employeeId: "e1", type: "MAYBE" }).success).toBe(false);
  });
  it("borne dayOfWeek à [0, 6]", () => {
    expect(unavailabilityCreateSchema.safeParse({ employeeId: "e1", type: "FIXED", dayOfWeek: 7 }).success).toBe(false);
  });
});

describe("autoGenerateSchema", () => {
  it("accepte avec défauts (mode preview, durée 7h)", () => {
    const r = autoGenerateSchema.safeParse({ weekStart: "2026-06-22" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.mode).toBe("preview");
      expect(r.data.shiftDurationHours).toBe(7);
      expect(r.data.useManagerBrain).toBe(true);
    }
  });
  it("refuse un mode inconnu", () => {
    expect(autoGenerateSchema.safeParse({ weekStart: "2026-06-22", mode: "delete" }).success).toBe(false);
  });
  it("borne shiftDurationHours à [4, 12]", () => {
    expect(autoGenerateSchema.safeParse({ weekStart: "2026-06-22", shiftDurationHours: 13 }).success).toBe(false);
  });
});

describe("productCreateSchema", () => {
  it("accepte un produit minimal (source défaut manual)", () => {
    const r = productCreateSchema.safeParse({ name: "Bonbon" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.source).toBe("manual");
  });
  it("refuse un prix négatif", () => {
    expect(productCreateSchema.safeParse({ name: "X", price: -1 }).success).toBe(false);
  });
  it("refuse une source inconnue", () => {
    expect(productCreateSchema.safeParse({ name: "X", source: "hack" }).success).toBe(false);
  });
});
