import { z } from "zod";

// Helper: converts "" to null before validation
const emptyToNull = (val: unknown) => (val === "" || val === undefined ? null : val);

// Store
const storeStatuses = ["ACTIVE", "INACTIVE"] as const;

export const storeCreateSchema = z.object({
  name: z.string().min(1, "Le nom est obligatoire").max(100),
  storeCode: z.string().max(20).optional().nullable(),
  status: z.enum(storeStatuses).optional().default("ACTIVE"),
  unitId: z.string().optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  country: z.string().max(5).optional().nullable(),
  timezone: z.string().max(50).optional().nullable(),
  latitude: z.preprocess(emptyToNull, z.number().min(-90).max(90).nullable()).optional(),
  longitude: z.preprocess(emptyToNull, z.number().min(-180).max(180).nullable()).optional(),
  vatRate: z.number().min(0).max(100).optional().nullable(),
  currency: z.string().max(5).optional().nullable(),
  openedAt: z.string().optional().nullable(),
  minEmployees: z.number().int().min(0).optional().nullable(),
  maxEmployees: z.number().int().min(0).optional().nullable(),
  needsManager: z.boolean().optional().default(false),
  allowOverlap: z.boolean().optional().default(false),
  maxOverlapMinutes: z.number().int().min(0).max(60).optional().default(0),
  maxSimultaneous: z.number().int().min(1).max(10).optional().default(1),
});

export const storeUpdateSchema = storeCreateSchema.partial();

// Store Schedule (per day of week)
export const storeScheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  closed: z.boolean().default(false),
  openTime: z.string().max(5).optional().nullable(),
  closeTime: z.string().max(5).optional().nullable(),
  minEmployees: z.number().int().min(0).optional().nullable(),
  maxEmployees: z.number().int().min(0).optional().nullable(),
  maxSimultaneous: z.number().int().min(1).max(10).optional().nullable(),
});

export const storeSchedulesBulkSchema = z.object({
  schedules: z.array(storeScheduleSchema).min(1).max(7),
});

// Employee
const contractTypes = ["CDI", "CDD", "INTERIM", "EXTRA", "STAGE"] as const;
const shiftPreferences = ["MATIN", "APRES_MIDI", "JOURNEE"] as const;
const skillTypes = ["CAISSE", "OUVERTURE", "FERMETURE", "GESTION", "MANAGER", "CONSEIL", "STOCK", "SAV"] as const;

export const employeeCreateSchema = z.object({
  firstName: z.string().min(1, "Le prénom est obligatoire").max(50),
  lastName: z.string().min(1, "Le nom est obligatoire").max(50),
  email: z.string().min(1, "L'email est obligatoire").email("Email invalide"),
  password: z.string().min(8, "Mot de passe min. 8 caractères").optional(),
  role: z.enum(["EMPLOYEE", "MANAGER"]).optional().default("EMPLOYEE"),
  active: z.boolean().optional().default(true),
  weeklyHours: z.preprocess(emptyToNull, z.number().min(0).max(168).nullable()).optional(),
  contractType: z.preprocess(emptyToNull, z.enum(contractTypes).nullable()).optional(),
  priority: z.number().int().min(1).max(3).optional().default(1),
  maxHoursPerDay: z.preprocess(emptyToNull, z.number().min(1).max(24).nullable()).optional(),
  maxHoursPerWeek: z.preprocess(emptyToNull, z.number().min(1).max(168).nullable()).optional(),
  minRestBetween: z.preprocess(emptyToNull, z.number().min(0).max(48).nullable()).optional(),
  skills: z.array(z.enum(skillTypes)).optional().default([]),
  preferredStoreId: z.preprocess(emptyToNull, z.string().nullable()).optional(),
  shiftPreference: z.enum(shiftPreferences).optional().default("JOURNEE"),
  storeIds: z.array(z.string()).optional().default([]),
});

export const employeeUpdateSchema = employeeCreateSchema.partial();

// Unavailability
const unavailabilityTypes = ["FIXED", "VARIABLE"] as const;

export const unavailabilityCreateSchema = z.object({
  employeeId: z.string().min(1),
  type: z.enum(unavailabilityTypes),
  dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  date: z.string().optional().nullable(),
  startTime: z.string().max(5).optional().nullable(),
  endTime: z.string().max(5).optional().nullable(),
  reason: z.string().max(255).optional().nullable(),
});

