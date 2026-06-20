import type { Metadata } from "next";
import { ProductCard } from "@/components/wesley/product-card";
import { TrackPageView } from "@/components/wesley/track-page-view";
import { productsByCategory } from "../data";

export const metadata: Metadata = {
  title: "Creator Studio — The Wesley",
  description:
    "Tout pour créer du contenu pas cher : ring lights, trépieds, supports, power banks. Kits débutante TikTok, kit live, kit selfie.",
};

const KITS = [
  { name: "Kit débutante TikTok", emoji: "🎬", items: "Ring light + trépied + support" },
  { name: "Kit live", emoji: "📡", items: "Ring light + power bank + micro" },
  { name: "Kit selfie", emoji: "🤳", items: "Mini ring light + perche + support" },
];

const GUIDES = [
  "Comment filmer un produit en 30 secondes",
  "Comment faire une vidéo beauté simple",
  "Bien éclairer ses lives sans matériel cher",
];

export default function CreatorStudioPage() {
  const gear = productsByCategory("creator-studio");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <TrackPageView path="/wesley/creator-studio" />

      <section className="rounded-3xl bg-gradient-to-br from-purple-100 to-pink-100 p-10">
        <h1 className="text-4xl font-black">Creator Studio 🎬</h1>
        <p className="mt-3 max-w-2xl text-lg text-gray-700">
          Tout pour créer du contenu qui cartonne, sans te ruiner. Le matériel des créatrices,
          à prix The Wesley.
        </p>
      </section>

      <section className="py-10">
        <h2 className="mb-5 text-2xl font-black">Nos kits prêts à filmer</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {KITS.map((k) => (
            <div key={k.name} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="text-4xl">{k.emoji}</div>
              <p className="mt-3 font-bold">{k.name}</p>
              <p className="text-sm text-gray-500">{k.items}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-4">
        <h2 className="mb-5 text-2xl font-black">Le matériel</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {gear.map((p) => <ProductCard key={p.slug} product={p} />)}
        </div>
      </section>

      <section className="py-10">
        <h2 className="mb-5 text-2xl font-black">Guides création</h2>
        <ul className="space-y-2">
          {GUIDES.map((g) => (
            <li key={g} className="rounded-xl border border-gray-100 bg-white p-4 text-sm font-medium shadow-sm">
              📺 {g}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
