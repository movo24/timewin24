import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManagerOrAdmin, successResponse, errorResponse } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const { session, error } = await requireManagerOrAdmin();
    if (error) return error;

    const body = await req.json();
    const storeId = body.storeId;
    if (!storeId) return errorResponse("storeId requis", 400);

    // Get distinct barcode+productName from inventory scans for this store
    const scans = await prisma.inventoryCount.findMany({
      where: {
        session: { storeId },
        barcode: { not: "" },
      },
      select: { barcode: true, productName: true },
      distinct: ["barcode"],
    });

    let imported = 0;
    let skipped = 0;

    for (const scan of scans) {
      const existing = await prisma.product.findFirst({
        where: { barcode: scan.barcode, storeId },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.product.create({
        data: {
          name: scan.productName || `Produit ${scan.barcode}`,
          barcode: scan.barcode,
          storeId,
          source: "inventory_scan",
          sourceRef: scan.barcode,
        },
      });
      imported++;
    }

    await logAudit(session!.user.id, "IMPORT", "Product", storeId, { imported, skipped });

    return successResponse({ imported, skipped, total: scans.length });
  } catch (e) {
    console.error("[POST /api/products/import-from-inventory]", e);
    return errorResponse("Erreur serveur", 500);
  }
}
