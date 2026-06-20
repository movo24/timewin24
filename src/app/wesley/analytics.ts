// ─────────────────────────────────────────────────────────────────────────────
// The Wesley — couche d'événements (data layer).
// V1 : pousse les events dans window.dataLayer (compatible GA4 via GTM) ET les
//      garde en mémoire pour debug. Aucun tracker n'est chargé sans consentement.
// V2 : brancher GA4 + Meta Conversions API côté serveur, alimenter les dashboards.
//
// Nomenclature alignée sur le brief : page_view, view_item, select_item,
// add_to_cart, remove_from_cart, begin_checkout, purchase, search,
// store_locator_view, click_store_direction, wishlist_add, product_share,
// abandoned_cart, newsletter_signup, city_request.
// ─────────────────────────────────────────────────────────────────────────────

export type WesleyEvent =
  | "page_view"
  | "view_item"
  | "select_item"
  | "add_to_cart"
  | "remove_from_cart"
  | "begin_checkout"
  | "purchase"
  | "search"
  | "store_locator_view"
  | "click_store_direction"
  | "wishlist_add"
  | "product_share"
  | "abandoned_cart"
  | "newsletter_signup"
  | "city_request";

type Payload = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer?: Payload[];
    __wesleyConsent?: boolean;
  }
}

/**
 * Pousse un événement dans la data layer.
 * Ne fait rien si le consentement mesure d'audience n'est pas donné (RGPD/CNIL).
 */
export function track(event: WesleyEvent, params: Payload = {}): void {
  if (typeof window === "undefined") return;
  if (!window.__wesleyConsent) return; // pas de tracking sans consentement
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ts: Date.now(), ...params });
}

/** Helper e-commerce : item GA4 standard. */
export function itemPayload(p: {
  slug: string;
  name: string;
  category: string;
  priceEUR: number;
}): Payload {
  return {
    item_id: p.slug,
    item_name: p.name,
    item_category: p.category,
    price: p.priceEUR,
    currency: "EUR",
  };
}
