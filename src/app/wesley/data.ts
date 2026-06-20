// ─────────────────────────────────────────────────────────────────────────────
// The Wesley — données de démonstration V1 (seed statique).
// V2 : remplacer par un PIM/catalogue en base (Prisma) + connexion POS pour le stock.
// Toutes les structures sont typées pour servir de contrat aux écrans et à l'API.
// ─────────────────────────────────────────────────────────────────────────────

export type Badge =
  | "TikTok trend"
  | "Best-seller"
  | "Petit prix"
  | "Nouveau"
  | "Bientôt épuisé";

export interface Category {
  slug: string;
  name: string;
  emoji: string;
  blurb: string;
}

export interface StoreStock {
  storeSlug: string;
  quantity: number;
}

export interface Product {
  slug: string;
  name: string;
  category: string; // Category.slug
  priceEUR: number;
  oldPriceEUR?: number;
  benefit: string; // "sert à quoi ?"
  description: string;
  image: string; // emoji placeholder en V1 (pas d'assets)
  badges: Badge[];
  onlineStock: number;
  storeStock: StoreStock[];
  clickAndCollect: boolean;
  relatedSlugs: string[];
  viralScore: number; // 0–100, calculé en V2 à partir des events
}

export interface Store {
  slug: string;
  name: string;
  city: string;
  region: string;
  address: string;
  postalCode: string;
  lat: number;
  lng: number;
  hours: string;
  status: "open" | "coming-soon";
  starProductSlugs: string[];
}

export const CATEGORIES: Category[] = [
  { slug: "beaute", name: "Beauté", emoji: "💄", blurb: "Maquillage & K-beauty petits prix" },
  { slug: "cheveux", name: "Cheveux", emoji: "💇‍♀️", blurb: "Accessoires & soins viraux" },
  { slug: "telephone", name: "Téléphone", emoji: "📱", blurb: "Coques, câbles, supports" },
  { slug: "creator-studio", name: "Creator Studio", emoji: "🎬", blurb: "Tout pour filmer & créer" },
  { slug: "lifestyle", name: "Lifestyle", emoji: "✨", blurb: "Déco mignonne & anti-stress" },
  { slug: "gadgets", name: "Gadgets utiles", emoji: "🔧", blurb: "Les petits trucs qui servent" },
];

export const STORES: Store[] = [
  {
    slug: "cergy-trois-fontaines",
    name: "The Wesley — Cergy Trois Fontaines",
    city: "Cergy",
    region: "Île-de-France",
    address: "Centre commercial des 3 Fontaines",
    postalCode: "95000",
    lat: 49.0379,
    lng: 2.0769,
    hours: "Lun–Sam 9h30–20h00",
    status: "open",
    starProductSlugs: ["ring-light-mini", "faux-ongles-press-on", "coque-anti-choc"],
  },
  {
    slug: "marseille-grand-littoral",
    name: "The Wesley — Marseille Grand Littoral",
    city: "Marseille",
    region: "PACA",
    address: "Centre commercial Grand Littoral",
    postalCode: "13015",
    lat: 43.3601,
    lng: 5.3441,
    hours: "Lun–Sam 9h30–20h00",
    status: "open",
    starProductSlugs: ["serum-glow", "trepied-flexible", "mini-sac-tendance"],
  },
  {
    slug: "lyon-part-dieu",
    name: "The Wesley — Lyon Part-Dieu",
    city: "Lyon",
    region: "Auvergne-Rhône-Alpes",
    address: "Centre commercial La Part-Dieu",
    postalCode: "69003",
    lat: 45.7607,
    lng: 4.8597,
    hours: "Ouverture prochaine",
    status: "coming-soon",
    starProductSlugs: [],
  },
];

