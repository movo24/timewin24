import type { Metadata } from "next";
import Link from "next/link";
import { TrackPageView } from "@/components/wesley/track-page-view";
import { STORES } from "../data";

export const metadata: Metadata = {
  title: "Nos magasins — The Wesley",
  description: "Trouve le magasin The Wesley le plus proche : horaires, adresse, stock local et produits stars.",
};

export default function StoresPage() {
  const open = STORES.filter((s) => s.status === "open");
  const soon = STORES.filter((s) => s.status === "coming-soon");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <TrackPageView path="/wesley/magasins" />
      <h1 className="mb-2 text-3xl font-black">Nos magasins</h1>
      <p className="mb-8 text-gray-600">Stock local, click &amp; collect et produits stars près de chez toi.</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {open.map((s) => (
          <Link key={s.slug} href={`/wesley/magasins/${s.slug}`} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md">
            <p className="text-lg font-bold">{s.city}</p>
            <p className="text-sm text-gray-500">{s.address}</p>
            <p className="text-sm text-gray-500">{s.postalCode} · {s.region}</p>
            <p className="mt-2 text-xs font-medium text-pink-700">{s.hours}</p>
          </Link>
        ))}
      </div>

      {soon.length > 0 && (
        <>
          <h2 className="mb-4 mt-10 text-xl font-black">Bientôt ouverts</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {soon.map((s) => (
              <Link key={s.slug} href={`/wesley/magasins/${s.slug}`} className="rounded-2xl border border-dashed border-pink-200 bg-pink-50/40 p-5">
                <p className="text-lg font-bold">{s.city}</p>
                <p className="text-sm text-gray-500">{s.region}</p>
                <p className="mt-2 text-xs font-semibold text-pink-700">Ouverture prochaine</p>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="mt-12 rounded-3xl bg-gray-50 p-8 text-center">
        <h2 className="text-xl font-black">Ta ville n’est pas là ?</h2>
        <Link href="/wesley/ville" className="mt-4 inline-block rounded-full bg-pink-600 px-6 py-3 font-semibold text-white hover:bg-pink-700">
          Je veux The Wesley dans ma ville
        </Link>
      </div>
    </div>
  );
}
