"use client";

import { useState, useEffect, useMemo } from "react";
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

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
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
}

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
      // Calculate default end time (start + 8h, max 23:59)
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

  // When store changes in the modal, load employees for that store
  function handleStoreChange(newStoreId: string) {
    setForm((prev) => ({ ...prev, storeId: newStoreId, employeeId: "" }));
    if (newStoreId && newStoreId !== storeId) {
      setLoadingEmployees(true);
      fetch(`/api/employees?storeId=${newStoreId}&active=true&limit=100`)
        .then((r) => r.json())
        .then((data) => {
          setEmployees(data.employees || []);
          if (data.employees?.length > 0) {
            setForm((prev) => ({ ...prev, employeeId: data.employees[0].id }));
          }
        })
        .catch(() => {})
        .finally(() => setLoadingEmployees(false));
    } else if (newStoreId === storeId) {
      // Reset to initial employees
      setEmployees(initialEmployees);
      if (initialEmployees.length > 0) {
        setForm((prev) => ({ ...prev, employeeId: initialEmployees[0].id }));
      }
    }
  }

  // Compute shift duration for info display
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
    const sched = storeSchedules.find(s => s.dayOfWeek === dayOfWeek);
    if (!sched) return warns;
    if (sched.closed) {
      warns.push("Le magasin est fermé ce jour-là");
      return warns;
    }
    if (sched.openTime && form.startTime < sched.openTime) {
      warns.push(`Début avant ouverture (${sched.openTime})`);
    }
    if (sched.closeTime && form.endTime > sched.closeTime) {
      warns.push(`Fin après fermeture (${sched.closeTime})`);
    }
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
      body: JSON.stringify({
        ...form,
        employeeId: form.employeeId || null,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Erreur");
      return;
    }

    if (data.weeklyHoursWarning) {
      setWarning(data.weeklyHoursWarning);
      // Still save, just show warning then close
      setTimeout(() => {
        onSaved();
        onClose();
      }, 2000);
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

          <div className="space-y-2">
            <Label>Employé</Label>
            <select
              className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm"
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              disabled={loadingEmployees}
            >
              <option value="">
                {loadingEmployees ? "Chargement..." : "Non assigné"}
              </option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName}
                </option>
              ))}
            </select>
          </div>

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

          {/* Shift duration info + break */}
          {shiftHours > 0 && (
            <div className="text-xs text-gray-500 flex items-center gap-2">
              <span>Durée : {shiftHours.toFixed(1)}h</span>
              {shiftHours > 6 && (
                <span className="text-amber-600 font-medium">— pause 30min recommandée</span>
              )}
            </div>
          )}

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
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={loading}
                >
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
