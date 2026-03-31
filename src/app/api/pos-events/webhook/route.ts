import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/api-helpers";
import { checkRateLimit, RATE_LIMITS, getClientIp } from "@/lib/rate-limit";
import { validatePosAuth } from "@/lib/pos-auth";

// POST /api/pos-events/webhook
// Reçoit les events POS en temps réel (sale.completed, session.opened, etc.)
// Auth : HMAC SHA-256 ou X-POS-Secret (legacy)
export async function POST(req: NextRequest) {
  try {
    // Rate limit: 200 events per minute per IP
    const ip = getClientIp(req);
    const rl = checkRateLimit(`webhook:${ip}`, RATE_LIMITS.webhook);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    // Clone body text for HMAC validation before parsing
    const bodyText = await req.text();

    const authError = await validatePosAuth(req, bodyText);
    if (authError) return authError;

    const body = JSON.parse(bodyText);
    const { eventType, employeeId, data } = body as {
      eventType: string;
      employeeId?: string;
      data: unknown;
    };

    if (!eventType) {
      return errorResponse("eventType requis");
    }

    // ── Store sync events: bypass PosStoreLink (store doesn't exist in TW24 yet) ──
    if (eventType === "store.created" || eventType === "store.updated") {
      const providerId = req.headers.get("x-pos-key-id") || null;
      const result = await syncStoreFromPos(providerId, data as StoreSyncPayload);
      return successResponse({ received: true, synced: true, storeCode: result.storeCode }, 201);
    }

    const posStoreId = req.headers.get("x-pos-store-id");
    if (!posStoreId) {
      return errorResponse("Header X-POS-Store-Id requis", 401);
    }

    // Resolve TW24 storeId from CAISSE posStoreId via PosStoreLink
    // CAISSE sends its own store UUID as X-POS-Store-Id (not the TW24 store ID)
    const storeLink = await prisma.posStoreLink.findFirst({
      where: { posStoreId },
      select: { storeId: true, providerId: true },
    });
    if (!storeLink) {
      return errorResponse("Magasin POS non associé à TimeWin24. Configurez le lien dans Intégrations.", 404);
    }
    const storeId = storeLink.storeId;

    // Store the raw event
    const event = await prisma.posEvent.create({
      data: {
        eventType,
        storeId,
        employeeId: employeeId || null,
        payload: data as object,
      },
    });

    // Process event inline (for critical events)
    await processEvent(event.id, eventType, storeId, storeLink.providerId, employeeId || null, data);

    return successResponse({ received: true, eventId: event.id }, 201);
  } catch (err) {
    console.error("POST /api/pos-events/webhook error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}

async function processEvent(
  eventId: string,
  eventType: string,
  storeId: string,
  providerId: string,
  employeeId: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
) {
  try {
    switch (eventType) {
      case "sale.completed": {
        if (data?.date && data?.hourSlot !== undefined) {
          // Idempotency guard: skip if this exact saleId was already processed
          if (data?.saleId) {
            const alreadyProcessed = await prisma.posEvent.findFirst({
              where: {
                storeId,
                eventType: "sale.completed",
                processedAt: { not: null },
                id: { not: eventId }, // exclude the current event
                payload: { path: ["saleId"], equals: data.saleId },
              },
              select: { id: true },
            });
            if (alreadyProcessed) {
              // Duplicate — mark processed and skip to avoid double-counting
              await prisma.posEvent.update({ where: { id: eventId }, data: { processedAt: new Date() } });
              return;
            }
          }

          const saleDate = new Date(data.date + "T00:00:00Z");
          const revenue = data.revenue || 0;
          const transactions = data.transactions || 1;
          const itemsSold = data.itemsSold || 0;

          const cardAmount = data.cardAmount || 0;
          const cashAmount = data.cashAmount || 0;

          // Aggregate hourly store-level sales data
          await prisma.posSalesData.upsert({
            where: {
              providerId_storeId_date_hourSlot: {
                providerId,
                storeId,
                date: saleDate,
                hourSlot: data.hourSlot,
              },
            },
            create: {
              providerId,
              storeId,
              date: saleDate,
              hourSlot: data.hourSlot,
              revenue,
              transactions,
              itemsSold,
              cardAmount,
              cashAmount,
            },
            update: {
              revenue: { increment: revenue },
              transactions: { increment: transactions },
              itemsSold: { increment: itemsSold },
              cardAmount: { increment: cardAmount },
              cashAmount: { increment: cashAmount },
            },
          });

          // Track per-employee daily performance if employeeId provided
          // Guard: only if Employee exists in TW24 (FK constraint on EmployeePerformanceDaily)
          if (employeeId) {
            const employeeExists = await prisma.employee.findUnique({
              where: { id: employeeId },
              select: { id: true },
            });
            if (!employeeExists) {
              // Employee not in TW24 — store error in event but don't block PosSalesData
              await prisma.posEvent.update({
                where: { id: eventId },
                data: { error: `employeeId ${employeeId} not found in TW24 Employee table — EmployeePerformanceDaily skipped` },
              });
            } else {
              const existing = await prisma.employeePerformanceDaily.findUnique({
                where: { employeeId_storeId_date: { employeeId, storeId, date: saleDate } },
                select: { id: true, totalSales: true, transactions: true, itemsSold: true },
              });
              if (existing) {
                const newTotal = existing.totalSales + revenue;
                const newTx = existing.transactions + transactions;
                await prisma.employeePerformanceDaily.update({
                  where: { id: existing.id },
                  data: {
                    totalSales: newTotal,
                    transactions: newTx,
                    itemsSold: { increment: itemsSold },
                    avgBasket: newTx > 0 ? newTotal / newTx : 0,
                    cardAmount: { increment: cardAmount },
                    cashAmount: { increment: cashAmount },
                  },
                });
              } else {
                await prisma.employeePerformanceDaily.create({
                  data: {
                    employeeId,
                    storeId,
                    date: saleDate,
                    totalSales: revenue,
                    transactions,
                    itemsSold,
                    avgBasket: transactions > 0 ? revenue / transactions : 0,
                    cardAmount,
                    cashAmount,
                  },
                });
              }
            }
          }
        }
        break;
      }

      case "session.opened":
      case "session.closed": {
        // Import into PosTimeClock
        if (employeeId && data?.time) {
          const today = new Date().toISOString().split("T")[0];
          const recordId = `session-${storeId}-${employeeId}-${today}`;

          if (eventType === "session.opened") {
            await prisma.posTimeClock.upsert({
              where: {
                providerId_posRecordId: {
                  providerId,
                  posRecordId: recordId,
                },
              },
              create: {
                providerId,
                employeeId,
                storeId,
                posRecordId: recordId,
                date: new Date(today + "T00:00:00Z"),
                clockIn: data.time,
              },
              update: {
                clockIn: data.time,
              },
            });
          } else {
            // session.closed — update clockOut
            await prisma.posTimeClock.updateMany({
              where: {
                providerId,
                posRecordId: recordId,
              },
              data: {
                clockOut: data.time,
                workedHours: data.workedHours || null,
                breakMinutes: data.breakMinutes || 0,
              },
            });
          }
        }
        break;
      }

      case "stock.alert": {
        // Generate a ManagerAlert
        const today = new Date();
        const dateOnly = new Date(today.toISOString().split("T")[0] + "T00:00:00Z");
        const contextKey = `stock-${data?.productId || "unknown"}-${today.toISOString().split("T")[0]}`;

        await prisma.managerAlert.upsert({
          where: {
            type_storeId_date_contextKey: {
              type: "AI_ANOMALY_DETECTED",
              storeId,
              date: dateOnly,
              contextKey,
            },
          },
          create: {
            type: "AI_ANOMALY_DETECTED",
            severity: "WARNING",
            storeId,
            date: dateOnly,
            title: `Alerte stock : ${data?.productName || "produit"}`,
            details: `Stock bas : ${data?.currentStock || 0} unités (seuil: ${data?.threshold || "?"})`,
            contextKey,
          },
          update: {
            details: `Stock bas : ${data?.currentStock || 0} unités (seuil: ${data?.threshold || "?"})`,
          },
        });
        break;
      }
    }

    // Mark event as processed
    await prisma.posEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date() },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Processing error";
    await prisma.posEvent.update({
      where: { id: eventId },
      data: { error: errMsg },
    });
  }
}

// ── Store sync from POS ───────────────────────────────────────────────────────
// Payload sent by POS CAISSE on store.created / store.updated
interface StoreSyncPayload {
  id: string;          // POS UUID — becomes TW24 Store.id
  name: string;
  city?: string;
  address?: string;
  storeCode?: string;  // ex: "PAR-01"
  active?: boolean;
}

async function syncStoreFromPos(
  providerId: string | null,
  payload: StoreSyncPayload
): Promise<{ storeCode: string }> {
  const { id, name, city, address, storeCode, active } = payload;
  if (!id || !name) throw new Error("store.created payload invalide: id et name requis");

  const code = storeCode || id;
  const status = active === false ? "INACTIVE" : "ACTIVE";

  // Upsert Store (POS UUID = TW24 Store.id — permanent 1:1 link)
  await prisma.store.upsert({
    where: { storeCode: code },
    create: {
      id,
      name,
      city: city || null,
      address: address || null,
      storeCode: code,
      status,
      timezone: "Europe/Paris",
      country: "FR",
      currency: "EUR",
      updatedAt: new Date(),
    },
    update: {
      name,
      city: city || null,
      address: address || null,
      status,
      updatedAt: new Date(),
    },
  });

  // Upsert PosStoreLink so sales events can resolve this store
  if (providerId) {
    await prisma.posStoreLink.upsert({
      where: { providerId_posStoreId: { providerId, posStoreId: id } },
      create: {
        providerId,
        storeId: id,
        posStoreId: id,
        posStoreName: name,
        active: status === "ACTIVE",
      },
      update: {
        storeId: id,
        posStoreName: name,
        active: status === "ACTIVE",
      },
    });
  }

  return { storeCode: code };
}
