import {
  NotificationEventType,
  NotificationPriority,
} from "@/generated/prisma/client";

export interface EventConfig {
  defaultPriority: NotificationPriority;
  titleTemplate: string;
  bodyTemplate: (ctx: Record<string, string>) => string;
  urlBuilder: (ctx: Record<string, string>) => string;
  /** Default channels per priority — user preferences override */
  defaultChannels: {
    push: boolean;
    email: boolean;
    sms: boolean;
  };
}

export const EVENT_CONFIG: Record<NotificationEventType, EventConfig> = {
  PLANNING_PUBLISHED: {
    defaultPriority: "NORMAL",
    titleTemplate: "Nouveau planning publié",
    bodyTemplate: (ctx) =>
      `Le planning de la semaine du ${ctx.weekStart || "—"} est disponible${ctx.storeName ? ` pour ${ctx.storeName}` : ""}.`,
    urlBuilder: () => "/mon-planning",
    defaultChannels: { push: true, email: true, sms: false },
  },
  PLANNING_MODIFIED: {
    defaultPriority: "IMPORTANT",
    titleTemplate: "Planning modifié",
    bodyTemplate: (ctx) =>
      `Votre planning a été modifié${ctx.storeName ? ` pour ${ctx.storeName}` : ""}. Vérifiez vos horaires.`,
    urlBuilder: () => "/mon-planning",
    defaultChannels: { push: true, email: true, sms: false },
  },
  NEW_MESSAGE: {
    defaultPriority: "NORMAL",
    titleTemplate: "Nouveau message",
    bodyTemplate: (ctx) =>
      ctx.senderName
        ? `${ctx.senderName} : ${ctx.subject || "Nouveau message"}`
        : ctx.subject || "Vous avez reçu un nouveau message.",
    urlBuilder: () => "/mes-messages",
    defaultChannels: { push: true, email: true, sms: false },
  },
  ABSENCE_REPORTED: {
    defaultPriority: "NORMAL",
    titleTemplate: "Absence signalée",
    bodyTemplate: (ctx) =>
      `${ctx.employeeName || "Un employé"} a déclaré une absence${ctx.dates ? ` du ${ctx.dates}` : ""}.`,
    urlBuilder: () => "/absences",
    defaultChannels: { push: true, email: true, sms: false },
  },
  SHIFT_AVAILABLE: {
    defaultPriority: "NORMAL",
    titleTemplate: "Shift disponible",
    bodyTemplate: (ctx) =>
      `Un shift est disponible${ctx.date ? ` le ${ctx.date}` : ""}${ctx.storeName ? ` à ${ctx.storeName}` : ""}.`,
    urlBuilder: () => "/marche-shifts",
    defaultChannels: { push: true, email: true, sms: false },
  },
  REPLACEMENT_NEEDED: {
    defaultPriority: "IMPORTANT",
    titleTemplate: "Remplacement à prendre",
    bodyTemplate: (ctx) =>
      `Un remplacement est nécessaire${ctx.date ? ` le ${ctx.date}` : ""}${ctx.storeName ? ` à ${ctx.storeName}` : ""}.`,
    urlBuilder: () => "/mes-remplacements",
    defaultChannels: { push: true, email: true, sms: false },
  },
  STORE_NOT_OPENED: {
    defaultPriority: "CRITICAL",
    titleTemplate: "Magasin non ouvert",
    bodyTemplate: (ctx) =>
      `${ctx.storeName || "Un magasin"} n'a pas été ouvert à l'heure${ctx.time ? ` (${ctx.time})` : ""}.`,
    urlBuilder: () => "/alertes",
    defaultChannels: { push: true, email: true, sms: true },
  },
  MANAGER_ALERT: {
    defaultPriority: "CRITICAL",
    titleTemplate: "Alerte manager",
    bodyTemplate: (ctx) => ctx.title || "Une alerte nécessite votre attention.",
    urlBuilder: () => "/alertes",
    defaultChannels: { push: true, email: true, sms: true },
  },
  BROADCAST: {
    defaultPriority: "LOW",
    titleTemplate: "Annonce",
    bodyTemplate: (ctx) => ctx.title || "Nouvelle annonce.",
    urlBuilder: () => "/annonces",
    defaultChannels: { push: true, email: false, sms: false },
  },
};
