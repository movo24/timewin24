"use client";

import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW registration failed, silently ignore
      });
    }
  }, []);

  return null;
}