export const PRODUCTS: Product[] = [
  {
    slug: "ring-light-mini",
    name: "Mini Ring Light clip téléphone",
    category: "creator-studio",
    priceEUR: 7.99,
    oldPriceEUR: 12.99,
    benefit: "Une lumière flatteuse pour tes vidéos et selfies, partout.",
    description:
      "Anneau lumineux rechargeable qui se clipse sur ton téléphone. 3 températures de lumière, parfait pour TikTok, lives et appels.",
    image: "💡",
    badges: ["TikTok trend", "Best-seller", "Petit prix"],
    onlineStock: 240,
    storeStock: [{ storeSlug: "cergy-trois-fontaines", quantity: 18 }],
    clickAndCollect: true,
    relatedSlugs: ["trepied-flexible", "support-telephone"],
    viralScore: 92,
  },
  {
    slug: "faux-ongles-press-on",
    name: "Faux ongles press-on (24 pcs)",
    category: "beaute",
    priceEUR: 3.99,
    benefit: "Une manucure salon en 5 minutes, sans colle qui abîme.",
    description:
      "24 faux ongles réutilisables avec colle douce incluse. Plusieurs finitions tendance, tenue jusqu'à 7 jours.",
    image: "💅",
    badges: ["TikTok trend", "Nouveau"],
    onlineStock: 530,
    storeStock: [
      { storeSlug: "cergy-trois-fontaines", quantity: 40 },
      { storeSlug: "marseille-grand-littoral", quantity: 22 },
    ],
    clickAndCollect: true,
    relatedSlugs: ["serum-glow"],
    viralScore: 88,
  },
  {
    slug: "serum-glow",
    name: "Sérum Glow vitamine C",
    category: "beaute",
    priceEUR: 5.99,
    oldPriceEUR: 8.99,
    benefit: "Un teint frais et lumineux dès le matin.",
    description:
      "Sérum visage à la vitamine C, format 30 ml. Texture légère qui pénètre vite, idéal sous le maquillage.",
    image: "🧴",
    badges: ["Best-seller", "Petit prix"],
    onlineStock: 310,
    storeStock: [{ storeSlug: "marseille-grand-littoral", quantity: 15 }],
    clickAndCollect: true,
    relatedSlugs: ["faux-ongles-press-on"],
    viralScore: 71,
  },
  {
    slug: "coque-anti-choc",
    name: "Coque anti-choc transparente",
    category: "telephone",
    priceEUR: 4.49,
    benefit: "Protège ton téléphone sans cacher sa couleur.",
    description:
      "Coque renforcée aux angles, compatible avec les modèles récents. Transparente, anti-jaunissement.",
    image: "📱",
    badges: ["Best-seller", "Petit prix"],
    onlineStock: 420,
    storeStock: [{ storeSlug: "cergy-trois-fontaines", quantity: 30 }],
    clickAndCollect: true,
    relatedSlugs: ["support-telephone", "ring-light-mini"],
    viralScore: 64,
  },
  {
    slug: "trepied-flexible",
    name: "Trépied flexible pour téléphone",
    category: "creator-studio",
    priceEUR: 6.49,
    benefit: "Filme mains libres sous n'importe quel angle.",
    description:
      "Trépied à bras flexibles qui s'accroche partout, avec support téléphone universel et déclencheur Bluetooth.",
    image: "🦾",
    badges: ["TikTok trend", "Bientôt épuisé"],
    onlineStock: 35,
    storeStock: [{ storeSlug: "marseille-grand-littoral", quantity: 6 }],
    clickAndCollect: true,
    relatedSlugs: ["ring-light-mini", "support-telephone"],
    viralScore: 81,
  },
  {
    slug: "support-telephone",
    name: "Support téléphone de bureau",
    category: "gadgets",
    priceEUR: 2.99,
    benefit: "Garde ton téléphone à la bonne hauteur, posé.",
    description: "Support pliable en aluminium, angle réglable, antidérapant.",
    image: "📐",
    badges: ["Petit prix"],
    onlineStock: 600,
    storeStock: [],
    clickAndCollect: false,
    relatedSlugs: ["trepied-flexible"],
    viralScore: 40,
  },
  {
    slug: "mini-sac-tendance",
    name: "Mini sac bandoulière tendance",
    category: "lifestyle",
    priceEUR: 9.99,
    benefit: "Le petit sac qui finit tous les looks.",
    description: "Mini sac à bandoulière réglable, plusieurs coloris, fermeture zippée.",
    image: "👜",
    badges: ["Nouveau", "TikTok trend"],
    onlineStock: 120,
    storeStock: [{ storeSlug: "marseille-grand-littoral", quantity: 9 }],
    clickAndCollect: true,
    relatedSlugs: ["serum-glow"],
    viralScore: 77,
  },
  {
    slug: "barrettes-perles",
    name: "Set barrettes perles (12 pcs)",
    category: "cheveux",
    priceEUR: 2.49,
    benefit: "Change de coiffure en 2 secondes.",
    description: "Lot de 12 barrettes à perles et clips tendance, pour tous types de cheveux.",
    image: "🎀",
    badges: ["Petit prix", "Nouveau"],
    onlineStock: 480,
    storeStock: [{ storeSlug: "cergy-trois-fontaines", quantity: 25 }],
    clickAndCollect: true,
    relatedSlugs: ["faux-ongles-press-on"],
    viralScore: 58,
  },
];

// ── Helpers (V1 = calculs en mémoire ; V2 = requêtes catalogue/POS) ──

export function getProduct(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function getCategory(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function getStore(slug: string): Store | undefined {
  return STORES.find((s) => s.slug === slug);
}

export function productsByCategory(slug: string): Product[] {
  return PRODUCTS.filter((p) => p.category === slug);
}

export function viralProducts(limit = 4): Product[] {
  return [...PRODUCTS].sort((a, b) => b.viralScore - a.viralScore).slice(0, limit);
}

export function newProducts(limit = 4): Product[] {
  return PRODUCTS.filter((p) => p.badges.includes("Nouveau")).slice(0, limit);
}

export function smallPrices(maxEUR: number, limit = 4): Product[] {
  return PRODUCTS.filter((p) => p.priceEUR <= maxEUR).slice(0, limit);
}

export function formatPrice(eur: number): string {
  return eur.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
