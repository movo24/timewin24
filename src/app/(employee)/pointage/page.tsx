"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  Camera,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  LogIn,
  LogOut,
  Image as ImageIcon,
} from "lucide-react";

interface StoreOption {
  storeId: string;
  store: { id: string; name: string };
}

interface ClockInRecord {
  id: string;
  clockInAt: string;
  clockOutAt: string | null;
  photoPath: string;
  status: "ON_TIME" | "LATE" | "ABSENT";
  lateMinutes: number;
  distanceMeters: number;
  store: { id: string; name: string };
  shift: { id: string; startTime: string; endTime: string } | null;
}

interface TodayShift {
  id: string;
  startTime: string;
  endTime: string;
  store: { id: string; name: string };
}

type Step = "idle" | "locating" | "camera" | "uploading" | "done" | "error";

export default function PointagePage() {
  const { data: session } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [todayShifts, setTodayShifts] = useState<TodayShift[]>([]);
  const [activeClockIn, setActiveClockIn] = useState<ClockInRecord | null>(null);
  const [history, setHistory] = useState<ClockInRecord[]>([]);
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // Load employee's stores
  const loadStores = useCallback(async () => {
    const res = await fetch("/api/me/stores");
    if (res.ok) {
      const data = await res.json();
      setStores(data.stores || []);
      if (data.stores?.length === 1) {
        setSelectedStoreId(data.stores[0].storeId);
      }
    }
  }, []);

  // Load today's shifts
  const loadTodayShifts = useCallback(async () => {
    const today = new Date().toISOString().split("T")[0];
    const monday = getMondayOfWeek(new Date(today));
    const res = await fetch(`/api/me/shifts?weekStart=${monday}`);
    if (res.ok) {
      const data = await res.json();
      const todayStr = today;
      const todayShifts = (data.shifts || []).filter(
        (s: { date: string }) => s.date.split("T")[0] === todayStr
      );
      setTodayShifts(todayShifts);
    }
  }, []);

  // Load clock-in history and active clock-in
  const loadClockIns = useCallback(async () => {
    const res = await fetch("/api/clock-in");
    if (res.ok) {
      const data = await res.json();
      const records: ClockInRecord[] = data.clockIns || [];
      const active = records.find((c) => !c.clockOutAt) || null;
      setActiveClockIn(active);
      setHistory(records.slice(0, 14)); // Last 14 records
    }
  }, []);

  useEffect(() => {
    Promise.all([loadStores(), loadTodayShifts(), loadClockIns()]).finally(() =>
      setLoading(false)
    );
  }, [loadStores, loadTodayShifts, loadClockIns]);

  // Get GPS position
  function getGPS(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Géolocalisation non supportée"));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });
  }

  // Start clock-in flow
  async function handleClockIn() {
    if (!selectedStoreId) {
      setErrorMsg("Veuillez sélectionner un magasin");
      return;
    }

    setStep("locating");
    setErrorMsg("");

    try {
      const pos = await getGPS();
      setGpsCoords({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
      setStep("camera");
      // Trigger file input (camera)
      fileInputRef.current?.click();
    } catch {
      setStep("error");
      setErrorMsg("Impossible d'obtenir votre position GPS. Vérifiez les autorisations.");
    }
  }

  // Handle photo capture
  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !gpsCoords) {
      setStep("idle");
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setStep("uploading");
    setErrorMsg("");

    try {
      const formData = new FormData();
      formData.append("photo", file);
      formData.append("latitude", gpsCoords.lat.toString());
      formData.append("longitude", gpsCoords.lon.toString());
      formData.append("accuracy", gpsCoords.accuracy.toString());
      formData.append("storeId", selectedStoreId);

      const res = await fetch("/api/clock-in", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setStep("error");
        setErrorMsg(data.error || "Erreur lors du pointage");
        return;
      }

      setStep("done");
      setPhotoPreview(null);
      // Reload clock-ins
      await loadClockIns();
      // Reset after 3 seconds
      setTimeout(() => setStep("idle"), 3000);
    } catch {
      setStep("error");
      setErrorMsg("Erreur réseau");
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Clock out
  async function handleClockOut() {
    if (!activeClockIn) return;
    setLoading(true);

    const res = await fetch(`/api/clock-in/${activeClockIn.id}`, {
      method: "PATCH",
    });

    if (res.ok) {
      await loadClockIns();
    } else {
      const data = await res.json();
      setErrorMsg(data.error || "Erreur");
    }
    setLoading(false);
  }

  const todayShiftForStore = todayShifts.find(
    (s) => s.store.id === selectedStoreId
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Pointage</h1>

      {/* Hidden file input for camera */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoCapture}
      />

      {/* Store selector */}
      {stores.length > 1 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Magasin</label>
          <Select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            options={stores.map((s) => ({ value: s.storeId, label: s.store.name }))}
            placeholder="Sélectionner un magasin"
          />
        </div>
      )}

      {stores.length === 1 && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPin className="h-4 w-4" />
          <span>{stores[0].store.name}</span>
        </div>
      )}

      {/* Today's shift info */}
      {todayShiftForStore && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
          <Clock className="h-5 w-5 text-blue-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-900">Shift prévu aujourd&apos;hui</p>
            <p className="text-sm text-blue-700">
              {todayShiftForStore.startTime} - {todayShiftForStore.endTime}
            </p>
          </div>
        </div>
      )}

      {/* Main action area */}
      {!activeClockIn ? (
        <div className="space-y-4">
          {/* Clock-in button */}
          {step === "idle" || step === "error" ? (
            <Button
              size="lg"
              className="w-full h-20 text-lg bg-green-600 hover:bg-green-700"
              onClick={handleClockIn}
              disabled={!selectedStoreId}
            >
              <LogIn className="h-6 w-6 mr-3" />
              Pointer mon arrivée
            </Button>
          ) : step === "locating" ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
              <div className="animate-pulse">
                <MapPin className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-yellow-800">
                  Localisation en cours...
                </p>
              </div>
            </div>
          ) : step === "camera" ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
              <Camera className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-blue-800">
                Prenez une photo du magasin
              </p>
            </div>
          ) : step === "uploading" ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
              <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-700">
                Envoi du pointage...
              </p>
              {photoPreview && (
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="mt-3 rounded-lg max-h-32 mx-auto"
                />
              )}
            </div>
          ) : step === "done" ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-green-800">
                Pointage enregistré !
              </p>
            </div>
          ) : null}

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{errorMsg}</p>
            </div>
          )}
        </div>
      ) : (
        /* Already clocked in */
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-800">Présent</span>
              </div>
              <StatusBadge
                status={activeClockIn.status}
                lateMinutes={activeClockIn.lateMinutes}
              />
            </div>
            <div className="text-sm text-green-700 space-y-1">
              <p>
                <span className="font-medium">Arrivée :</span>{" "}
                {formatTime(activeClockIn.clockInAt)}
              </p>
              <p>
                <span className="font-medium">Magasin :</span>{" "}
                {activeClockIn.store.name}
              </p>
              {activeClockIn.shift && (
                <p>
                  <span className="font-medium">Shift :</span>{" "}
                  {activeClockIn.shift.startTime} - {activeClockIn.shift.endTime}
                </p>
              )}
            </div>
            {activeClockIn.photoPath && (
              <div className="mt-3">
                <img
                  src={`/api/uploads/${activeClockIn.photoPath}`}
                  alt="Photo pointage"
                  className="rounded-lg max-h-40 object-cover"
                />
              </div>
            )}
          </div>

          <Button
            size="lg"
            variant="destructive"
            className="w-full h-16 text-lg"
            onClick={handleClockOut}
          >
            <LogOut className="h-6 w-6 mr-3" />
            Pointer mon départ
          </Button>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Historique récent
          </h2>
          <div className="space-y-2">
            {history
              .filter((c) => c.clockOutAt) // Only show completed clock-ins
              .slice(0, 7)
              .map((record) => (
                <div
                  key={record.id}
                  className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3"
                >
                  {record.photoPath ? (
                    <img
                      src={`/api/uploads/${record.photoPath}`}
                      alt=""
                      className="h-10 w-10 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center shrink-0">
                      <ImageIcon className="h-4 w-4 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-900">
                        {formatDateShort(record.clockInAt)}
                      </span>
                      <StatusBadge
                        status={record.status}
                        lateMinutes={record.lateMinutes}
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      {record.store.name} · {formatTime(record.clockInAt)} -{" "}
                      {record.clockOutAt ? formatTime(record.clockOutAt) : "..."}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
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
      <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-[10px]">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Retard +{lateMinutes}min
      </Badge>
    );
  }
  if (status === "ABSENT") {
    return (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px]">
        Absent
      </Badge>
    );
  }
  return (
    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">
      À l&apos;heure
    </Badge>
  );
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}
