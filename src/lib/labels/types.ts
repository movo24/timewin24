export interface PrintItem {
  productId: string;
  productName: string;
  price: number | null;
  oldPrice?: number | null;
  barcode?: string | null;
  sku?: string | null;
  variantName?: string | null;
  promoLabel?: string | null;
  priceUpdatedAt?: string | null;
  quantity: number;
}

export interface LabelTemplateConfig {
  id: string;
  name: string;
  type: "a4" | "thermal";
  labelsPerPage: number | null;
  columns: number | null;
  rows: number | null;
  widthMm: number | null;
  heightMm: number | null;
  showBarcode: boolean;
  showPrice: boolean;
  showOldPrice: boolean;
  showSku: boolean;
  showStoreName: boolean;
  showDate: boolean;
  showPromoLabel: boolean;
  showVariant: boolean;
  barcodeFormat: string;
  fontSize: number;
  priceFontSize: number;
}
