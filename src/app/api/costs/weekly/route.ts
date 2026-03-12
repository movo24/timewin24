import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, errorResponse, successResponse } from "@/lib/api-helpers";
import { calculateShiftCost, FRANCE_2026_DEFAULTS, type CountryRules } from "@/lib/employer-cost";
import { getWeekBounds, toUTCDate } from "@/lib/utils";

// GET /api/costs/weekly?storeId=xxx&weekStart=YYYY-MM-DD
// Returns per-shift cost breakdown for a given week and store
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");
    const weekStartStr = searchParams.get("weekStart");

    if (!storeId || !weekStartStr) {
      return errorResponse("storeId et weekStart requis", 400);
    }

    const { weekStart, weekEnd } = getWeekBounds(weekStartStr);

    // Get shifts for the week
    const shifts = await prisma.shift.findMany({
      where: {
        storeId,
        date: { gte: weekStart, lte: weekEnd },
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            costConfig: {
              include: {
                country: true,
              },
            },
          },
        },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    // Calculate cost per shift
    let totalCost = 0;
    let totalGross = 0;
    let totalCharges = 0;
    let totalReduction = 0;
    let totalHours = 0;

    const shiftCosts = shifts.map((shift) => {
      // Handle unassigned shifts (no employee)
      if (!shift.employee) {
        const [sh, sm] = shift.startTime.split(":").map(Number);
        const [eh, em] = shift.endTime.split(":").map(Number);
        const hours = Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
        totalHours += hours;
        return {
          shiftId: shift.id,
          date: shift.date,
          startTime: shift.startTime,
          endTime: shift.endTime,
          employeeId: null,
          employeeName: "NON ASSIGNÉ",
          hours: Math.round(hours * 100) / 100,
          configured: false,
          cost: null,
        };
      }

      const costConfig = shift.employee.costConfig;

      if (!costConfig) {
        // No cost config for this employee — return null cost
        const [sh, sm] = shift.startTime.split(":").map(Number);
        const [eh, em] = shift.endTime.split(":").map(Number);
        const hours = Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
        totalHours += hours;
        return {
          shiftId: shift.id,
          date: shift.date,
          startTime: shift.startTime,
          endTime: shift.endTime,
          employeeId: shift.employee.id,
          employeeName: `${shift.employee.firstName} ${shift.employee.lastName}`,
          hours: Math.round(hours * 100) / 100,
          configured: false,
          cost: null,
        };
      }

      const country = costConfig.country;
      const rules: CountryRules = {
        code: country.code,
        name: country.name,
        currency: country.currency,
        minimumWageHour: country.minimumWageHour,
        employerRate: country.employerRate,
        reductionEnabled: country.reductionEnabled,
        reductionMaxCoeff: country.reductionMaxCoeff,
        reductionThreshold: country.reductionThreshold,
        extraHourlyCost: country.extraHourlyCost,
      };

      const breakdown = calculateShiftCost(
        shift.startTime,
        shift.endTime,
        costConfig.hourlyRateGross,
        rules,
        costConfig.employerRateOverride,
        costConfig.extraHourlyCostOverride
      );

      totalCost += breakdown.employerCostTotal;
      totalGross += breakdown.grossTotal;
      totalCharges += breakdown.chargesNet;
      totalReduction += breakdown.reductionAmount;
      totalHours += breakdown.hours;

      return {
        shiftId: shift.id,
        date: shift.date,
        startTime: shift.startTime,
        endTime: shift.endTime,
        employeeId: shift.employee.id,
        employeeName: `${shift.employee.firstName} ${shift.employee.lastName}`,
        hours: breakdown.hours,
        configured: true,
        cost: breakdown,
      };
    });

    return successResponse({
      weekStart: weekStartStr,
      storeId,
      shiftCosts,
      summary: {
        totalShifts: shifts.length,
        configuredShifts: shiftCosts.filter((s) => s.configured).length,
        totalHours: Math.round(totalHours * 100) / 100,
        totalGross: Math.round(totalGross * 100) / 100,
        totalCharges: Math.round(totalCharges * 100) / 100,
        totalReduction: Math.round(totalReduction * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
      },
    });
  } catch (err) {
    console.error("GET /api/costs/weekly error:", err);
    return errorResponse("Erreur serveur", 500);
  }
}
