"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tag, Package, Printer, History, LayoutTemplate } from "lucide-react";
import ProductCatalogue from "@/components/labels/product-catalogue";
import TemplateManager from "@/components/labels/template-manager";
import LabelPrinter from "@/components/labels/label-printer";
import PrintHistory from "@/components/labels/print-history";

export default function EtiquettesPage() {
  const [activeTab, setActiveTab] = useState("impression");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Tag className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Étiquettes</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="impression" className="gap-2">
            <Printer className="h-4 w-4" />
            Impression
          </TabsTrigger>
          <TabsTrigger value="catalogue" className="gap-2">
            <Package className="h-4 w-4" />
            Catalogue
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <LayoutTemplate className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="historique" className="gap-2">
            <History className="h-4 w-4" />
            Historique
          </TabsTrigger>
        </TabsList>

        <TabsContent value="impression">
          <LabelPrinter />
        </TabsContent>

        <TabsContent value="catalogue">
          <ProductCatalogue />
        </TabsContent>

        <TabsContent value="templates">
          <TemplateManager />
        </TabsContent>

        <TabsContent value="historique">
          <PrintHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
