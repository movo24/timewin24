"use client";

import { useState, useEffect } from "react";
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

interface ShiftData {
  id?: string;
  storeId: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  note: string;
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
}

export function ShiftModal({
  open,
  onClose,
  onSaved,
  storeId,
  shift,
  defaultDate,
  defaultStartTime = "09:00",
  employees,
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
        employeeId: employees.length > 0 ? employees[0].id : "",
        date: defaultDate || "",
        startTime: defaultStartTime || "09:00",
        endTime,
        note: "",
      });
    }
    setError("");
    setWarning("");
  }, [shift, storeId, defaultDate, defaultStartTime, employees, open]);

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
      body: JSON.stringify(form),
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
    await fetch(`/api/shifts/${shift.id}`, { method: "DELETE" });
    setLoading(false);
    onSaved();
    onClose();
  }

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
          <div className="space-y-2">
            <Label>Employé *</Label>
            <select
              className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm"
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              required
            >
              <option value="">Sélectionner...</option>
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

          <div className="space-y-2">
            <Label>Note</Label>
            <Input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Note optionnelle..."
            />
          </div>

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
