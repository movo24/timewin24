"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  Mail,
  Smartphone,
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { isPushSubscribed, subscribeToPush } from "@/components/register-sw";

interface Preference {
  eventType: string;
  label: string;
  priority: string;
  push: boolean;
  email: boolean;
  sms: boolean;
}

const PRIORITY_BADGE: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-600",
  NORMAL: "bg-blue-100 text-blue-700",
  IMPORTANT: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Faible",
  NORMAL: "Normale",
  IMPORTANT: "Importante",
  CRITICAL: "Critique",
};

export function NotificationSettings() {
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [phone, setPhone] = useState("");
  const [pushStatus, setPushStatus] = useState<
    "granted" | "denied" | "default" | "unsupported"
  >("default");
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPreferences = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/preferences");
      if (res.ok) {
        const data = await res.json();
        setPreferences(data.preferences || []);
        setPhone(data.phone || "");
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();

    // Check push permission state
    if (!("Notification" in window)) {
      setPushStatus("unsupported");
    } else {
      setPushStatus(Notification.permission as "granted" | "denied" | "default");
      isPushSubscribed().then(setPushSubscribed);
    }
  }, [loadPreferences]);

  const updatePreference = async (
    eventType: string,
    channel: "push" | "email" | "sms",
    value: boolean
  ) => {
    setSaving(true);
    const pref = preferences.find((p) => p.eventType === eventType);
    if (!pref) return;

    try {
      await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType,
          [channel]: value,
        }),
      });

      setPreferences((prev) =>
        prev.map((p) =>
          p.eventType === eventType ? { ...p, [channel]: value } : p
        )
      );
    } catch {
      // Revert on error
    } finally {
      setSaving(false);
    }
  };

  const savePhone = async () => {
    setSaving(true);
    try {
      await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
    } catch {
      // Ignore
    } finally {
      setSaving(false);
    }
  };

  const handleEnablePush = async () => {
    const permission = await Notification.requestPermission();
    setPushStatus(permission as "granted" | "denied" | "default");
    if (permission === "granted") {
      const ok = await subscribeToPush();
      setPushSubscribed(ok);
    }
  };

  const sendTestNotification = async () => {
    await fetch("/api/notifications/test", { method: "POST" });
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">
        Chargement des préférences...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Push Status Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Bell className="h-4 w-4" />
          Notifications push
        </h3>

        {pushStatus === "unsupported" && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <XCircle className="h-4 w-4 text-gray-400" />
            Votre navigateur ne supporte pas les notifications push.
          </div>
        )}

        {pushStatus === "denied" && (
          <div className="flex items-start gap-2 text-sm text-orange-700 bg-orange-50 rounded-lg p-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Notifications bloquées</p>
              <p className="text-xs mt-0.5 text-orange-600">
                Réactivez les notifications dans les paramètres de votre
                navigateur pour cette page.
              </p>
            </div>
          </div>
        )}

        {pushStatus === "default" && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              Les notifications ne sont pas encore activées.
            </span>
            <button
              onClick={handleEnablePush}
              className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800"
            >
              Activer
            </button>
          </div>
        )}

        {pushStatus === "granted" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              {pushSubscribed
                ? "Notifications push activées"
                : "Permission accordée, souscription en cours..."}
            </div>
            <button
              onClick={sendTestNotification}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Envoyer une notification test
            </button>
          </div>
        )}
      </div>

      {/* Phone for SMS */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Smartphone className="h-4 w-4" />
          SMS (alertes critiques)
        </h3>
        <div className="flex gap-2">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+33 6 12 34 56 78"
            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none"
          />
          <button
            onClick={savePhone}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          Utilisé uniquement pour les alertes critiques (magasin non ouvert,
          etc.)
        </p>
      </div>

      {/* Preferences Grid */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <Shield className="h-4 w-4 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-900">
            Préférences par type
          </h3>
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="px-4 py-2 text-left font-medium">
                  Événement
                </th>
                <th className="px-4 py-2 text-center font-medium">Priorité</th>
                <th className="px-4 py-2 text-center font-medium">
                  <Bell className="h-3.5 w-3.5 mx-auto" />
                </th>
                <th className="px-4 py-2 text-center font-medium">
                  <Mail className="h-3.5 w-3.5 mx-auto" />
                </th>
                <th className="px-4 py-2 text-center font-medium">
                  <Smartphone className="h-3.5 w-3.5 mx-auto" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {preferences.map((pref) => (
                <tr key={pref.eventType}>
                  <td className="px-4 py-2.5 text-gray-900">{pref.label}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PRIORITY_BADGE[pref.priority] || ""}`}
                    >
                      {PRIORITY_LABEL[pref.priority] || pref.priority}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <ToggleSwitch
                      checked={pref.push}
                      onChange={(v) =>
                        updatePreference(pref.eventType, "push", v)
                      }
                    />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <ToggleSwitch
                      checked={pref.email}
                      onChange={(v) =>
                        updatePreference(pref.eventType, "email", v)
                      }
                    />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <ToggleSwitch
                      checked={pref.sms}
                      onChange={(v) =>
                        updatePreference(pref.eventType, "sms", v)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden divide-y divide-gray-100">
          {preferences.map((pref) => (
            <div key={pref.eventType} className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">
                  {pref.label}
                </span>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PRIORITY_BADGE[pref.priority] || ""}`}
                >
                  {PRIORITY_LABEL[pref.priority] || pref.priority}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <ToggleSwitch
                    checked={pref.push}
                    onChange={(v) =>
                      updatePreference(pref.eventType, "push", v)
                    }
                  />
                  Push
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <ToggleSwitch
                    checked={pref.email}
                    onChange={(v) =>
                      updatePreference(pref.eventType, "email", v)
                    }
                  />
                  Email
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <ToggleSwitch
                    checked={pref.sms}
                    onChange={(v) =>
                      updatePreference(pref.eventType, "sms", v)
                    }
                  />
                  SMS
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? "bg-gray-900" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
