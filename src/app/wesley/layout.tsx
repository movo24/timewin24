import type { Metadata } from "next";
import Link from "next/link";
import { ConsentBanner } from "@/components/wesley/consent-banner";

export const metadata: Metadata = {
  title: "The Wesley — drugstore lifestyle discount",
  description:
    "The Wesley : beauté, cheveux, accessoires téléphone, lifestyle et Creator Studio à petits prix. Les produits viraux vus sur TikTok, en magasin et en click & collect.",
};

const NAV = [
  { href: "/wesley/catalogue", label: "Catalogue" },
  { href: "/wesley/creator-studio", label: "Creator Studio" },
  { href: "/wesley/magasins", label: "Magasins" },
  { href: "/wesley/ville", label: "Ma ville" },
];

export default function WesleyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/wesley" className="text-xl font-black tracking-tight">
            THE WESLEY
          </Link>
          <nav className="hidden gap-6 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-sm font-medium text-gray-600 hover:text-pink-700">
                {n.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/wesley/catalogue"
            className="rounded-full bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700"
          >
            Voir les produits
          </Link>
        </div>
      </header>

      <main>{children}</main>

      <footer className="mt-16 border-t border-gray-100 bg-gray-50">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-10 text-sm md:grid-cols-4">
          <div>
            <p className="font-black">THE WESLEY</p>
            <p className="mt-2 text-gray-500">Drugstore lifestyle discount, génération réseaux sociaux.</p>
          </div>
          <div>
            <p className="font-semibold">Boutique</p>
            <ul className="mt-2 space-y-1 text-gray-500">
              <li><Link href="/wesley/catalogue">Catalogue</Link></li>
              <li><Link href="/wesley/creator-studio">Creator Studio</Link></li>
              <li><Link href="/wesley/magasins">Trouver un magasin</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">The Wesley près de chez toi</p>
            <ul className="mt-2 space-y-1 text-gray-500">
              <li><Link href="/wesley/ville">Je veux The Wesley dans ma ville</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold">Infos</p>
            <ul className="mt-2 space-y-1 text-gray-500">
              <li><Link href="/wesley/confidentialite">Confidentialité &amp; cookies</Link></li>
            </ul>
          </div>
        </div>
        <p className="pb-6 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} The Wesley — démo V1
        </p>
      </footer>

      <ConsentBanner />
    </div>
  );
}
