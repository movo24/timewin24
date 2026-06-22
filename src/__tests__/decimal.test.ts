import { toNum, toNumN } from "@/lib/decimal";

// M116 — frontière Decimal↔number (sous-tend tout M101/M101b money).

const dec = (n: number) => ({ toNumber: () => n }); // imite Prisma.Decimal

describe("toNum (Decimal | number -> number)", () => {
  it("laisse passer un number tel quel", () => {
    expect(toNum(5)).toBe(5);
    expect(toNum(0)).toBe(0); // pas de piège falsy
    expect(toNum(-3.5)).toBe(-3.5);
  });
  it("convertit un Decimal-like via .toNumber()", () => {
    expect(toNum(dec(12.34))).toBe(12.34);
    expect(toNum(dec(0))).toBe(0);
  });
});

describe("toNumN (… | null | undefined -> number | null)", () => {
  it("mappe null/undefined sur null", () => {
    expect(toNumN(null)).toBeNull();
    expect(toNumN(undefined)).toBeNull();
  });
  it("convertit 0 sans le confondre avec null", () => {
    expect(toNumN(0)).toBe(0);
    expect(toNumN(dec(0))).toBe(0);
  });
  it("convertit un Decimal-like non nul", () => {
    expect(toNumN(dec(7.5))).toBe(7.5);
    expect(toNumN(9)).toBe(9);
  });
});
