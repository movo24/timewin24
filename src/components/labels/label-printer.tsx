"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Plus,
  Minus,
  X,
  FileText,
  Printer,
  Loader2,
  ShoppingCart,
  Tag,
} from "lucide-react";
import type { PrintItem, LabelTemplateConfig } from "@/lib/labels/types";
import { generateLabelsPdf } from "@/lib/labels/pdf-generator";
import { generateLabelsZpl } from "@/lib/labels/zpl-generator";
import { downloadBlob, downloadText } from "@/lib/labels/download";

interface ProductResult {
  id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  price: number | null;
  oldPrice: number | null;
  variantName: string | null;
  priceUpdatedAt: string | null;
}

interface TemplateOption extends LabelTemplateConfig {
  isDefault: boolean;
}

export default function LabelPrinter() {
  // Search
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ProductResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Cart
  const [cart, setCart] = useState<PrintItem[]>([]);

  // Templates
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // Generation
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch templates on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/labels/templates");
        if (!res.ok) throw new Error("Erreur");
        const data = await res.json();
        const tpls = data.templates || [];
        setTemplates(tpls);
        const defaultTpl = tpls.find((t: TemplateOption) => t.isDefault);
        if (defaultTpl) setSelectedTemplate(defaultTpl.id);
        else if (tpls.length > 0) setSelectedTemplate(tpls[0].id);
      } catch {
        setError("Impossible de charger les templates.");
      } finally {
        setLoadingTemplates(false);
      }
    }
    load();
  }, []);

  // Search products
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/products?search=${encodeURIComponent(search)}&limit=10`
        );
        if (!res.ok) throw new Error("Erreur");
        const data = await res.json();
        setSearchResults(data.products || []);
      } catch {
        // silent
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const addToCart = (product: ProductResult) => {
    const exists = cart.find((c) => c.productId === product.id);
    if (exists) {
      setCart(
        cart.map((c) =>
          c.productId === product.id
            ? { ...c, quantity: c.quantity + 1 }
            : c
        )
      );
    } else {
      setCart([
        ...cart,
        {
          productId: product.id,
          productName: product.name,
          price: product.price,
          oldPrice: product.oldPrice,
          barcode: product.barcode,
          sku: product.sku,
          variantName: product.variantName,
          priceUpdatedAt: product.priceUpdatedAt,
          promoLabel: null,
          quantity: 1,
        },
      ]);
    }
    setSearch("");
    setSearchResults([]);
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((c) => c.productId !== productId));
  };

  const updateQuantity = (productId: string, qty: number) => {
    if (qty < 1) return;
    setCart(
      cart.map((c) =>
        c.productId === productId ? { ...c, quantity: qty } : c
      )
    );
  };

  const updatePromoLabel = (productId: string, label: string) => {
    setCart(
      cart.map((c) =>
        c.productId === productId ? { ...c, promoLabel: label || null } : c
      )
    );
  };

  const activeTemplate = templates.find((t) => t.id === selectedTemplate);
  const totalLabels = cart.reduce((sum, c) => sum + c.quantity, 0);

  const handleGenerate = async (format: "pdf" | "zpl") => {
    if (!activeTemplate || cart.length === 0) return;
    setGenerating(true);
    setError(null);

    try {
      // Record the print job
      await fetch("/api/labels/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: activeTemplate.id,
          format,
          items: cart.map((c) => ({
            productId: c.productId,
            quantity: c.quantity,
            promoLabel: c.promoLabel,
          })),
        }),
      });

      if (format === "pdf") {
        const blob = await generateLabelsPdf(cart, activeTemplate);
        const filename = `etiquettes-${new Date().toISOString().slice(0, 10)}.pdf`;
        downloadBlob(blob, filename);
      } else {
        const zpl = generateLabelsZpl(cart, activeTemplate);
        const filename = `etiquettes-${new Date().toISOString().slice(0, 10)}.zpl`;
        downloadText(zpl, filename);
      }
    } catch {
      setError("Erreur lors de la g\u00E9n\u00E9ration.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step 1: Product Search */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Search className="h-4 w-4" />
          1. Rechercher des produits
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Rechercher par nom, code-barres ou SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
          )}
        </div>

        {searchResults.length > 0 && (
          <div className="mt-2 rounded-md border border-gray-200 bg-white max-h-48 overflow-y-auto">
            {searchResults.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0 text-left"
              >
                <div>
                  <span className="font-medium text-gray-900">
                    {product.name}
                  </span>
                  {product.variantName && (
                    <span className="ml-2 text-xs text-gray-500">
                      ({product.variantName})
                    </span>
                  )}
                  {product.barcode && (
                    <span className="ml-2 text-xs text-gray-400 font-mono">
                      {product.barcode}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {product.price != null && (
                    <span className="text-sm font-medium text-gray-700">
                      {product.price.toFixed(2)} &euro;
                    </span>
                  )}
                  <Plus className="h-4 w-4 text-blue-600" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" />
          Panier ({cart.length} produit{cart.length !== 1 ? "s" : ""},{" "}
          {totalLabels} &eacute;tiquette{totalLabels !== 1 ? "s" : ""})
        </h2>

        {cart.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Tag className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">
              Aucun produit s&eacute;lectionn&eacute;. Recherchez et ajoutez des
              produits ci-dessus.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {cart.map((item) => (
              <div
                key={item.productId}
                className="flex items-center gap-3 rounded-md border border-gray-100 p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.productName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {item.price != null
                      ? `${item.price.toFixed(2)} \u20AC`
                      : "Prix non d\u00E9fini"}
                    {item.barcode && ` \u00B7 ${item.barcode}`}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <Input
                    type="text"
                    placeholder="Promo"
                    value={item.promoLabel || ""}
                    onChange={(e) =>
                      updatePromoLabel(item.productId, e.target.value)
                    }
                    className="w-24 h-8 text-xs"
                  />
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      updateQuantity(item.productId, item.quantity - 1)
                    }
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) =>
                      updateQuantity(
                        item.productId,
                        parseInt(e.target.value) || 1
                      )
                    }
                    className="w-14 h-7 text-center text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      updateQuantity(item.productId, item.quantity + 1)
                    }
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => removeFromCart(item.productId)}
                >
                  <X className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Step 2: Template Selection */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          2. Choisir un template
        </h2>

        {loadingTemplates ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-gray-500">
            Aucun template disponible.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => setSelectedTemplate(tpl.id)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  selectedTemplate === tpl.id
                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <p className="text-sm font-medium text-gray-900">{tpl.name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {tpl.type === "a4"
                    ? `A4 \u00B7 ${(tpl.columns || 3) * (tpl.rows || 8)} / page`
                    : `Thermique \u00B7 ${tpl.widthMm}x${tpl.heightMm}mm`}
                </p>
                {tpl.isDefault && (
                  <span className="inline-block mt-1 text-xs text-yellow-600 font-medium">
                    Par d&eacute;faut
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Step 3: Summary & Generate */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Printer className="h-4 w-4" />
          3. G&eacute;n&eacute;rer
        </h2>

        {cart.length > 0 && activeTemplate && (
          <div className="mb-4 text-sm text-gray-600 space-y-1">
            <p>
              <span className="font-medium">{totalLabels}</span> &eacute;tiquette
              {totalLabels !== 1 ? "s" : ""} &agrave; imprimer
            </p>
            <p>
              Format :{" "}
              <span className="font-medium">
                {activeTemplate.type === "a4" ? "PDF (A4)" : "ZPL (Thermique)"}
              </span>
            </p>
            {activeTemplate.type === "a4" && (
              <p>
                Pages :{" "}
                <span className="font-medium">
                  {Math.ceil(
                    totalLabels /
                      ((activeTemplate.columns || 3) *
                        (activeTemplate.rows || 8))
                  )}
                </span>
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3">
          {activeTemplate?.type === "a4" ? (
            <Button
              onClick={() => handleGenerate("pdf")}
              disabled={
                generating || cart.length === 0 || !activeTemplate
              }
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              G&eacute;n&eacute;rer PDF
            </Button>
          ) : activeTemplate?.type === "thermal" ? (
            <Button
              onClick={() => handleGenerate("zpl")}
              disabled={
                generating || cart.length === 0 || !activeTemplate
              }
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Printer className="h-4 w-4 mr-2" />
              )}
              G&eacute;n&eacute;rer ZPL
            </Button>
          ) : (
            <p className="text-sm text-gray-500">
              S&eacute;lectionnez un template pour g&eacute;n&eacute;rer.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
