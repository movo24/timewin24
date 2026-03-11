"use client";

import { BellRing } from "lucide-react";
import { NotificationSettings } from "@/components/notifications/notification-settings";

export default function MesNotificationsPage() {
  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BellRing className="h-6 w-6 text-gray-900" />
        <h1 className="text-2xl font-bold text-gray-900">
          Mes notifications
        </h1>
      </div>

      <NotificationSettings />
    </div>
  );
}