// Shift
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const shiftCreateSchema = z
  .object({
    storeId: z.string().min(1, "Boutique obligatoire"),
    employeeId: z.string().min(1).optional().nullable(),
    date: z.string().min(1, "Date obligatoire"),
    startTime: z
      .string()
      .regex(timeRegex, "Format HH:mm requis (ex: 09:00)"),
    endTime: z.string().regex(timeRegex, "Format HH:mm requis (ex: 17:00)"),
    note: z.string().max(500).optional().nullable(),
  })
  .refine(
    (data) => {
      return data.startTime < data.endTime;
    },
    {
      message: "L'heure de fin doit être après l'heure de début",
      path: ["endTime"],
    }
  );

export const shiftUpdateSchema = shiftCreateSchema;

// Duplicate week
export const duplicateWeekSchema = z.object({
  storeId: z.string().optional(),
  sourceWeekStart: z.string().min(1, "Date de début de semaine source requise"),
  targetWeekStart: z.string().min(1, "Date de début de semaine cible requise"),
});

// Auto-generate planning
export const autoGenerateSchema = z.object({
  storeId: z.string().optional().default(""), // vide = tous les magasins
  weekStart: z.string().min(1, "Date de début de semaine obligatoire"),
  mode: z.enum(["preview", "save"]).default("preview"),
  shiftDurationHours: z.number().min(4).max(12).default(7),
  shiftGranularity: z.number().min(15).max(120).default(60),
  // Multi-scenario solver options
  useScenarios: z.boolean().optional().default(false),
  idealShiftRange: z.tuple([z.number().min(2).max(12), z.number().min(2).max(12)]).optional(),
  // Manager Brain: intelligent placement based on employee profiles
  useManagerBrain: z.boolean().optional().default(true),
});

// Types
export type StoreCreate = z.infer<typeof storeCreateSchema>;
export type EmployeeCreate = z.infer<typeof employeeCreateSchema>;
export type ShiftCreate = z.infer<typeof shiftCreateSchema>;

// ─── Product Catalogue ───────────────────────────────────

export const productCreateSchema = z.object({
  name: z.string().min(1, "Le nom est obligatoire").max(200),
  barcode: z.string().max(50).optional().nullable(),
  sku: z.string().max(50).optional().nullable(),
  price: z.number().min(0).optional().nullable(),
  oldPrice: z.number().min(0).optional().nullable(),
  currency: z.string().max(5).optional().default("EUR"),
  vatRate: z.number().min(0).max(100).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  variantName: z.string().max(100).optional().nullable(),
  storeId: z.string().optional().nullable(),
  active: z.boolean().optional().default(true),
  source: z.enum(["manual", "inventory_scan", "pos_sync"]).optional().default("manual"),
  sourceRef: z.string().max(100).optional().nullable(),
  priceUpdatedAt: z.string().optional().nullable(),
});

export const productUpdateSchema = productCreateSchema.partial();

// ─── Label Templates ─────────────────────────────────────

export const labelTemplateCreateSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["a4", "thermal"]),
  labelsPerPage: z.number().int().min(1).max(100).optional().nullable(),
  columns: z.number().int().min(1).max(10).optional().nullable(),
  rows: z.number().int().min(1).max(20).optional().nullable(),
  widthMm: z.number().min(10).max(300).optional().nullable(),
  heightMm: z.number().min(10).max(300).optional().nullable(),
  showBarcode: z.boolean().optional().default(true),
  showPrice: z.boolean().optional().default(true),
  showOldPrice: z.boolean().optional().default(false),
  showSku: z.boolean().optional().default(false),
  showStoreName: z.boolean().optional().default(false),
  showDate: z.boolean().optional().default(false),
  showPromoLabel: z.boolean().optional().default(false),
  showVariant: z.boolean().optional().default(false),
  barcodeFormat: z.enum(["EAN13", "EAN8", "CODE128"]).optional().default("EAN13"),
  fontSize: z.number().int().min(6).max(24).optional().default(10),
  priceFontSize: z.number().int().min(8).max(36).optional().default(14),
  isDefault: z.boolean().optional().default(false),
});

export const labelTemplateUpdateSchema = labelTemplateCreateSchema.partial();

// ─── Label Print Job ─────────────────────────────────────

export const labelPrintJobCreateSchema = z.object({
  storeId: z.string().optional().nullable(),
  templateId: z.string().min(1, "Template obligatoire"),
  format: z.enum(["pdf", "zpl"]).default("pdf"),
  notes: z.string().max(500).optional().nullable(),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().min(1).max(9999),
    promoLabel: z.string().max(50).optional().nullable(),
  })).min(1, "Au moins un produit requis"),
});
