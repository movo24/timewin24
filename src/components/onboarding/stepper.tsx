"use client";

import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { path: "/onboarding/company", label: "Société" },
  { path: "/onboarding/stores", label: "Site" },
  { path: "/onboarding/employees", label: "Employé" },
  { path: "/onboarding/done", label: "Terminé" },
];

export function OnboardingStepper() {
  const pathname = usePathname();
  const currentIdx = STEPS.findIndex((s) => pathname?.startsWith(s.path));

  return (
    <div className="flex items-center justify-between gap-2">
      {STEPS.map((step, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        return (
          <div key={step.path} className="flex items-center flex-1 last:flex-initial">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-medium border-2",
                  isDone && "bg-green-500 text-white border-green-500",
                  isActive && "bg-blue-500 text-white border-blue-500",
                  !isDone && !isActive && "bg-white text-gray-400 border-gray-200"
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-xs sm:text-sm font-medium truncate",
                  isActive && "text-gray-900",
                  isDone && "text-gray-600",
                  !isDone && !isActive && "text-gray-400"
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 mx-2 sm:mx-3 rounded",
                  isDone ? "bg-green-500" : "bg-gray-200"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
