"use client";

import jsPDF from "jspdf";
import JsBarcode from "jsbarcode";
import type { PrintItem, LabelTemplateConfig } from "./types";

export async function generateLabelsPdf(
  items: PrintItem[],
  template: LabelTemplateConfig,
  storeName?: string
): Promise<Blob> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;
  const marginTop = 13;
  const marginLeft = 5;
  const marginRight = 5;
  const marginBottom = 10;

  const cols = template.columns || 3;
  const rows = template.rows || 8;
  const cellW = (pageW - marginLeft - marginRight) / cols;
  const cellH = (pageH - marginTop - marginBottom) / rows;
  const padding = 2;

  // Expand items by quantity
  const labels: PrintItem[] = [];
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      labels.push(item);
    }
  }

  for (let i = 0; i < labels.length; i++) {
    if (i > 0 && i % (cols * rows) === 0) {
      doc.addPage();
    }

    const pageIndex = i % (cols * rows);
    const col = pageIndex % cols;
    const row = Math.floor(pageIndex / cols);
    const x = marginLeft + col * cellW + padding;
    const y = marginTop + row * cellH + padding;
    const w = cellW - padding * 2;
    const h = cellH - padding * 2;

    const label = labels[i];

    // Draw cell border (light gray)
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.rect(x, y, w, h);

    let currentY = y + 2;

    // Product name
    doc.setFontSize(template.fontSize);
    doc.setFont("helvetica", "bold");
    const nameLines = doc.splitTextToSize(label.productName, w - 2);
    doc.text(nameLines.slice(0, 2), x + 1, currentY + 3);
    currentY += Math.min(nameLines.length, 2) * 3 + 2;

    // Price
    if (template.showPrice && label.price != null) {
      // Old price (strikethrough)
      if (template.showOldPrice && label.oldPrice != null) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150);
        const oldText = `${label.oldPrice.toFixed(2)} \u20AC`;
        doc.text(oldText, x + 1, currentY + 2);
        const oldW = doc.getTextWidth(oldText);
        doc.line(x + 1, currentY + 1.5, x + 1 + oldW, currentY + 1.5);
        doc.setTextColor(0);
        currentY += 3;
      }

      doc.setFontSize(template.priceFontSize);
      doc.setFont("helvetica", "bold");
      doc.text(`${label.price.toFixed(2)} \u20AC`, x + 1, currentY + 4);
      currentY += 6;
    }

    // Promo label
    if (template.showPromoLabel && label.promoLabel) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(220, 50, 50);
      doc.text(label.promoLabel, x + 1, currentY + 2);
      doc.setTextColor(0);
      currentY += 3;
    }

    // Barcode
    if (template.showBarcode && label.barcode) {
      try {
        const canvas = document.createElement("canvas");
        const barcodeFormat = template.barcodeFormat === "EAN13" ? "EAN13" :
                              template.barcodeFormat === "EAN8" ? "EAN8" : "CODE128";
        JsBarcode(canvas, label.barcode, {
          format: barcodeFormat,
          width: 1.5,
          height: 25,
          displayValue: true,
          fontSize: 8,
          margin: 0,
        });
        const barcodeImg = canvas.toDataURL("image/png");
        const barcodeW = Math.min(w - 2, 30);
        const barcodeH = 8;
        doc.addImage(barcodeImg, "PNG", x + 1, currentY, barcodeW, barcodeH);
        currentY += barcodeH + 1;
      } catch {
        // Barcode generation failed, skip
        doc.setFontSize(6);
        doc.text(label.barcode, x + 1, currentY + 2);
        currentY += 3;
      }
    }

    // SKU
    if (template.showSku && label.sku) {
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.text(`Ref: ${label.sku}`, x + 1, currentY + 2);
      currentY += 3;
    }

    // Variant
    if (template.showVariant && label.variantName) {
      doc.setFontSize(6);
      doc.text(label.variantName, x + 1, currentY + 2);
      currentY += 3;
    }

    // Store name
    if (template.showStoreName && storeName) {
      doc.setFontSize(5);
      doc.setTextColor(120);
      doc.text(storeName, x + 1, y + h - 1);
      doc.setTextColor(0);
    }

    // Price date
    if (template.showDate && label.priceUpdatedAt) {
      doc.setFontSize(5);
      doc.setTextColor(150);
      const d = new Date(label.priceUpdatedAt);
      doc.text(`MAJ: ${d.toLocaleDateString("fr-FR")}`, x + w - 20, y + h - 1);
      doc.setTextColor(0);
    }
  }

  return doc.output("blob");
}
