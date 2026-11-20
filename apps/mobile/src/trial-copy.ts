/**
 * Free-trial wording for the paywall (App Review 3.1.2: the trial length and
 * the price that follows must be clear). Pure; the numbers come from StoreKit.
 * The yearly saving is never called "free".
 */
import type { Lang } from "./i18n/lang.ts";

export type TrialLang = Lang;
export type TrialPlan = {
  period: "week" | "month" | "year" | "";
  displayPrice: string;
  trialDays: number;
};

export function hasTrial(plan: TrialPlan | null | undefined): boolean {
  return !!plan && Number.isFinite(plan.trialDays) && plan.trialDays > 0;
}

type Wording = {
  /** week, month, year as they follow the price ("₺999,99/ay"). */
  units: readonly [week: string, month: string, year: string];
  note: (days: number, price: string) => string;
  renewal: (days: number, price: string) => string;
};

const WORDING: Readonly<Record<Lang, Wording>> = {
  tr: {
    units: ["hafta", "ay", "yıl"],
    note: (d, p) => `${d} gün ücretsiz, sonra ${p}`,
    renewal: (d, p) =>
      `Deneme ${d} gün sürer; bitmeden iptal etmezsen ${p} ücretle otomatik yenilenir.`,
  },
  en: {
    units: ["week", "month", "year"],
    note: (d, p) => `${d}-day free trial, then ${p}`,
    renewal: (d, p) =>
      `The trial lasts ${d} days; unless you cancel before it ends, it renews automatically at ${p}.`,
  },
  de: {
    units: ["Woche", "Monat", "Jahr"],
    note: (d, p) => `${d} ${d === 1 ? "Tag" : "Tage"} kostenlos, danach ${p}`,
    renewal: (d, p) =>
      `Die Testphase dauert ${d} ${d === 1 ? "Tag" : "Tage"}; wenn du nicht vor Ablauf kündigst, verlängert sie sich automatisch für ${p}.`,
  },
  es: {
    units: ["semana", "mes", "año"],
    note: (d, p) => `${d} ${d === 1 ? "día" : "días"} gratis, después ${p}`,
    renewal: (d, p) =>
      `La prueba dura ${d} ${d === 1 ? "día" : "días"}; si no cancelas antes de que termine, se renueva automáticamente por ${p}.`,
  },
  fr: {
    units: ["semaine", "mois", "an"],
    note: (d, p) => `${d} ${d === 1 ? "jour" : "jours"} gratuit${d === 1 ? "" : "s"}, puis ${p}`,
    renewal: (d, p) =>
      `L'essai dure ${d} ${d === 1 ? "jour" : "jours"} ; si tu ne résilies pas avant la fin, il se renouvelle automatiquement à ${p}.`,
  },
  "pt-BR": {
    units: ["semana", "mês", "ano"],
    note: (d, p) => `${d} ${d === 1 ? "dia" : "dias"} grátis, depois ${p}`,
    renewal: (d, p) =>
      `O teste dura ${d} ${d === 1 ? "dia" : "dias"}; se você não cancelar antes do fim, ele renova automaticamente por ${p}.`,
  },
  it: {
    units: ["settimana", "mese", "anno"],
    note: (d, p) => `${d} ${d === 1 ? "giorno" : "giorni"} gratis, poi ${p}`,
    renewal: (d, p) =>
      `La prova dura ${d} ${d === 1 ? "giorno" : "giorni"}; se non annulli prima della fine, si rinnova automaticamente a ${p}.`,
  },
};

function priceWithPeriod(plan: TrialPlan, lang: TrialLang): string {
  const units = WORDING[lang].units;
  // English keeps the store's own period word ("week", "month", "year").
  const unit =
    lang === "en"
      ? plan.period
      : plan.period === "week"
        ? units[0]
        : plan.period === "month"
          ? units[1]
          : plan.period === "year"
            ? units[2]
            : "";
  return plan.displayPrice + (unit ? "/" + unit : "");
}

/** "3 gün ücretsiz, sonra ₺999,99/ay"; null when there is no trial. */
export function trialNote(
  plan: TrialPlan | null | undefined,
  lang: TrialLang,
): string | null {
  if (!plan || !hasTrial(plan)) return null;
  const days = Math.floor(plan.trialDays);
  return WORDING[lang].note(days, priceWithPeriod(plan, lang));
}

/** The sentence under the button when a trial applies; null otherwise. */
export function trialRenewal(
  plan: TrialPlan | null | undefined,
  lang: TrialLang,
): string | null {
  if (!plan || !hasTrial(plan)) return null;
  const days = Math.floor(plan.trialDays);
  return WORDING[lang].renewal(days, priceWithPeriod(plan, lang));
}
