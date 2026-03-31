"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Search, Plus, Pencil, Trash2, Download, Loader2 } from "lucide-react";

interface Product {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  price: number | null;
  oldPrice: number | null;
  category: string | null;
  variantName: string | null;
  source: string;
  createdAt: string;
}

interface ProductForm {
  name: string;
  barcode: string;
  sku: string;
  price: string;
  oldPrice: string;
  category: string;
  variantName: string;
}

const emptyForm: ProductForm = {
  name: "",
  barcode: "",
  sku: "",
  price: "",
  oldPrice: "",
  category: "",
  variantName: "",
};

const SOURCE_BADGES: Record<string, { label: string; classes: string }> = {
  manual: { label: "Manuel", classes: "bg-gray-100 text-gray-700" },
  inventory_scan: { label: "Inventaire", classes: "bg-blue-100 text-blue-700" },
  pos_sync: { label: "Caisse", classes: "bg-green-100 text-green-700" },
};

export default function ProductCatalogue() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showDialog, setShowDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/products?${params}`);
      if (!res.ok) throw new Error("Erreur lors du chargement");
      const data = await res.json();
      setProducts(data.products || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError("Impossible de charger les produits.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const timeout = setTimeout(() => fetchProducts(), 300);
    return () => clearTimeout(timeout);
  }, [fetchProducts]);

  const openCreate = () => {
    setEditingProduct(null);
    setForm(emptyForm);
    setShowDialog(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      barcode: product.barcode || "",
      sku: product.sku || "",
      price: product.price != null ? String(product.price) : "",
      oldPrice: product.oldPrice != null ? String(product.oldPrice) : "",
      category: product.category || "",
      variantName: product.variantName || "",
    });
    setShowDialog(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        barcode: form.barcode.trim() || null,
        sku: form.sku.trim() || null,
        price: form.price ? parseFloat(form.price) : null,
        oldPrice: form.oldPrice ? parseFloat(form.oldPrice) : null,
        category: form.category.trim() || null,
        variantName: form.variantName.trim() || null,
      };

      const url = editingProduct
        ? `/api/products/${editingProduct.id}`
        : "/api/products";
      const method = editingProduct ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Erreur");
      setShowDialog(false);
      fetchProducts();
    } catch {
      setError("Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce produit ?")) return;
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erreur");
      fetchProducts();
    } catch {
      setError("Erreur lors de la suppression.");
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/products/import-from-inventory", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      alert(`${data.imported || 0} produit(s) importé(s) depuis l'inventaire.`);
      fetchProducts();
    } catch {
      setError("Erreur lors de l'import.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher un produit..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Importer depuis inventaire
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Ajouter produit
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-700">
                  Nom
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">
                  Code-barres
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">
                  SKU
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">
                  Prix
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">
                  Source
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Chargement...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Aucun produit trouv&eacute;.
                  </td>
                </tr>
              ) : (
                products.map((product) => {
                  const badge = SOURCE_BADGES[product.source] ||
                    SOURCE_BADGES.manual;
                  return (
                    <tr
                      key={product.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {product.name}
                        {product.variantName && (
                          <span className="ml-2 text-xs text-gray-500">
                            ({product.variantName})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                        {product.barcode || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {product.sku || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-900">
                        {product.price != null
                          ? `${product.price.toFixed(2)} \u20AC`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.classes}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(product)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(product.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Page {page} sur {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Pr&eacute;c&eacute;dent
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Modifier le produit" : "Ajouter un produit"}
            </DialogTitle>
            <DialogDescription>
              {editingProduct
                ? "Modifiez les informations du produit."
                : "Remplissez les informations pour cr\u00E9er un nouveau produit."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom *
              </label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nom du produit"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Code-barres
                </label>
                <Input
                  value={form.barcode}
                  onChange={(e) =>
                    setForm({ ...form, barcode: e.target.value })
                  }
                  placeholder="EAN / Code-barres"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SKU
                </label>
                <Input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="R\u00E9f\u00E9rence"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prix actuel
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ancien prix
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.oldPrice}
                  onChange={(e) =>
                    setForm({ ...form, oldPrice: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cat&eacute;gorie
                </label>
                <Input
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                  placeholder="Cat\u00E9gorie"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Variante
                </label>
                <Input
                  value={form.variantName}
                  onChange={(e) =>
                    setForm({ ...form, variantName: e.target.value })
                  }
                  placeholder="Ex: Taille M, Rouge..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDialog(false)}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingProduct ? "Enregistrer" : "Cr\u00E9er"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
