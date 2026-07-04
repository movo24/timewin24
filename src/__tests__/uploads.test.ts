import { detectMimeFromBytes, mimeToExt, ALLOWED_TYPES } from "@/lib/uploads";

// M116 / M011 — contrôle de sécurité upload : le type réel est déduit des
// magic bytes (anti-fichier déguisé), pas du Content-Type déclaré.

const buf = (...bytes: number[]) => Buffer.from(bytes);
// remplit jusqu'à 12 octets pour les formats qui lisent à offset 8/11
const pad = (b: number[]) => buf(...b, ...Array(Math.max(0, 12 - b.length)).fill(0));

describe("detectMimeFromBytes (magic bytes)", () => {
  it("reconnaît JPEG (FF D8 FF)", () => {
    expect(detectMimeFromBytes(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });
  it("reconnaît PNG (89 50 4E 47)", () => {
    expect(detectMimeFromBytes(pad([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
  });
  it("reconnaît PDF (%PDF)", () => {
    expect(detectMimeFromBytes(pad([0x25, 0x50, 0x44, 0x46]))).toBe("application/pdf");
  });
  it("reconnaît MP4/MOV (ftyp à l'offset 4)", () => {
    expect(detectMimeFromBytes(pad([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]))).toBe("video/mp4");
  });
  it("reconnaît WebP (RIFF…WEBP)", () => {
    expect(detectMimeFromBytes(buf(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
  });
  it("retourne null pour un buffer trop court", () => {
    expect(detectMimeFromBytes(buf(0xff, 0xd8))).toBeNull();
  });
  it("retourne null pour des octets inconnus (ex: exécutable déguisé)", () => {
    expect(detectMimeFromBytes(pad([0x4d, 0x5a, 0x90, 0x00]))).toBeNull(); // en-tête PE/EXE
  });
  it("tous les types détectés sont dans la liste autorisée", () => {
    for (const sig of [
      pad([0xff, 0xd8, 0xff]),
      pad([0x89, 0x50, 0x4e, 0x47]),
      pad([0x25, 0x50, 0x44, 0x46]),
    ]) {
      const m = detectMimeFromBytes(sig);
      expect(m && ALLOWED_TYPES.includes(m)).toBe(true);
    }
  });
});

describe("mimeToExt", () => {
  it("mappe les types connus", () => {
    expect(mimeToExt("image/jpeg")).toBe(".jpg");
    expect(mimeToExt("image/png")).toBe(".png");
    expect(mimeToExt("video/quicktime")).toBe(".mov");
    expect(mimeToExt("application/pdf")).toBe(".pdf");
  });
  it("retourne '' pour un type inconnu", () => {
    expect(mimeToExt("application/x-msdownload")).toBe("");
  });
});
