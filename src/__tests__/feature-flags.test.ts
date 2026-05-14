/**
 * Tests pour le module feature-flags.
 *
 * Note : le module lit process.env au moment de l'import. Les tests doivent
 * donc utiliser `jest.isolateModules` pour réimporter avec un env modifié.
 */

describe("Feature flags — variants", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    // Reset env entre chaque test
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    // Nettoyer toutes les ENABLE_* + TIMEWIN_VARIANT
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("ENABLE_") || k === "TIMEWIN_VARIANT") {
        delete process.env[k];
      }
    }
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("variante par défaut = fullstack (pas de breakage prod)", async () => {
    const { VARIANT, FLAGS } = await import("@/lib/feature-flags");
    expect(VARIANT).toBe("fullstack");
    expect(FLAGS.pos).toBe(true);
    expect(FLAGS.ai).toBe(true);
    expect(FLAGS.inventory).toBe(true);
  });

  it("TIMEWIN_VARIANT=appstore → POS/AI/Inventory désactivés", async () => {
    process.env.TIMEWIN_VARIANT = "appstore";
    const { FLAGS } = await import("@/lib/feature-flags");
    expect(FLAGS.pos).toBe(false);
    expect(FLAGS.ai).toBe(false);
    expect(FLAGS.inventory).toBe(false);
    expect(FLAGS.products).toBe(false);
    expect(FLAGS.labels).toBe(false);
    expect(FLAGS.integrations).toBe(false);
  });

  it("appstore → cœur SaaS reste activé", async () => {
    process.env.TIMEWIN_VARIANT = "appstore";
    const { FLAGS } = await import("@/lib/feature-flags");
    expect(FLAGS.planning).toBe(true);
    expect(FLAGS.employees).toBe(true);
    expect(FLAGS.stores).toBe(true);
    expect(FLAGS.shifts).toBe(true);
    expect(FLAGS.clockIn).toBe(true);
    expect(FLAGS.notify).toBe(true);
    expect(FLAGS.onboarding).toBe(true);
    expect(FLAGS.accountDeletion).toBe(true);
  });

  it("override : ENABLE_POS=true sur appstore → POS activé quand même", async () => {
    process.env.TIMEWIN_VARIANT = "appstore";
    process.env.ENABLE_POS = "true";
    const { FLAGS } = await import("@/lib/feature-flags");
    expect(FLAGS.pos).toBe(true);
  });

  it("override : ENABLE_AI=false sur fullstack → AI désactivé", async () => {
    process.env.TIMEWIN_VARIANT = "fullstack";
    process.env.ENABLE_AI = "false";
    const { FLAGS } = await import("@/lib/feature-flags");
    expect(FLAGS.ai).toBe(false);
  });

  it("formats acceptés : true/false, 1/0, yes/no, on/off", async () => {
    process.env.TIMEWIN_VARIANT = "appstore";
    process.env.ENABLE_POS = "true";
    process.env.ENABLE_INVENTORY = "1";
    process.env.ENABLE_PRODUCTS = "yes";
    process.env.ENABLE_LABELS = "on";
    process.env.ENABLE_AI = "false";
    process.env.ENABLE_COSTS = "0";
    process.env.ENABLE_PERFORMANCE = "no";
    process.env.ENABLE_BROADCAST = "off";
    const { FLAGS } = await import("@/lib/feature-flags");
    expect(FLAGS.pos).toBe(true);
    expect(FLAGS.inventory).toBe(true);
    expect(FLAGS.products).toBe(true);
    expect(FLAGS.labels).toBe(true);
    expect(FLAGS.ai).toBe(false);
    expect(FLAGS.costs).toBe(false);
    expect(FLAGS.performance).toBe(false);
    expect(FLAGS.broadcast).toBe(false);
  });

  it("valeurs invalides ignorées → fallback DEFAULT", async () => {
    process.env.TIMEWIN_VARIANT = "fullstack";
    process.env.ENABLE_AI = "maybe";
    process.env.ENABLE_POS = "";
    const { FLAGS } = await import("@/lib/feature-flags");
    expect(FLAGS.ai).toBe(true); // default fullstack
    expect(FLAGS.pos).toBe(true);
  });

  it("variant invalide → fallback fullstack", async () => {
    process.env.TIMEWIN_VARIANT = "wesleymode";
    const { VARIANT, FLAGS } = await import("@/lib/feature-flags");
    expect(VARIANT).toBe("fullstack");
    expect(FLAGS.pos).toBe(true);
  });
});

describe("requireFlag helper", () => {
  beforeEach(() => {
    jest.resetModules();
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("ENABLE_") || k === "TIMEWIN_VARIANT") {
        delete process.env[k];
      }
    }
  });

  it("retourne null si flag activé", async () => {
    process.env.TIMEWIN_VARIANT = "fullstack";
    const { requireFlag } = await import("@/lib/feature-flags");
    expect(requireFlag("pos")).toBeNull();
  });

  it("retourne Response 404 si flag désactivé", async () => {
    process.env.TIMEWIN_VARIANT = "appstore";
    const { requireFlag } = await import("@/lib/feature-flags");
    const result = requireFlag("pos");
    expect(result).not.toBeNull();
    expect(result?.status).toBe(404);
  });

  it("Response 404 a un body JSON exploitable", async () => {
    process.env.TIMEWIN_VARIANT = "appstore";
    const { requireFlag } = await import("@/lib/feature-flags");
    const result = requireFlag("ai");
    expect(result?.headers.get("Content-Type")).toContain("application/json");
    const body = await result?.json();
    expect(body?.error).toContain("not available");
  });
});

describe("isFlagEnabled helper", () => {
  beforeEach(() => {
    jest.resetModules();
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("ENABLE_") || k === "TIMEWIN_VARIANT") {
        delete process.env[k];
      }
    }
  });

  it("true si activé", async () => {
    process.env.TIMEWIN_VARIANT = "fullstack";
    const { isFlagEnabled } = await import("@/lib/feature-flags");
    expect(isFlagEnabled("pos")).toBe(true);
  });

  it("false si désactivé", async () => {
    process.env.TIMEWIN_VARIANT = "appstore";
    const { isFlagEnabled } = await import("@/lib/feature-flags");
    expect(isFlagEnabled("pos")).toBe(false);
  });
});
