"use client";

import { useState } from "react";
import { track, itemPayload } from "@/app/wesley/analytics";
import type { Product } from "@/app/wesley/data";

// Actions client d'une fiche produit : panier, wishlist, partage.
// V1 : émet les événements e-commerce + feedback visuel.
// V2 : panier persistant, checkout réel, wishlist côté compte client.
export function ProductActions({ product }: { product: Product }) {
  const [added, setAdded] = useState(false);
  const [wished, setWished] = useState(false);

  const item = itemPayload(product);

  function addToCart() {
    track("add_to_cart", { ...item, quantity: 1 });
    setAdded(true);
  }

  function addWishlist() {
    track("wishlist_add", item);
    setWished(true);
  }

  function share() {
    track("product_share", { item_id: product.slug });
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: product.name, url }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      <button
        onClick={addToCart}
        className="rounded-full bg-pink-600 px-6 py-3 font-semibold text-white hover:bg-pink-700"
      >
        {added ? "✓ Ajouté au panier" : "Ajouter au panier"}
      </button>
      <button
        onClick={addWishlist}
        className="rounded-full border border-pink-300 px-6 py-3 font-medium text-pink-700 hover:bg-pink-50"
      >
        {wished ? "♥ Dans la wishlist" : "♡ Wishlist"}
      </button>
      <button
        onClick={share}
        className="rounded-full border border-gray-300 px-6 py-3 font-medium text-gray-700 hover:bg-gray-50"
      >
        Partager à une amie
      </button>
    </div>
  );
}
