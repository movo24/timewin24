"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Image as ImageIcon,
} from "lucide-react";

interface ClockInRecord {
  id: string;
  clockInAt: string;
  clockOutAt: string | null;
  photoPath: string;
  photoMimeType: string;
  status: "ON_TIME" | "LATE" | "ABSENT";
  lateMinutes: number;
  distanceMeters: number;
  employee: { id: string; firstName: string; lastName: string };
  store: { id: string; name: string };
  shift: { id: string; startTime: string; endTime: string } | null;
}

interface Absence {
  shiftId: string;
  date: string;
  startTime: string;
  endTime: string;
  employee: { id: string; firstName: string; lastName: string };
  store: { id: string; name: string };
}

interface StoreOption {
  id: string;
  name: string;
}

export default function PointagesPage() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [storeId, setStoreId] = useState("all");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [clockIns, setClockIns] = useState<ClockInRecord[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const loadStores = useCallback(async () => {
    const res = await fetch("/api/stores?limit=100");
    if (res.ok) {
      const data = await res.json();
      setStores(data.stores.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })));
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const storeParam = storeId !== "all" ? `&storeId=${storeId}` : "";

      const [clockInRes, absenceRes] = await Promise.all([
        fetch(`/api/clock-in?date=${date}${storeParam}`),
        fetch(`/api/clock-in/absences?date=${date}${storeParam}`),
      ]);

      if (clockInRes.ok) {
        const data = await clockInRes.json();
        setClockIns(data.clockIns || []);
      }
      if (absenceRes.ok) {
        const data = await absenceRes.json();
        setAbsences(data.absences || []);
      }
    } catch {
      console.error("Erreur chargement pointages");
    } finally {
      setLoading(false);
    }
  }, [date, storeId]);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onTimeCount = clockIns.filter((c) => c.status === "ON_TIME").length;
  const lateCount = clockIns.filter((c) => c.status === "LATE").length;
  const absentCount = absences.length;

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">
        Pointages
      </h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full sm:w-48"
        />
        <Select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          options={[
            { value: "all", label: "Tous les magasins" },
            ...stores.map((s) => ({ value: s.id, label: s.name })),
          ]}
          className="w-full sm:w-56"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-700">{onTimeCount}</div>
          <div className="text-xs text-green-600">À l&apos;heure</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-orange-700">{lateCount}</div>
          <div className="text-xs text-orange-600">En retard</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-red-700">{absentCount}</div>
          <div className="text-xs text-red-600">Absents</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Clock-ins table */}
          {/* Mobile cards */}
          <div className="space-y-2 lg:hidden">
            {clockIns.map((record) => (
              <div
                key={record.id}
                className="bg-white border border-gray-200 rounded-lg p-3"
              >
                <div className="flex items-start gap-3">
                  {record.photoPath ? (
                    <button
                      onClick={() => {
                        setSelectedPhoto(record.photoPath);
                        setPhotoOpen(true);
                      }}
                      className="shrink-0"
                    >
                      <img
                        src={`/api/uploads/${record.photoPath}`}
                        alt=""
                        className="h-12 w-12 rounded object-cover"
                      />
                    </button>
                  ) : (
                    <div className="h-12 w-12 rounded bg-gray-100 flex items-center justify-center shrink-0">
                      <ImageIcon className="h-5 w-5 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        {record.employee.firstName} {record.employee.lastName}
                      </span>
                      <StatusBadge
                        status={record.status}
                        lateMinutes={record.lateMinutes}
                      />
                    </div>
                    <p className="text-xs text-gray-500">{record.store.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                      {record.shift && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {record.shift.startTime}-{record.shift.endTime}
                        </span>
                      )}
                      <span>
                        Arrivée: {formatTime(record.clockInAt)}
                      </span>
                      {record.clockOutAt && (
                        <span>Départ: {formatTime(record.clockOutAt)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Absences */}
            {absences.map((a) => (
              <div
                key={a.shiftId}
                className="bg-red-50 border border-red-200 rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded bg-red-100 flex items-center justify-center shrink-0">
                    <XCircle className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">
                        {a.employee.firstName} {a.employee.lastName}
                      </span>
                      <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px]">
                        Absent
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500">
                      {a.store.name} · Shift: {a.startTime}-{a.endTime}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {clockIns.length === 0 && absences.length === 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">
                Aucun pointage pour cette date
              </div>
            )}
          </div>

          {/* Desktop table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hidden lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-16">
                    Photo
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Employé
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Magasin
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Shift prévu
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Arrivée
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">
                    Départ
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">
                    Statut
                  </th>
                </tr>
              </thead>
              <tbody>
                {clockIns.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      {record.photoPath ? (
                        <button
                          onClick={() => {
                            setSelectedPhoto(record.photoPath);
                            setPhotoOpen(true);
                          }}
                        >
                          <img
                            src={`/api/uploads/${record.photoPath}`}
                            alt=""
                            className="h-10 w-10 rounded object-cover hover:opacity-80 transition-opacity"
                          />
                        </button>
                      ) : (
                        <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-gray-400" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {record.employee.firstName} {record.employee.lastName}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {record.store.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {record.shift
                        ? `${record.shift.startTime}-${record.shift.endTime}`
                        : "-"}
                    </td>
                    <td className="px-4 py-3">{formatTime(record.clockInAt)}</td>
                    <td className="px-4 py-3">
                      {record.clockOutAt
                        ? formatTime(record.clockOutAt)
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge
                        status={record.status}
                        lateMinutes={record.lateMinutes}
                      />
                    </td>
                  </tr>
                ))}

                {/* Absence rows */}
                {absences.map((a) => (
                  <tr
                    key={`abs-${a.shiftId}`}
                    className="border-b border-gray-100 bg-red-50/50"
                  >
                    <td className="px-4 py-3">
                      <div className="h-10 w-10 rounded bg-red-100 flex items-center justify-center">
                        <XCircle className="h-4 w-4 text-red-500" />
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {a.employee.firstName} {a.employee.lastName}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {a.store.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {a.startTime}-{a.endTime}
                    </td>
                    <td className="px-4 py-3 text-gray-400">-</td>
                    <td className="px-4 py-3 text-gray-400">-</td>
                    <td className="px-4 py-3 text-center">
                      <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                        Absent
                      </Badge>
                    </td>
                  </tr>
                ))}

                {clockIns.length === 0 && absences.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      Aucun pointage pour cette date
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Photo lightbox */}
      <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Photo de pointage</DialogTitle>
            <DialogDescription>Preuve photo prise lors du pointage</DialogDescription>
          </DialogHeader>
          {selectedPhoto && (
            <img
              src={`/api/uploads/${selectedPhoto}`}
              alt="Photo de pointage"
              className="rounded-lg w-full"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({
  status,
  lateMinutes,
}: {
  status: string;
  lateMinutes: number;
}) {
  if (status === "LATE") {
    return (
      <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Retard +{lateMinutes}min
      </Badge>
    );
  }
  if (status === "ABSENT") {
    return (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
        Absent
      </Badge>
    );
  }
  return (
    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
      <CheckCircle2 className="h-3 w-3 mr-1" />À l&apos;heure
    </Badge>
  );
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
