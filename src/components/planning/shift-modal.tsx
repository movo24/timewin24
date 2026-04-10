"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CheckIcon, ChevronDownIcon, UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
}

interface WeekShift {
  id: string;
  employeeId: string | null;
  date: string; // "YYYY-MM-DDTHH:mm:ss.sssZ" or "YYYY-MM-DD"
  startTime: string;
  endTime: string;
}

interface StoreOption {
  id: string;
  name: string;
}

interface ShiftData {
  id?: string;
  storeId: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  note: string;
}

interface StoreScheduleInfo {
  dayOfWeek: number;
  closed: boolean;
  openTime: string;
  closeTime: string;
}

type AvailabilityStatus = "available" | "conflict" | "unassigned";

interface ShiftModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  storeId: string;
  shift?: ShiftData | null;
  defaultDate?: string;
  defaultStartTime?: string;
  employees: Employee[];
  stores?: StoreOption[];
  storeSchedules?: StoreScheduleInfo[];
  weekShifts?: WeekShift[]; // all shifts in the current week (for conflict detection)
}

// ─── Overlap helper ────────────────────────────────────────────────────────────
function timesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return s1 < e2 && s2 < e1;
}

function normalizeDate(d: string): string {
  return d.split("T")[0];
}

// ─── Employee Availability Dropdown ────────────────────────────────────────────
interface EmployeePickerProps {
  employees: Employee[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  weekShifts: WeekShift[];
  currentShiftId?: string;
  date: string;
  startTime: string;
  endTime: string;
}

function EmployeePicker({
  employees,
  value,
  onChange,
  disabled,
  weekShifts,
  currentShiftId,
  date,
  startTime,
  endTime,
}: EmployeePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Compute availability for each employee
  const statusMap = useMemo<Map<string, { status: AvailabilityStatus; conflictLabel?: string }>>(() => {
    const map = new Map<string, { status: AvailabilityStatus; conflictLabel?: string }>();
    if (!date || !startTime || !endTime) {
      employees.forEach((e) => map.set(e.id, { status: "available" }));
      return map;
    }
    for (const emp of employees) {
      const conflictingShift = weekShifts.find(
        (s) =>
          s.employeeId === emp.id &&
          normalizeDate(s.date) === date &&
          s.id !== currentShiftId &&
          timesOverlap(startTime, endTime, s.startTime, s.endTime)
      );
      if (conflictingShift) {
        map.set(emp.id, {
          status: "conflict",
          conflictLabel: `${conflictingShift.startTime}–${conflictingShift.endTime}`,
        });
      } else {
        map.set(emp.id, { status: "available" });
      }
    }
    return map;
  }, [employees, weekShifts, date, startTime, endTime, currentShiftId]);

  const selectedEmployee = employees.find((e) => e.id === value);
  const selectedStatus = value ? statusMap.get(value) : undefined;

  const statusDot = (status: AvailabilityStatus) =>
    cn(
      "inline-block w-2 h-2 rounded-full shrink-0 mt-0.5",
      status === "available" && "bg-emerald-500",
      status === "conflict" && "bg-red-500"
    );

  const availableCount = employees.filter(
    (e) => statusMap.get(e.id)?.status === "available"
  ).length;
  const conflictCount = employees.filter(
    (e) => statusMap.get(e.id)?.status === "conflict"
  ).length;

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border px-3 py-1 text-sm bg-white",
          "hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500",
          disabled && "opacity-50 cursor-not-allowed",
          !value && "text-gray-400",
          selectedStatus?.status === "conflict" &&
            "border-red-300 bg-red-50 text-red-700"
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          {value && selectedStatus ? (
            <>
              <span className={statusDot(selectedStatus.status)} />
              <span className="truncate">
                {selectedEmployee
                  ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}`
                  : "—"}
              </span>
              {selectedStatus.status === "conflict" && (
                <span className="text-xs text-red-500 shrink-0">
                  Conflit {selectedStatus.conflictLabel}
                </span>
              )}
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-gray-400">
              <UserIcon className="w-3.5 h-3.5" />
              Non assigné
            </span>
          )}
        </span>
        <ChevronDownIcon
          className={cn(
            "w-4 h-4 text-gray-400 shrink-0 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-64 overflow-y-auto">
          {/* Legend */}
          {employees.length > 0 && (
            <div className="flex gap-3 px-3 py-1.5 border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                {availableCount} disponible{availableCount > 1 ? "s" : ""}
              </span>
              {conflictCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                  {conflictCount} en conflit
                </span>
              )}
            </div>
          )}

          {/* Non assigné option */}
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); }}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left",
              "hover:bg-gray-50",
              !value && "bg-blue-50 font-medium"
            )}
          >
            <UserIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="text-gray-500">Non assigné</span>
            {!value && <CheckIcon className="w-3.5 h-3.5 text-blue-500 ml-auto" />}
          </button>

          {/* Divider */}
          {employees.length > 0 && <div className="border-t border-gray-100" />}

          {/* Available employees first */}
          {employees
            .filter((e) => statusMap.get(e.id)?.status === "available")
            .map((emp) => (
              <button
                key={emp.id}
                type="button"
                onClick={() => { onChange(emp.id); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left",
                  "hover:bg-emerald-50",
                  value === emp.id && "bg-emerald-50 font-medium"
                )}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 mt-0.5" />
                <span className="flex-1 truncate">
                  {emp.firstName} {emp.lastName}
                </span>
                <span className="text-[11px] text-emerald-600 shrink-0">Disponible</span>
                {value === emp.id && (
                  <CheckIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                )}
              </button>
            ))}

          {/* Conflicted employees (disabled, shown for info) */}
          {employees
            .filter((e) => statusMap.get(e.id)?.status === "conflict")
            .map((emp) => {
              const info = statusMap.get(emp.id)!;
              return (
                <button
                  key={emp.id}
                  type="button"
                  disabled
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left opacity-60 cursor-not-allowed bg-red-50/50"
                >
                  <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 mt-0.5" />
                  <span className="flex-1 truncate text-red-700">
                    {emp.firstName} {emp.lastName}
                  </span>
                  <span className="text-[11px] text-red-500 shrink-0">
                    Déjà planifié {info.conflictLabel}
                  </span>
                </button>
              );
            })}

          {employees.length === 0 && (
            <div className="px-3 py-4 text-sm text-center text-gray-400">
              Aucun employé autorisé sur ce magasin
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ShiftModal ───────────────────────────────────────────────────────────
export function ShiftModal({
  open,
  onClose,
  onSaved,
  storeId,
  shift,
  defaultDate,
  defaultStartTime = "09:00",
  employees: initialEmployees,
  stores,
  storeSchedules,
  weekShifts = [],
}: ShiftModalProps) {
  const [form, setForm] = useState<ShiftData>({
    storeId,
    employeeId: "",
    date: "",
    startTime: "09:00",
    endTime: "17:00",
    note: "",
  });
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  // Sync employees when prop changes
  useEffect(() => {
    setEmployees(initialEmployees);
  }, [initialEmployees]);

  useEffect(() => {
    if (shift) {
      setForm({ ...shift, note: shift.note || "" });
    } else {
      const [sh, sm] = (defaultStartTime || "09:00").split(":").map(Number);
      const endH = Math.min(sh + 8, 23);
      const endTime = `${endH.toString().padStart(2, "0")}:${(sm || 0).toString().padStart(2, "0")}`;
      setForm({
        storeId,
        employeeId: "",
        date: defaultDate || "",
        startTime: defaultStartTime || "09:00",
        endTime,
        note: "",
      });
    }
    setError("");
    setWarning("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift, storeId, defaultDate, defaultStartTime, open]);

  function handleStoreChange(newStoreId: string) {
    setForm((prev) => ({ ...prev, storeId: newStoreId, employeeId: "" }));
    if (newStoreId && newStoreId !== storeId) {
      setLoadingEmployees(true);
      fetch(`/api/employees?storeId=${newStoreId}&active=true&limit=100`)
        .then((r) => r.json())
        .then((data) => {
          setEmployees(data.employees || []);
        })
        .catch(() => {})
        .finally(() => setLoadingEmployees(false));
    } else if (newStoreId === storeId) {
      setEmployees(initialEmployees);
    }
  }

  const shiftHours = (() => {
    if (!form.startTime || !form.endTime) return 0;
    const [sh, sm] = form.startTime.split(":").map(Number);
    const [eh, em] = form.endTime.split(":").map(Number);
    return (eh * 60 + em - (sh * 60 + sm)) / 60;
  })();

  const clientWarnings = useMemo(() => {
    const warns: string[] = [];
    if (!storeSchedules || !form.date || !form.startTime || !form.endTime) return warns;
    const [y, m, d] = form.date.split("-").map(Number);
    if (!y || !m || !d) return warns;
    const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const sched = storeSchedules.find((s) => s.dayOfWeek === dayOfWeek);
    if (!sched) return warns;
    if (sched.closed) { warns.push("Le magasin est fermé ce jour-là"); return warns; }
    if (sched.openTime && form.startTime < sched.openTime)
      warns.push(`Début avant ouverture (${sched.openTime})`);
    if (sched.closeTime && form.endTime > sched.closeTime)
      warns.push(`Fin après fermeture (${sched.closeTime})`);
    return warns;
  }, [form.date, form.startTime, form.endTime, storeSchedules]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setWarning("");

    const url = shift?.id ? `/api/shifts/${shift.id}` : "/api/shifts";
    const method = shift?.id ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, employeeId: form.employeeId || null }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Erreur");
      return;
    }

    if (data.weeklyHoursWarning) {
      setWarning(data.weeklyHoursWarning);
      setTimeout(() => { onSaved(); onClose(); }, 2000);
      return;
    }

    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!shift?.id) return;
    if (!confirm("Supprimer ce shift ?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/shifts/${shift.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erreur lors de la suppression");
        setLoading(false);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  const showStoreSelector = stores && stores.length > 1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{shift?.id ? "Modifier le shift" : "Nouveau shift"}</DialogTitle>
          <DialogDescription>
            {shift?.id ? "Modifiez les horaires de ce shift." : "Ajoutez un nouveau créneau."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Store selector (multi-store mode) */}
          {showStoreSelector && (
            <div className="space-y-2">
              <Label>Magasin *</Label>
              <select
                className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm"
                value={form.storeId}
                onChange={(e) => handleStoreChange(e.target.value)}
                required
              >
                <option value="">Sélectionner un magasin...</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date + times first so conflict status is computed before picker opens */}
          <div className="space-y-2">
            <Label>Date *</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Début *</Label>
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Fin *</Label>
              <Input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Shift duration */}
          {shiftHours > 0 && (
            <div className="text-xs text-gray-500 flex items-center gap-2">
              <span>Durée : {shiftHours.toFixed(1)}h</span>
              {shiftHours > 6 && (
                <span className="text-amber-600 font-medium">— pause 30min recommandée</span>
              )}
            </div>
          )}

          {/* Employee picker with availability colors */}
          <div className="space-y-2">
            <Label>Employé</Label>
            {loadingEmployees ? (
              <div className="flex h-9 items-center px-3 text-sm text-gray-400 border rounded-md">
                Chargement...
              </div>
            ) : (
              <EmployeePicker
                employees={employees}
                value={form.employeeId}
                onChange={(id) => setForm({ ...form, employeeId: id })}
                weekShifts={weekShifts}
                currentShiftId={shift?.id}
                date={form.date}
                startTime={form.startTime}
                endTime={form.endTime}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Note</Label>
            <Input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Note optionnelle..."
            />
          </div>

          {clientWarnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
              {w}
            </p>
          ))}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
              {error}
            </p>
          )}
          {warning && (
            <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md p-3">
              {warning}
            </p>
          )}

          <div className="flex justify-between">
            <div>
              {shift?.id && (
                <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>
                  Supprimer
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "..." : shift?.id ? "Enregistrer" : "Créer"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
