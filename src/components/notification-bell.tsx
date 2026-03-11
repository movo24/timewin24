"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

const POLL_INTERVAL = 60_000; // 60 seconds

export function NotificationBell() {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts/count");
      if (res.ok) {
        const data = await res.json();
        setCount(data.count || 0);
      }
    } catch {
      // Silently ignore network errors
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchCount]);

  return (
    <Link
      href="/alertes"
      className="relative p-1.5 rounded-md hover:bg-gray-100 transition-colors"
      title="Alertes"
    >
      <Bell className="h-5 w-5 text-gray-600" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
