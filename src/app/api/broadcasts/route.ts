import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuthenticated,
  requireManagerOrAdmin,
  errorResponse,
  successResponse,
} from "@/lib/api-helpers";
import { BroadcastScope } from "@/generated/prisma/client";
import { z } from "zod";
import { dispatchNotificationAsync } from "@/lib/notifications/dispatcher";

const createBroadcastSchema = z.object({
  title: z.string().min(1, "Titre requis").max(200),
  body: z.string().min(1, "Contenu requis").max(10000),
  scope: z.enum(["ALL", "SELECTED"]),
  storeIds: z.array(z.string()).optional(), // Required if scope = SELECTED
});

// GET /api/broadcasts
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuthenticated();
  if (error) return error;

  const user = session!.user as { id: string; role: string; employeeId: string | null };

  if (user.role === "EMPLOYEE") {
    // Employee sees broadcasts that target their stores or ALL
    if (!user.employeeId) {
      return successResponse({ broadcasts: [] });
    }

    // Get employee's store IDs
    const storeLinks = await prisma.storeEmployee.findMany({
      where: { employeeId: user.employeeId },
      select: { storeId: true },
    });
    const storeIds = storeLinks.map((s) => s.storeId);

    const broadcasts = await prisma.broadcast.findMany({
      where: {
        OR: [
          { scope: BroadcastScope.ALL },
          ...(storeIds.length > 0
            ? [{ scope: BroadcastScope.SELECTED, stores: { some: { storeId: { in: storeIds } } } }]
            : []),
        ],
      },
      include: {
        author: { select: { id: true, name: true } },
        stores: {
          include: { store: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return successResponse({ broadcasts });
  }

  // Admin/Manager sees all
  const broadcasts = await prisma.broadcast.findMany({
    include: {
      author: { select: { id: true, name: true } },
      stores: {
        include: { store: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return successResponse({ broadcasts });
}

// POST /api/broadcasts — Admin/Manager only
export async function POST(req: NextRequest) {
  const { session, error } = await requireManagerOrAdmin();
  if (error) return error;

  const user = session!.user as { id: string };
  const body = await req.json();
  const parsed = createBroadcastSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues.map((e) => e.message).join(", "));
  }

  const { title, body: broadcastBody, scope, storeIds } = parsed.data;

  if (scope === "SELECTED" && (!storeIds || storeIds.length === 0)) {
    return errorResponse("Sélectionnez au moins un magasin");
  }

  const broadcast = await prisma.broadcast.create({
    data: {
      authorId: user.id,
      title,
      body: broadcastBody,
      scope,
      ...(scope === "SELECTED" && storeIds
        ? {
            stores: {
              create: storeIds.map((storeId) => ({ storeId })),
            },
          }
        : {}),
    },
    include: {
      author: { select: { id: true, name: true } },
      stores: {
        include: { store: { select: { id: true, name: true } } },
      },
    },
  });

  // Notify targeted employees
  let targetUserIds: string[] = [];
  if (scope === "ALL") {
    const empUsers = await prisma.user.findMany({
      where: { role: "EMPLOYEE", active: true, employeeId: { not: null } },
      select: { id: true },
    });
    targetUserIds = empUsers.map((u) => u.id);
  } else if (storeIds && storeIds.length > 0) {
    const storeEmps = await prisma.storeEmployee.findMany({
      where: { storeId: { in: storeIds } },
      select: { employeeId: true },
    });
    const empIds = [...new Set(storeEmps.map((se) => se.employeeId))];
    if (empIds.length > 0) {
      const empUsers = await prisma.user.findMany({
        where: { employeeId: { in: empIds }, active: true },
        select: { id: true },
      });
      targetUserIds = empUsers.map((u) => u.id);
    }
  }
  if (targetUserIds.length > 0) {
    dispatchNotificationAsync({
      userIds: targetUserIds,
      eventType: "BROADCAST",
      context: { title },
    });
  }

  return successResponse(broadcast, 201);
}
