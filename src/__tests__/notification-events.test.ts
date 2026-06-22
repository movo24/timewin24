import { EVENT_CONFIG } from "@/lib/notifications/events";

// M116 / notifications — catalogue de configuration des evenements. Garde-fou :
// chaque evenement doit etre entierement configure (titre, priorite, canaux,
// templates) ; les templates ne doivent jamais planter.
// NB : la completude vis-a-vis de l'enum Prisma NotificationEventType est deja
// garantie par tsc (EVENT_CONFIG est typee Record<NotificationEventType, ...>).

const keys = Object.keys(EVENT_CONFIG) as (keyof typeof EVENT_CONFIG)[];
const VALID_PRIORITIES = ["LOW", "NORMAL", "IMPORTANT", "CRITICAL"];

describe("EVENT_CONFIG", () => {
  it("definit au moins le catalogue d'evenements connus", () => {
    expect(keys.length).toBeGreaterThanOrEqual(9);
  });

  it.each(keys)("%s : config complete et coherente", (key) => {
    const cfg = EVENT_CONFIG[key];
    expect(VALID_PRIORITIES).toContain(cfg.defaultPriority);
    expect(cfg.titleTemplate.length).toBeGreaterThan(0);
    expect(typeof cfg.bodyTemplate).toBe("function");
    expect(typeof cfg.urlBuilder).toBe("function");
    // au moins un canal actif par defaut
    const ch = cfg.defaultChannels;
    expect(ch.push || ch.email || ch.sms).toBe(true);
  });

  it.each(keys)("%s : templates robustes meme avec un contexte vide", (key) => {
    const cfg = EVENT_CONFIG[key];
    expect(typeof cfg.bodyTemplate({})).toBe("string");
    expect(cfg.bodyTemplate({}).length).toBeGreaterThan(0);
    expect(cfg.urlBuilder({}).startsWith("/")).toBe(true);
  });

  it("injecte les valeurs de contexte dans le corps", () => {
    const body = EVENT_CONFIG.PLANNING_PUBLISHED.bodyTemplate({ weekStart: "2026-06-22", storeName: "Wesley" });
    expect(body).toContain("2026-06-22");
    expect(body).toContain("Wesley");
  });

  it("les evenements CRITICAL activent le SMS", () => {
    for (const key of keys) {
      if (EVENT_CONFIG[key].defaultPriority === "CRITICAL") {
        expect(EVENT_CONFIG[key].defaultChannels.sms).toBe(true);
      }
    }
  });
});
