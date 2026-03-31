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
import { LayoutTemplate, Pencil, Star, Loader2 } from "lucide-react";
import type { LabelTemplateConfig } from "@/lib/labels/types";

interface TemplateFromApi extends LabelTemplateConfig {
  isSystem: boolean;
  isDefault: boolean;
}

export default function TemplateManager() {
  const [templates, setTemplates] = useState<TemplateFromApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<TemplateFromApi | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<LabelTemplateConfig>>({});

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/labels/templates");
      if (!res.ok) throw new Error("Erreur");
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch {
      setError("Impossible de charger les templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const a4Templates = templates.filter((t) => t.type === "a4");
  const thermalTemplates = templates.filter((t) => t.type === "thermal");

  const openEdit = (template: TemplateFromApi) => {
    setEditingTemplate(template);
    setForm({
      name: template.name,
      columns: template.columns,
      rows: template.rows,
      widthMm: template.widthMm,
      heightMm: template.heightMm,
      showBarcode: template.showBarcode,
      showPrice: template.showPrice,
      showOldPrice: template.showOldPrice,
      showSku: template.showSku,
      showStoreName: template.showStoreName,
      showDate: template.showDate,
      showPromoLabel: template.showPromoLabel,
      showVariant: template.showVariant,
      barcodeFormat: template.barcodeFormat,
      fontSize: template.fontSize,
      priceFontSize: template.priceFontSize,
    });
    setShowDialog(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/labels/templates/${editingTemplate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Erreur");
      setShowDialog(false);
      fetchTemplates();
    } catch {
      setError("Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch(`/api/labels/templates/${id}/default`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Erreur");
      fetchTemplates();
    } catch {
      setError("Erreur lors de la mise \u00E0 jour.");
    }
  };

  const toggleField = (field: keyof LabelTemplateConfig) => {
    setForm((prev) => ({ ...prev, [field]: !prev[field as keyof typeof prev] }));
  };

  const ToggleSwitch = ({
    label,
    checked,
    onChange,
  }: {
    label: string;
    checked: boolean;
    onChange: () => void;
  }) => (
    <label className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? "bg-blue-600" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* A4 Templates */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Format A4</h2>
        {a4Templates.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun template A4.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {a4Templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onEdit={() => openEdit(template)}
                onSetDefault={() => handleSetDefault(template.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Thermal Templates */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Format Thermique
        </h2>
        {thermalTemplates.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun template thermique.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {thermalTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onEdit={() => openEdit(template)}
                onSetDefault={() => handleSetDefault(template.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier le template</DialogTitle>
            <DialogDescription>
              Configurez les options d&apos;affichage du template.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom
              </label>
              <Input
                value={form.name || ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            {editingTemplate?.type === "a4" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Colonnes
                  </label>
                  <Input
                    type="number"
                    value={form.columns ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        columns: parseInt(e.target.value) || null,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lignes
                  </label>
                  <Input
                    type="number"
                    value={form.rows ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        rows: parseInt(e.target.value) || null,
                      })
                    }
                  />
                </div>
              </div>
            )}

            {editingTemplate?.type === "thermal" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Largeur (mm)
                  </label>
                  <Input
                    type="number"
                    value={form.widthMm ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        widthMm: parseInt(e.target.value) || null,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hauteur (mm)
                  </label>
                  <Input
                    type="number"
                    value={form.heightMm ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        heightMm: parseInt(e.target.value) || null,
                      })
                    }
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Taille police
                </label>
                <Input
                  type="number"
                  value={form.fontSize ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      fontSize: parseInt(e.target.value) || 8,
                    })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Taille prix
                </label>
                <Input
                  type="number"
                  value={form.priceFontSize ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      priceFontSize: parseInt(e.target.value) || 12,
                    })
                  }
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Format code-barres
              </label>
              <select
                value={form.barcodeFormat || "CODE128"}
                onChange={(e) =>
                  setForm({ ...form, barcodeFormat: e.target.value })
                }
                className="flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
              >
                <option value="CODE128">CODE128</option>
                <option value="EAN13">EAN13</option>
                <option value="EAN8">EAN8</option>
              </select>
            </div>

            <div className="border-t border-gray-200 pt-3 space-y-1">
              <p className="text-sm font-medium text-gray-700 mb-2">
                Options d&apos;affichage
              </p>
              <ToggleSwitch
                label="Afficher le prix"
                checked={!!form.showPrice}
                onChange={() => toggleField("showPrice")}
              />
              <ToggleSwitch
                label="Afficher l'ancien prix"
                checked={!!form.showOldPrice}
                onChange={() => toggleField("showOldPrice")}
              />
              <ToggleSwitch
                label="Afficher le code-barres"
                checked={!!form.showBarcode}
                onChange={() => toggleField("showBarcode")}
              />
              <ToggleSwitch
                label="Afficher le SKU"
                checked={!!form.showSku}
                onChange={() => toggleField("showSku")}
              />
              <ToggleSwitch
                label="Afficher le nom du magasin"
                checked={!!form.showStoreName}
                onChange={() => toggleField("showStoreName")}
              />
              <ToggleSwitch
                label="Afficher la date"
                checked={!!form.showDate}
                onChange={() => toggleField("showDate")}
              />
              <ToggleSwitch
                label="Afficher le label promo"
                checked={!!form.showPromoLabel}
                onChange={() => toggleField("showPromoLabel")}
              />
              <ToggleSwitch
                label="Afficher la variante"
                checked={!!form.showVariant}
                onChange={() => toggleField("showVariant")}
              />
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
                Enregistrer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateCard({
  template,
  onEdit,
  onSetDefault,
}: {
  template: TemplateFromApi;
  onEdit: () => void;
  onSetDefault: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-5 w-5 text-gray-400" />
          <h3 className="font-medium text-gray-900">{template.name}</h3>
        </div>
        {template.isDefault && (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
            <Star className="h-3 w-3" />
            Par d&eacute;faut
          </span>
        )}
      </div>

      <div className="text-xs text-gray-500 space-y-1 mb-4">
        {template.type === "a4" ? (
          <p>
            {template.columns} col. x {template.rows} lig. ={" "}
            {(template.columns || 3) * (template.rows || 8)} &eacute;tiquettes/page
          </p>
        ) : (
          <p>
            {template.widthMm} x {template.heightMm} mm
          </p>
        )}
        <p>Code-barres : {template.barcodeFormat}</p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-3 w-3 mr-1" />
          Modifier
        </Button>
        {!template.isDefault && (
          <Button variant="ghost" size="sm" onClick={onSetDefault}>
            <Star className="h-3 w-3 mr-1" />
            Par d&eacute;faut
          </Button>
        )}
      </div>
    </div>
  );
}
