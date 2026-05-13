"use client";

/**
 * Tiny send-status indicator rendered in the corner of a shift block.
 * Only shows for "interesting" states — NOT_SENT and NO_EMAIL render nothing.
 */

import type { NotificationStatus } from "@/app/api/planning/notifications/route";

interface Props {
  status: NotificationStatus | undefined;
  /** Compact mode for very small shifts (height < 30px). */
  compact?: boolean;
}

export function ShiftSendBadge({ status, compact }: Props) {
  if (!status || status === "NOT_SENT" || status === "NO_EMAIL") return null;

  const config = {
    SENT: {
      bg: "bg-green-500",
      ring: "ring-green-200",
      label: "Planning envoyé à l'employé",
      pulse: false,
    },
    MODIFIED: {
      bg: "bg-orange-500",
      ring: "ring-orange-200",
      label: "Planning modifié depuis le dernier envoi — à renvoyer",
      pulse: true,
    },
    FAILED: {
      bg: "bg-red-500",
      ring: "ring-red-200",
      label: "Échec d'envoi du planning",
      pulse: false,
    },
  } as const;

  const c = config[status as "SENT" | "MODIFIED" | "FAILED"];
  if (!c) return null;

  const size = compact ? "h-1.5 w-1.5" : "h-2 w-2";

  return (
    <span
      className="absolute top-0.5 right-0.5 z-30 pointer-events-none"
      title={c.label}
      aria-label={c.label}
    >
      <span
        className={`block rounded-full ${size} ${c.bg} ring-2 ${c.ring} ${
          c.pulse ? "animate-pulse" : ""
        }`}
      />
    </span>
  );
}
