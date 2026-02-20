"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { WeekGrid } from "@/components/planning/week-grid";
import { ShiftModal } from "@/components/planning/shift-modal";
import { getMondayOfWeek, formatDate } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Calendar, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface Shift {
  id: string;
  storeId: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  note: string | null;
  store: { id: string; name: string };
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    weeklyHours?: number | null;
  };
}

interface EmployeeInfo {
  id: string;
  firstName: string;
  lastName: string;
  weeklyHours: number | null;
  stores: { store: { id: string; name: string } }[];
}

export default function EmployeePlanningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const initialWeek = searchParams.get("weekStart") || getMondayOfWeek();

  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [weekStart, setWeekStart] = useState(initialWeek);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [defaultDate, setDefaultDate] = useState("");
  const [storeEmployees, setStoreEmployees] = useState<
    { id: string; firstName: string; lastName: string }[]
  >([]);

  useEffect(() => {
    fetch(`/api/employees/${id}`)
      .then((r) => r.json())
      .then(setEmployee)
      .catch(() => {});
  }, [id]);

  const loadShifts = useCallback(async () => {
    const res = await fetch(
      `/api/shifts?employeeId=${id}&weekStart=${weekStart}`
    );
    if (res.ok) {
      const data = await res.json();
      setShifts(data.shifts || []);
    }
  }, [id, weekStart]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  // Load this employee as the only option for shift creation
  useEffect(() => {
    if (employee) {
      setStoreEmployees([
        {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
        },
      ]);
    }
  }, [employee]);

  function navigateWeek(direction: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7 * direction);
    setWeekStart(formatDate(d));
  }

  function handleShiftClick(shift: Shift) {
    setEditingShift(shift);
    setDefaultDate("");
    setShiftModalOpen(true);
  }

  function handleAddShift(date: string) {
    setEditingShift(null);
    setDefaultDate(date);
    setShiftModalOpen(true);
  }

  // Calculate total hours
  let totalHours = 0;
  for (const shift of shifts) {
    const [sh, sm] = shift.startTime.split(":").map(Number);
    const [eh, em] = shift.endTime.split(":").map(Number);
    totalHours += eh * 60 + em - (sh * 60 + sm);
  }
  totalHours = totalHours / 60;

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekLabel = `${new Date(weekStart).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  })} - ${weekEnd.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/planning"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au planning
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {employee
            ? `${employee.firstName} ${employee.lastName}`
            : "Chargement..."}
        </h1>
        {employee?.weeklyHours && (
          <p className="text-sm text-gray-500 mt-1">
            Contrat: {employee.weeklyHours}h/semaine
          </p>
        )}
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-2 mb-6">
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigateWeek(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeekStart(getMondayOfWeek())}
        >
          <Calendar className="h-4 w-4 mr-1.5" />
          Aujourd&apos;hui
        </Button>
        <span className="text-sm font-medium text-gray-700 min-w-[200px] text-center">
          {weekLabel}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigateWeek(1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <WeekGrid
        weekStart={weekStart}
        shifts={shifts}
        onShiftClick={handleShiftClick}
        onAddShift={handleAddShift}
        mode="employee"
      />

      {/* Stats */}
      <div className="mt-4 flex gap-6 text-sm text-gray-500">
        <span>{shifts.length} shift(s)</span>
        <span>
          {totalHours.toFixed(1)}h travaillées
          {employee?.weeklyHours && (
            <span
              className={
                totalHours > employee.weeklyHours
                  ? "text-red-600 font-medium"
                  : ""
              }
            >
              {" "}
              / {employee.weeklyHours}h
            </span>
          )}
        </span>
      </div>

      <ShiftModal
        open={shiftModalOpen}
        onClose={() => setShiftModalOpen(false)}
        onSaved={loadShifts}
        storeId={editingShift?.storeId || employee?.stores[0]?.store.id || ""}
        shift={
          editingShift
            ? {
                id: editingShift.id,
                storeId: editingShift.storeId,
                employeeId: editingShift.employeeId,
                date: editingShift.date.split("T")[0],
                startTime: editingShift.startTime,
                endTime: editingShift.endTime,
                note: editingShift.note || "",
              }
            : null
        }
        defaultDate={defaultDate}
        employees={storeEmployees}
      />
    </div>
  );
}
