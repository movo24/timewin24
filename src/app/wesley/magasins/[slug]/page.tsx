import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/wesley/product-card";
import { TrackPageView } from "@/components/wesley/track-page-view";
import { getStore, getProduct, STORES } from "../../data";

export function generateStaticParams() {
  return STORES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const store = getStore(slug);
  if (!store) return { title: "Magasin introuvable — The Wesley" };
  return {
    title: `${store.name} — horaires, stock & produits`,
    description: `The Wesley ${store.city} : ${store.address}, ${store.postalCode}. Horaires, stock local et produits stars.`,
  };
}

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = getStore(slug);
  if (!store) notFound();

  const stars = store.starProductSlugs
    .map((s) => getProduct(s))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  // LocalBusiness structuré (SEO local + moteurs IA).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: store.name,
    address: {
      "@type": "PostalAddress",
      streetAddress: store.address,
      postalCode: store.postalCode,
      addressLocality: store.city,
      addressRegion: store.region,
      addressCountry: "FR",
    },
    geo: { "@type": "GeoCoordinates", latitude: store.lat, longitude: store.lng },
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <TrackPageView path={`/wesley/magasins/${store.slug}`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Link href="/wesley/magasins" className="text-sm text-pink-700">← Tous les magasins</Link>
      <h1 className="mt-2 text-3xl font-black">{store.name}</h1>

      {store.status === "coming-soon" ? (
        <div className="mt-6 rounded-2xl border border-dashed border-pink-200 bg-pink-50/40 p-6">
          <p className="font-semibold text-pink-700">Ouverture prochaine 🎉</p>
          <p className="mt-1 text-gray-600">Ce magasin arrive bientôt à {store.city}.</p>
          <Link href="/wesley/ville" className="mt-4 inline-block rounded-full bg-pink-600 px-5 py-2 text-sm font-semibold text-white">
            Être prévenue de l’ouverture
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 text-sm shadow-sm">
              <p className="font-semibold">Adresse</p>
              <p className="text-gray-600">{store.address}</p>
              <p className="text-gray-600">{store.postalCode} {store.city}</p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block rounded-full border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50"
              >
                Itinéraire
              </a>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-5 text-sm shadow-sm">
              <p className="font-semibold">Horaires</p>
              <p className="text-gray-600">{store.hours}</p>
            </div>
          </div>

          {stars.length > 0 && (
            <div className="mt-10">
              <h2 className="mb-4 text-xl font-black">Les stars de ce magasin ⭐</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {stars.map((p) => <ProductCard key={p.slug} product={p} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
