import Link from "next/link";
import { type Product, formatPrice } from "@/app/wesley/data";

const BADGE_STYLES: Record<string, string> = {
  "TikTok trend": "bg-black text-white",
  "Best-seller": "bg-amber-100 text-amber-800",
  "Petit prix": "bg-green-100 text-green-800",
  Nouveau: "bg-pink-100 text-pink-800",
  "Bientôt épuisé": "bg-red-100 text-red-800",
};

// Carte produit présentationnelle, utilisable côté serveur comme client.
export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/wesley/produit/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="flex h-40 items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50 text-6xl">
        {product.image}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap gap-1">
          {product.badges.slice(0, 2).map((b) => (
            <span
              key={b}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BADGE_STYLES[b] || "bg-gray-100 text-gray-700"}`}
            >
              {b}
            </span>
          ))}
        </div>
        <h3 className="line-clamp-2 text-sm font-semibold text-gray-900 group-hover:text-pink-700">
          {product.name}
        </h3>
        <div className="mt-auto flex items-baseline gap-2">
          <span className="text-lg font-bold text-pink-600">{formatPrice(product.priceEUR)}</span>
          {product.oldPriceEUR && (
            <span className="text-xs text-gray-400 line-through">
              {formatPrice(product.oldPriceEUR)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
