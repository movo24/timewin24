import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inventaire Mobile — TimeWin",
  description: "Application d'inventaire terrain",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
};

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {children}
    </div>
  );
}
