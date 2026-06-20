import type { Metadata } from "next";
import { CatalogueGrid } from "@/components/wesley/catalogue-grid";
import { TrackPageView } from "@/components/wesley/track-page-view";
import { PRODUCTS } from "../data";

export const metadata: Metadata = {
  title: "Catalogue — The Wesley",
  description:
    "Tout le catalogue The Wesley : beauté, cheveux, téléphone, Creator Studio, lifestyle et gadgets. Filtre par prix, catégorie et tendance.",
};

export default function CataloguePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <TrackPageView path="/wesley/catalogue" />
      <h1 className="mb-2 text-3xl font-black">Catalogue</h1>
      <p className="mb-8 text-gray-600">Les produits qui cartonnent, à petits prix.</p>
      <CatalogueGrid products={PRODUCTS} />
    </div>
  );
}
