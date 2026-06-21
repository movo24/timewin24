import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Inventaire Mobile — TimeWin",
  description: "Application d'inventaire terrain",
};

// Next 16 : la config viewport doit vivre dans l'export `viewport` (pas `metadata`).
// Émet le même <meta name="viewport"> qu'avant.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
