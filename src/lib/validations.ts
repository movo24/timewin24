import { z } from "zod";

// Helper: converts "" to null before validation
const emptyToNull = (val: unknown) => (val === "" || val === undefined ? null : val);

// Store
export const storeCreateSchema = z.object({
  name: z.string().min(1, "Le nom est obligatoire").max(100),
  city: z.string().max(100).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  timezone: z.string().max(50).optional().nullable(),
  latitude: z.preprocess(emptyToNull, z.number().min(-90).max(90).nullable()).optional(),
  longitude: z.preprocess(emptyToNull, z.number().min(-180).max(180).nullable()).optional(),
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
  email: z.preprocess(emptyToNull, z.string().email("Email invalide").nullable()),
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
});

// Types
export type StoreCreate = z.infer<typeof storeCreateSchema>;
export type EmployeeCreate = z.infer<typeof employeeCreateSchema>;
export type ShiftCreate = z.infer<typeof shiftCreateSchema>;
