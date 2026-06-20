"use client";

import { useEffect } from "react";
import { track } from "@/app/wesley/analytics";

// Émet un page_view au montage (une fois le consentement éventuellement résolu).
export function TrackPageView({ path }: { path: string }) {
  useEffect(() => {
    track("page_view", { page_path: path });
  }, [path]);
  return null;
}
