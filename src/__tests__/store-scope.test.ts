import { isStoreAccessible, resolveStoreWhere, resolveNestedStoreFilter } from "@/lib/store-scope";

// Sécurité multi-magasin — logique PURE de périmètre.
// null = ADMIN (tout) ; [] = aucun ; [ids] = restreint.

describe("isStoreAccessible", () => {
  it("admin (null) accède à tout", () => {
    expect(isStoreAccessible(null, "s1")).toBe(true);
  });
  it("manager : seulement ses magasins", () => {
    expect(isStoreAccessible(["s1", "s2"], "s1")).toBe(true);
    expect(isStoreAccessible(["s1", "s2"], "s9")).toBe(false);
  });
  it("aucun magasin : rien", () => {
    expect(isStoreAccessible([], "s1")).toBe(false);
  });
});

describe("resolveStoreWhere", () => {
  it("admin sans demande : tout (undefined)", () => {
    expect(resolveStoreWhere(null, null)).toEqual({ ok: true, where: undefined });
  });
  it("admin avec magasin précis : ce magasin", () => {
    expect(resolveStoreWhere(null, "s1")).toEqual({ ok: true, where: "s1" });
  });
  it("admin avec 'all' : tout", () => {
    expect(resolveStoreWhere(null, "all")).toEqual({ ok: true, where: undefined });
  });
  it("manager sans demande : restreint à son ensemble", () => {
    expect(resolveStoreWhere(["s1", "s2"], null)).toEqual({ ok: true, where: { in: ["s1", "s2"] } });
  });
  it("manager sur 'all' : restreint quand même à son ensemble (pas d'évasion)", () => {
    expect(resolveStoreWhere(["s1", "s2"], "all")).toEqual({ ok: true, where: { in: ["s1", "s2"] } });
  });
  it("manager demandant un de ses magasins : autorisé", () => {
    expect(resolveStoreWhere(["s1", "s2"], "s2")).toEqual({ ok: true, where: "s2" });
  });
  it("manager demandant un magasin HORS périmètre : refusé", () => {
    expect(resolveStoreWhere(["s1", "s2"], "s9")).toEqual({ ok: false });
  });
  it("aucun magasin demandant un magasin : refusé", () => {
    expect(resolveStoreWhere([], "s1")).toEqual({ ok: false });
  });
});

describe("resolveNestedStoreFilter", () => {
  it("propage le refus", () => {
    expect(resolveNestedStoreFilter(["s1"], "s9")).toEqual({ ok: false });
  });
  it("admin : aucun filtre", () => {
    expect(resolveNestedStoreFilter(null, null)).toEqual({ ok: true, storeIdFilter: undefined });
  });
  it("manager : filtre in", () => {
    expect(resolveNestedStoreFilter(["s1", "s2"], null)).toEqual({ ok: true, storeIdFilter: { in: ["s1", "s2"] } });
  });
});
