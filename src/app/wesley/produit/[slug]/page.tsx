import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductActions } from "@/components/wesley/product-actions";
import { ProductCard } from "@/components/wesley/product-card";
import { TrackPageView } from "@/components/wesley/track-page-view";
import { getProduct, getStore, formatPrice, PRODUCTS } from "../../data";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return { title: "Produit introuvable — The Wesley" };
  return {
    title: `${product.name} — The Wesley`,
    description: product.benefit,
    openGraph: { title: product.name, description: product.benefit, type: "website" },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  const related = product.relatedSlugs
    .map((s) => getProduct(s))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  // Données structurées Product/Offer (résultats enrichis Google + moteurs IA).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    category: product.category,
    offers: {
      "@type": "Offer",
      price: product.priceEUR.toFixed(2),
      priceCurrency: "EUR",
      availability: product.onlineStock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <TrackPageView path={`/wesley/produit/${product.slug}`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex h-80 items-center justify-center rounded-3xl bg-gradient-to-br from-pink-50 to-purple-50 text-9xl">
          {product.image}
        </div>

        <div>
          <div className="mb-2 flex flex-wrap gap-1">
            {product.badges.map((b) => (
              <span key={b} className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-semibold text-white">{b}</span>
            ))}
          </div>
          <h1 className="text-3xl font-black">{product.name}</h1>
          <p className="mt-2 text-gray-600">{product.benefit}</p>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-3xl font-black text-pink-600">{formatPrice(product.priceEUR)}</span>
            {product.oldPriceEUR && (
              <span className="text-lg text-gray-400 line-through">{formatPrice(product.oldPriceEUR)}</span>
            )}
          </div>

          <p className="mt-2 text-sm text-gray-500">
            {product.onlineStock > 0 ? "✓ En stock en ligne" : "Épuisé en ligne"}
            {product.clickAndCollect && " · Click & collect disponible"}
          </p>

          <div className="mt-6"><ProductActions product={product} /></div>

          <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm">
            <p className="mb-2 font-semibold">Disponible en magasin</p>
            {product.storeStock.length === 0 ? (
              <p className="text-gray-500">Pas encore en magasin — bientôt !</p>
            ) : (
              <ul className="space-y-1">
                {product.storeStock.map((ss) => {
                  const store = getStore(ss.storeSlug);
                  return (
                    <li key={ss.storeSlug} className="flex justify-between">
                      <Link href={`/wesley/magasins/${ss.storeSlug}`} className="text-pink-700 hover:underline">
                        {store?.city ?? ss.storeSlug}
                      </Link>
                      <span className={ss.quantity < 10 ? "text-red-600" : "text-green-700"}>
                        {ss.quantity < 10 ? "Bientôt épuisé" : "En stock"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="mt-12">
        <h2 className="mb-4 text-xl font-black">À quoi ça sert</h2>
        <p className="max-w-2xl text-gray-700">{product.description}</p>
      </div>

      {related.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 text-xl font-black">Souvent acheté avec</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {related.map((p) => <ProductCard key={p.slug} product={p} />)}
          </div>
        </div>
      )}
    </div>
  );
}
