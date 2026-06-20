"use client";

import { useMemo, useState } from "react";
import { ProductCard } from "./product-card";
import { track } from "@/app/wesley/analytics";
import { CATEGORIES, type Product } from "@/app/wesley/data";

type Sort = "viral" | "price-asc" | "new" | "best";

// Grille catalogue avec filtres + tri (client).
// V2 : filtres serveur + pagination + facettes issues du PIM.
export function CatalogueGrid({ products }: { products: Product[] }) {
  const [category, setCategory] = useState<string>("all");
  const [maxPrice, setMaxPrice] = useState<number>(0); // 0 = pas de limite
  const [sort, setSort] = useState<Sort>("viral");

  const filtered = useMemo(() => {
    let list = products.slice();
    if (category !== "all") list = list.filter((p) => p.category === category);
    if (maxPrice > 0) list = list.filter((p) => p.priceEUR <= maxPrice);
    switch (sort) {
      case "price-asc":
        list.sort((a, b) => a.priceEUR - b.priceEUR);
        break;
      case "new":
        list.sort((a, b) => Number(b.badges.includes("Nouveau")) - Number(a.badges.includes("Nouveau")));
        break;
      case "best":
        list.sort((a, b) => Number(b.badges.includes("Best-seller")) - Number(a.badges.includes("Best-seller")));
        break;
      default:
        list.sort((a, b) => b.viralScore - a.viralScore);
    }
    return list;
  }, [products, category, maxPrice, sort]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            track("select_item", { filter_category: e.target.value });
          }}
          className="rounded-full border border-gray-300 px-4 py-2 text-sm"
        >
          <option value="all">Toutes catégories</option>
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>

        <select
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          className="rounded-full border border-gray-300 px-4 py-2 text-sm"
        >
          <option value={0}>Tous les prix</option>
          <option value={2}>Moins de 2 €</option>
          <option value={5}>Moins de 5 €</option>
          <option value={10}>Moins de 10 €</option>
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded-full border border-gray-300 px-4 py-2 text-sm"
        >
          <option value="viral">Produits viraux</option>
          <option value="price-asc">Prix croissant</option>
          <option value="new">Nouveautés</option>
          <option value="best">Best-sellers</option>
        </select>

        <span className="ml-auto text-sm text-gray-500">{filtered.length} produits</span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((p) => (
          <ProductCard key={p.slug} product={p} />
        ))}
      </div>
    </div>
  );
}
