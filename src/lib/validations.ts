import { z } from "zod";

// Store
export const storeCreateSchema = z.object({
  name: z.string().min(1, "Le nom est obligatoire").max(100),
  city: z.string().max(100).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  timezone: z.string().max(50).optional().nullable(),
});

export const storeUpdateSchema = storeCreateSchema.partial();

// Employee
export const employeeCreateSchema = z.object({
  firstName: z.string().min(1, "Le prénom est obligatoire").max(50),
  lastName: z.string().min(1, "Le nom est obligatoire").max(50),
  email: z.string().email("Email invalide"),
  active: z.boolean().optional().default(true),
  weeklyHours: z.number().min(0).max(168).optional().nullable(),
  storeIds: z.array(z.string()).optional().default([]),
});

export const employeeUpdateSchema = employeeCreateSchema.partial();

// Shift
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const shiftCreateSchema = z
  .object({
    storeId: z.string().min(1, "Boutique obligatoire"),
    employeeId: z.string().min(1, "Employé obligatoire"),
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

// Types
export type StoreCreate = z.infer<typeof storeCreateSchema>;
export type EmployeeCreate = z.infer<typeof employeeCreateSchema>;
export type ShiftCreate = z.infer<typeof shiftCreateSchema>;
