import { generateLabelsZpl } from "@/lib/labels/zpl-generator";
import type { PrintItem, LabelTemplateConfig } from "@/lib/labels/types";

// M116/M010 — couverture du générateur ZPL (étiquettes thermiques, pur).

const item = (o: Partial<PrintItem> = {}): PrintItem => ({
  productId: "p1",
  productName: "Bonbon",
  price: 1.5,
  quantity: 1,
  ...o,
});

const tpl = (o: Partial<LabelTemplateConfig> = {}): LabelTemplateConfig => ({
  id: "t1", name: "T", type: "thermal", labelsPerPage: null, columns: null, rows: null,
  widthMm: 58, heightMm: 40,
  showBarcode: false, showPrice: false, showOldPrice: false, showSku: false,
  showStoreName: false, showDate: false, showPromoLabel: false, showVariant: false,
  barcodeFormat: "CODE128", fontSize: 24, priceFontSize: 36,
  ...o,
});

const countBlocks = (zpl: string) => (zpl.match(/\^XA/g) || []).length;

describe("generateLabelsZpl (M010 — étiquettes thermiques)", () => {
  it("génère une étiquette par quantité", () => {
    expect(countBlocks(generateLabelsZpl([item({ quantity: 3 })], tpl()))).toBe(3);
  });

  it("génère une étiquette par article", () => {
    const z = generateLabelsZpl([item({ productId: "a" }), item({ productId: "b" })], tpl());
    expect(countBlocks(z)).toBe(2);
  });

  it("convertit les dimensions mm → dots (×8 à 203 DPI)", () => {
    const z = generateLabelsZpl([item()], tpl({ widthMm: 58, heightMm: 40 }));
    expect(z).toContain("^PW464"); // 58 * 8
    expect(z).toContain("^LL320"); // 40 * 8
  });

  it("utilise les défauts 58×40 si dimensions nulles", () => {
    const z = generateLabelsZpl([item()], tpl({ widthMm: null, heightMm: null }));
    expect(z).toContain("^PW464");
    expect(z).toContain("^LL320");
  });

  it("formate le prix en EUR à 2 décimales quand activé", () => {
    const z = generateLabelsZpl([item({ price: 9.9 })], tpl({ showPrice: true }));
    expect(z).toContain("9.90 EUR");
  });

  it("affiche l'ancien prix quand showOldPrice", () => {
    const z = generateLabelsZpl([item({ price: 8, oldPrice: 12 })], tpl({ showPrice: true, showOldPrice: true }));
    expect(z).toContain("12.00 EUR");
    expect(z).toContain("8.00 EUR");
  });

  it("n'affiche aucun prix quand showPrice est false", () => {
    const z = generateLabelsZpl([item({ price: 9.9 })], tpl({ showPrice: false }));
    expect(z).not.toContain("EUR");
  });

  it("choisit le bon code-barres selon le format", () => {
    const ean13 = generateLabelsZpl([item({ barcode: "3017620422003" })], tpl({ showBarcode: true, barcodeFormat: "EAN13" }));
    expect(ean13).toContain("^BEN,");
    const ean8 = generateLabelsZpl([item({ barcode: "96385074" })], tpl({ showBarcode: true, barcodeFormat: "EAN8" }));
    expect(ean8).toContain("^B8N,");
    const code128 = generateLabelsZpl([item({ barcode: "ABC123" })], tpl({ showBarcode: true, barcodeFormat: "CODE128" }));
    expect(code128).toContain("^BCN,");
  });

  it("échappe les caractères de contrôle ZPL (^ et ~)", () => {
    const z = generateLabelsZpl([item({ productName: "Choco^Bar~X" })], tpl());
    expect(z).toContain("ChocoBarX");
    // le nom ne doit pas réintroduire de ^ / ~ parasites dans le champ ^FD
    expect(z).toContain("^FDChocoBarX^FS");
  });

  it("tronque le nom produit à 30 caractères", () => {
    const longName = "X".repeat(50);
    const z = generateLabelsZpl([item({ productName: longName })], tpl());
    expect(z).toContain("^FD" + "X".repeat(30) + "^FS");
    expect(z).not.toContain("X".repeat(31));
  });

  it("ajoute le nom du magasin quand showStoreName", () => {
    const z = generateLabelsZpl([item()], tpl({ showStoreName: true }), "Wesley Candy");
    expect(z).toContain("Wesley Candy");
  });

  it("chaque étiquette est un bloc ^XA…^XZ complet", () => {
    const z = generateLabelsZpl([item()], tpl());
    expect(z).toContain("^XA");
    expect(z).toContain("^XZ");
  });
});
