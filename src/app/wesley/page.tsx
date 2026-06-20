import Link from "next/link";
import { ProductCard } from "@/components/wesley/product-card";
import { TrackPageView } from "@/components/wesley/track-page-view";
import { CATEGORIES, viralProducts, newProducts, smallPrices, STORES } from "./data";

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-5 flex items-end justify-between">
        <h2 className="text-2xl font-black">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function WesleyHome() {
  const viral = viralProducts(4);
  const news = newProducts(4);
  const cheap = smallPrices(5, 4);

  return (
    <>
      <TrackPageView path="/wesley" />

      {/* Hero */}
      <section className="bg-gradient-to-br from-pink-100 via-purple-50 to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-16 md:grid-cols-2">
          <div>
            <p className="mb-3 inline-block rounded-full bg-black px-3 py-1 text-xs font-semibold text-white">
              Vu sur TikTok &amp; Instagram
            </p>
            <h1 className="text-4xl font-black leading-tight md:text-5xl">
              The Wesley — le drugstore lifestyle discount, génération réseaux sociaux.
            </h1>
            <p className="mt-4 text-lg text-gray-600">
              Beauté, cheveux, accessoires téléphone, lifestyle &amp; Creator Studio. Les produits
              qui cartonnent, à tout petit prix.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/wesley/catalogue" className="rounded-full bg-pink-600 px-6 py-3 font-semibold text-white hover:bg-pink-700">
                Voir les nouveautés
              </Link>
              <Link href="/wesley/magasins" className="rounded-full border border-gray-300 px-6 py-3 font-semibold hover:bg-white">
                Trouver mon magasin
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-5xl">
            {CATEGORIES.slice(0, 6).map((c) => (
              <div key={c.slug} className="rounded-2xl bg-white/70 p-6 shadow-sm">{c.emoji}</div>
            ))}
          </div>
        </div>
      </section>

      {/* Catégories */}
      <Section title="Explore par univers">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/wesley/catalogue?cat=${c.slug}`}
              className="flex flex-col items-center gap-2 rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm hover:shadow-md"
            >
              <span className="text-3xl">{c.emoji}</span>
              <span className="text-sm font-semibold">{c.name}</span>
              <span className="text-xs text-gray-500">{c.blurb}</span>
            </Link>
          ))}
        </div>
      </Section>

      {/* Produits viraux */}
      <Section
        title="Ça cartonne cette semaine 🔥"
        action={<Link href="/wesley/catalogue" className="text-sm font-semibold text-pink-700">Tout voir →</Link>}
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {viral.map((p) => <ProductCard key={p.slug} product={p} />)}
        </div>
      </Section>

      {/* Nouveautés */}
      <Section title="Nouveautés arrivées ✨">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {news.map((p) => <ProductCard key={p.slug} product={p} />)}
        </div>
      </Section>

      {/* Petits prix */}
      <Section title="Petits prix 💸 (moins de 5 €)">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {cheap.map((p) => <ProductCard key={p.slug} product={p} />)}
        </div>
      </Section>

      {/* Trouver un magasin */}
      <Section title="Trouver un magasin 📍" action={<Link href="/wesley/magasins" className="text-sm font-semibold text-pink-700">Voir la carte →</Link>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STORES.map((s) => (
            <Link key={s.slug} href={`/wesley/magasins/${s.slug}`} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md">
              <p className="font-semibold">{s.city}</p>
              <p className="text-sm text-gray-500">{s.address}</p>
              <p className="mt-2 text-xs font-medium text-pink-700">
                {s.status === "open" ? s.hours : "Ouverture prochaine"}
              </p>
            </Link>
          ))}
        </div>
      </Section>

      {/* Social proof / CTA ville */}
      <section className="mx-auto my-12 max-w-6xl rounded-3xl bg-black px-6 py-12 text-center text-white">
        <h2 className="text-2xl font-black">Pas encore de The Wesley dans ta ville ?</h2>
        <p className="mt-2 text-gray-300">Dis-nous où tu veux le prochain magasin — ça nous aide à choisir.</p>
        <Link href="/wesley/ville" className="mt-5 inline-block rounded-full bg-pink-600 px-6 py-3 font-semibold hover:bg-pink-700">
          Je veux The Wesley dans ma ville
        </Link>
      </section>
    </>
  );
}
