import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

const TEMPLATES = [
  { name: "A4 — 24 étiquettes (70×37mm)", type: "a4", labelsPerPage: 24, columns: 3, rows: 8, isDefault: true },
  { name: "A4 — 30 étiquettes (70×29.7mm)", type: "a4", labelsPerPage: 30, columns: 3, rows: 10 },
  { name: "A4 — 40 étiquettes (52.5×29.7mm)", type: "a4", labelsPerPage: 40, columns: 4, rows: 10 },
  { name: "Thermique 50×30mm", type: "thermal", widthMm: 50, heightMm: 30 },
  { name: "Thermique 58×40mm", type: "thermal", widthMm: 58, heightMm: 40 },
  { name: "Thermique 60×40mm", type: "thermal", widthMm: 60, heightMm: 40 },
  { name: "Thermique 100×50mm", type: "thermal", widthMm: 100, heightMm: 50 },
];

export async function seedLabelTemplates() {
  for (const t of TEMPLATES) {
    await prisma.labelTemplate.upsert({
      where: { id: t.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase() },
      update: {},
      create: {
        id: t.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase(),
        name: t.name,
        type: t.type,
        labelsPerPage: t.labelsPerPage ?? null,
        columns: t.columns ?? null,
        rows: t.rows ?? null,
        widthMm: t.widthMm ?? null,
        heightMm: t.heightMm ?? null,
        isDefault: t.isDefault ?? false,
        isSystem: true,
      },
    });
  }
  console.log(`✅ Seeded ${TEMPLATES.length} label templates`);
}

// Allow direct execution
if (require.main === module) {
  seedLabelTemplates()
    .then(() => prisma.$disconnect())
    .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
}
