import {
  serializeProduct,
  serializeStoreVat,
  serializeLabelJob,
} from "@/lib/money-serialize";

// M116 / M101b — frontiere de serialisation API money : les colonnes Decimal
// (Prisma) doivent ressortir en `number` pour preserver le contrat JSON
// (NextResponse.json() serialiserait un Decimal en string, cassant les clients).

const dec = (n: number) => ({ toNumber: () => n });

describe("serializeProduct", () => {
  it("coerce price/oldPrice/vatRate Decimal -> number", () => {
    const out = serializeProduct({
      id: "p1", name: "Bonbon",
      price: dec(2.5), oldPrice: dec(3), vatRate: dec(5.5),
    });
    expect(out.price).toBe(2.5);
    expect(out.oldPrice).toBe(3);
    expect(out.vatRate).toBe(5.5);
    expect(out.name).toBe("Bonbon"); // champ non-money preserve
  });
  it("preserve null (oldPrice optionnel)", () => {
    const out = serializeProduct({ id: "p1", price: dec(2), oldPrice: null, vatRate: dec(20) });
    expect(out.price).toBe(2);
    expect(out.oldPrice).toBeNull();
  });
  it("n'invente pas les cles absentes (select partiel)", () => {
    const out = serializeProduct({ id: "p1", name: "x" });
    expect("price" in out).toBe(false);
    expect("vatRate" in out).toBe(false);
  });
  it("accepte des number bruts (idempotent)", () => {
    const out = serializeProduct({ price: 1.99, vatRate: 5.5 });
    expect(out.price).toBe(1.99);
    expect(out.vatRate).toBe(5.5);
  });
});

describe("serializeStoreVat", () => {
  it("coerce vatRate, laisse le reste intact", () => {
    const out = serializeStoreVat({ id: "s1", name: "Wesley", vatRate: dec(20) });
    expect(out.vatRate).toBe(20);
    expect(out.name).toBe("Wesley");
  });
  it("retourne l'objet tel quel si pas de vatRate", () => {
    const s = { id: "s1", name: "Wesley" };
    expect(serializeStoreVat(s)).toBe(s); // meme reference (court-circuit)
  });
  it("preserve un vatRate null", () => {
    expect(serializeStoreVat({ vatRate: null }).vatRate).toBeNull();
  });
});

describe("serializeLabelJob", () => {
  it("coerce priceAtPrint de chaque item et recurse dans product", () => {
    const out = serializeLabelJob({
      id: "j1",
      items: [
        { id: "i1", priceAtPrint: dec(2.5), product: { id: "p1", price: dec(2.5), vatRate: dec(5.5) } },
        { id: "i2", priceAtPrint: dec(1), product: null },
      ],
    });
    const items = out.items as Array<Record<string, unknown>>;
    expect(items[0].priceAtPrint).toBe(2.5);
    expect((items[0].product as Record<string, unknown>).price).toBe(2.5);
    expect((items[0].product as Record<string, unknown>).vatRate).toBe(5.5);
    expect(items[1].priceAtPrint).toBe(1);
    expect(items[1].product).toBeNull();
  });
  it("retourne le job tel quel si items n'est pas un tableau", () => {
    const job = { id: "j1", items: undefined };
    expect(serializeLabelJob(job)).toBe(job);
  });
});
