// On isole le routage de canaux : les dependances I/O du dispatcher sont mockees
// (prisma, push, email, sms, logger). isEmailConfigured/isSmsConfigured sont
// pilotables pour tester l'effet de la configuration.
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/logger", () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock("@/lib/notifications/push", () => ({ sendPushToUser: jest.fn() }));
jest.mock("@/lib/notifications/email", () => ({ sendEmail: jest.fn(), isEmailConfigured: jest.fn(() => true) }));
jest.mock("@/lib/notifications/sms", () => ({ sendSMS: jest.fn(), isSmsConfigured: jest.fn(() => true) }));

import { resolveChannels } from "@/lib/notifications/dispatcher";
import { isEmailConfigured } from "@/lib/notifications/email";
import { isSmsConfigured } from "@/lib/notifications/sms";

// M116 / notifications — routage des canaux selon priorite, defauts et
// preferences utilisateur (les prefs ecrasent les defauts, mais CRITICAL force).

const emailCfg = isEmailConfigured as jest.Mock;
const smsCfg = isSmsConfigured as jest.Mock;
const ALL_OFF = { push: false, email: false, sms: false };
const ALL_ON = { push: true, email: true, sms: true };

beforeEach(() => {
  emailCfg.mockReturnValue(true);
  smsCfg.mockReturnValue(true);
});

describe("resolveChannels", () => {
  it("NORMAL + defauts push/email -> PUSH + EMAIL", () => {
    expect(resolveChannels("NORMAL", { push: true, email: true, sms: false })).toEqual(["PUSH", "EMAIL"]);
  });

  it("LOW : pas d'email meme si opt-in (email reserve a NORMAL+)", () => {
    expect(resolveChannels("LOW", { push: true, email: true, sms: false })).toEqual(["PUSH"]);
  });

  it("CRITICAL force PUSH + EMAIL + SMS meme si tous les defauts sont off", () => {
    expect(resolveChannels("CRITICAL", ALL_OFF)).toEqual(["PUSH", "EMAIL", "SMS"]);
  });

  it("les preferences utilisateur ecrasent les defauts", () => {
    // defaut push:true mais pref push:false -> pas de PUSH (priorite non CRITICAL)
    expect(resolveChannels("NORMAL", { push: true, email: false, sms: false }, { push: false, email: false, sms: false }))
      .toEqual([]);
  });

  it("IMPORTANT avec opt-in SMS -> EMAIL + SMS (push non force)", () => {
    expect(resolveChannels("IMPORTANT", ALL_OFF, { push: false, email: false, sms: true }))
      .toEqual(["EMAIL", "SMS"]);
  });

  it("email non configure -> aucun EMAIL meme en CRITICAL", () => {
    emailCfg.mockReturnValue(false);
    expect(resolveChannels("CRITICAL", ALL_ON)).toEqual(["PUSH", "SMS"]);
  });

  it("sms non configure -> aucun SMS meme en CRITICAL", () => {
    smsCfg.mockReturnValue(false);
    expect(resolveChannels("CRITICAL", ALL_ON)).toEqual(["PUSH", "EMAIL"]);
  });
});
