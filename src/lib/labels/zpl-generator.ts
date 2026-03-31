import type { PrintItem, LabelTemplateConfig } from "./types";

const DPI = 8; // dots per mm at 203 DPI

export function generateLabelsZpl(
  items: PrintItem[],
  template: LabelTemplateConfig,
  storeName?: string
): string {
  const widthDots = Math.round((template.widthMm || 58) * DPI);
  const heightDots = Math.round((template.heightMm || 40) * DPI);

  const labels: string[] = [];

  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      let zpl = `^XA\n`;
      zpl += `^PW${widthDots}\n`;
      zpl += `^LL${heightDots}\n`;
      zpl += `^CF0,24\n`;

      let yPos = 16;

      // Product name (truncate to fit)
      const name = item.productName.substring(0, 30);
      zpl += `^FO16,${yPos}^FD${escapeZpl(name)}^FS\n`;
      yPos += 32;

      // Price
      if (template.showPrice && item.price != null) {
        if (template.showOldPrice && item.oldPrice != null) {
          zpl += `^CF0,20\n`;
          zpl += `^FO16,${yPos}^FD${item.oldPrice.toFixed(2)} EUR^FS\n`;
          yPos += 24;
        }
        zpl += `^CF0,36\n`;
        zpl += `^FO16,${yPos}^FD${item.price.toFixed(2)} EUR^FS\n`;
        yPos += 44;
      }

      // Promo
      if (template.showPromoLabel && item.promoLabel) {
        zpl += `^CF0,20\n`;
        zpl += `^FO16,${yPos}^FD${escapeZpl(item.promoLabel)}^FS\n`;
        yPos += 24;
      }

      // Barcode
      if (template.showBarcode && item.barcode) {
        const barcodeH = 48;
        if (template.barcodeFormat === "EAN13") {
          zpl += `^FO16,${yPos}^BY2^BEN,${barcodeH},Y,N^FD${item.barcode}^FS\n`;
        } else if (template.barcodeFormat === "EAN8") {
          zpl += `^FO16,${yPos}^BY2^B8N,${barcodeH},Y,N^FD${item.barcode}^FS\n`;
        } else {
          zpl += `^FO16,${yPos}^BY2^BCN,${barcodeH},Y,N,N^FD${item.barcode}^FS\n`;
        }
        yPos += barcodeH + 16;
      }

      // SKU
      if (template.showSku && item.sku) {
        zpl += `^CF0,16\n`;
        zpl += `^FO16,${yPos}^FDRef: ${escapeZpl(item.sku)}^FS\n`;
        yPos += 20;
      }

      // Variant
      if (template.showVariant && item.variantName) {
        zpl += `^CF0,16\n`;
        zpl += `^FO16,${yPos}^FD${escapeZpl(item.variantName)}^FS\n`;
        yPos += 20;
      }

      // Store name (bottom)
      if (template.showStoreName && storeName) {
        zpl += `^CF0,14\n`;
        zpl += `^FO16,${heightDots - 20}^FD${escapeZpl(storeName)}^FS\n`;
      }

      // Date
      if (template.showDate && item.priceUpdatedAt) {
        const d = new Date(item.priceUpdatedAt);
        zpl += `^CF0,12\n`;
        zpl += `^FO${widthDots - 120},${heightDots - 18}^FDMAJ: ${d.toLocaleDateString("fr-FR")}^FS\n`;
      }

      zpl += `^XZ\n`;
      labels.push(zpl);
    }
  }

  return labels.join("\n");
}

function escapeZpl(text: string): string {
  return text.replace(/\^/g, "").replace(/~/g, "");
}
