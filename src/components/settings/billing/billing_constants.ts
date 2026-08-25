//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { TranslationKey } from "@/lib/i18n/types";

export const ADDON_BADGES: Record<string, "popular" | "best_value"> = {
  "100 GB": "popular",
  "10 TB": "best_value",
};

export const CRYPTO_PAYMENT_PROVIDERS = ["stripe_crypto", "crypto_native"];

export const CRYPTO_INVOICE_CHANGED_EVENT = "aster:crypto-invoice-changed";

export function notify_crypto_invoice_changed(): void {
  window.dispatchEvent(new CustomEvent(CRYPTO_INVOICE_CHANGED_EVENT));
}

const CRYPTO_RESUME_KEY = "aster_crypto_resume_selection";

export interface CryptoResumeSelection {
  invoice_id: string;
  plan_code: string;
  term_months: number;
  currency: string;
  chain: string;
}

interface StoredCryptoResume extends CryptoResumeSelection {
  resume: boolean;
}

function read_crypto_resume(): StoredCryptoResume | null {
  try {
    const raw = sessionStorage.getItem(CRYPTO_RESUME_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredCryptoResume>;

    if (
      typeof parsed?.invoice_id !== "string" ||
      typeof parsed?.plan_code !== "string" ||
      typeof parsed?.currency !== "string" ||
      typeof parsed?.chain !== "string" ||
      typeof parsed?.term_months !== "number"
    ) {
      return null;
    }

    return {
      invoice_id: parsed.invoice_id,
      plan_code: parsed.plan_code,
      term_months: parsed.term_months,
      currency: parsed.currency,
      chain: parsed.chain,
      resume: parsed.resume === true,
    };
  } catch {
    return null;
  }
}

export function remember_crypto_selection(
  selection: CryptoResumeSelection,
): void {
  try {
    sessionStorage.setItem(
      CRYPTO_RESUME_KEY,
      JSON.stringify({ ...selection, resume: false }),
    );
  } catch {
    return;
  }
}

export function request_crypto_resume(invoice_id: string): void {
  const stored = read_crypto_resume();

  if (!stored || stored.invoice_id !== invoice_id) return;

  try {
    sessionStorage.setItem(
      CRYPTO_RESUME_KEY,
      JSON.stringify({ ...stored, resume: true }),
    );
  } catch {
    return;
  }
}

export function forget_crypto_selection(invoice_id?: string): void {
  if (invoice_id) {
    const stored = read_crypto_resume();

    if (!stored || stored.invoice_id !== invoice_id) return;
  }

  try {
    sessionStorage.removeItem(CRYPTO_RESUME_KEY);
  } catch {
    return;
  }
}

export function take_crypto_resume(): CryptoResumeSelection | null {
  const stored = read_crypto_resume();

  if (!stored?.resume) return null;

  forget_crypto_selection();

  return {
    invoice_id: stored.invoice_id,
    plan_code: stored.plan_code,
    term_months: stored.term_months,
    currency: stored.currency,
    chain: stored.chain,
  };
}

export function is_crypto_provider(
  provider: string | null | undefined,
): boolean {
  return !!provider && CRYPTO_PAYMENT_PROVIDERS.includes(provider);
}

export interface PlanTier {
  id: string;
  name: string;
  description: string;
  monthly_cents: number;
  yearly_cents: number;
  biennial_cents: number;
  savings_cents: number;
  biennial_savings_cents: number;
  is_recommended?: boolean;
}

export interface FamilyPlanTier {
  id: string;
  name: string;
  description: string;
  max_members: number;
  storage_label: string;
  monthly_cents: number;
  yearly_cents: number;
  biennial_cents: number;
  is_recommended?: boolean;
}

export const FAMILY_PLAN_TIERS: FamilyPlanTier[] = [
  {
    id: "duo",
    name: "Duo",
    description: "Two members with separate accounts and shared storage.",
    max_members: 2,
    storage_label: "1 TB shared",
    monthly_cents: 1299,
    yearly_cents: 11999,
    biennial_cents: 20699,
  },
  {
    id: "family",
    name: "Family",
    description: "Up to six members, more storage, and premium features.",
    max_members: 6,
    storage_label: "3 TB shared",
    monthly_cents: 2699,
    yearly_cents: 26399,
    biennial_cents: 45499,
    is_recommended: true,
  },
];

export function family_yearly_savings_cents(tier: FamilyPlanTier): number {
  return Math.max(0, tier.monthly_cents * 12 - tier.yearly_cents);
}

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "star",
    name: "Star",
    description: "More storage, more aliases, and your first custom domains.",
    monthly_cents: 299,
    yearly_cents: 2899,
    biennial_cents: 4999,
    savings_cents: 689,
    biennial_savings_cents: 2177,
  },
  {
    id: "nova",
    name: "Nova",
    description: "More storage, custom domains, and unlimited aliases.",
    monthly_cents: 899,
    yearly_cents: 8699,
    biennial_cents: 14999,
    savings_cents: 2089,
    biennial_savings_cents: 6577,
    is_recommended: true,
  },
  {
    id: "supernova",
    name: "Supernova",
    description:
      "Maximum storage, unlimited everything, and dedicated support.",
    monthly_cents: 1799,
    yearly_cents: 17399,
    biennial_cents: 29999,
    savings_cents: 4189,
    biennial_savings_cents: 13177,
  },
];

export interface SupportedCurrency {
  code: string;
  label: string;
}

export const FALLBACK_CURRENCY_RATES: Record<string, number> = {
  usd: 1,
  eur: 0.86618,
  gbp: 0.73935,
  cad: 1.39255,
  aud: 1.41421,
  jpy: 159.09052,
  chf: 0.81126,
  sek: 9.5249,
  nok: 9.4725,
  dkk: 6.47536,
  pln: 3.72828,
  brl: 5.15574,
  mxn: 17.06141,
  inr: 95.33911,
};

export const CURRENCY_CONVERSION_MARGIN = 0.04;

export const CURRENCY_RATES: Record<string, number> = {
  ...FALLBACK_CURRENCY_RATES,
};

const currency_rate_listeners = new Set<() => void>();

export function subscribe_currency_rates(listener: () => void): () => void {
  currency_rate_listeners.add(listener);

  return () => {
    currency_rate_listeners.delete(listener);
  };
}

export function set_currency_rates(rates: Record<string, number>): void {
  let changed = false;

  for (const [code, rate] of Object.entries(rates)) {
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      continue;
    }

    const key = code.toLowerCase();

    if (CURRENCY_RATES[key] !== rate) {
      CURRENCY_RATES[key] = rate;
      changed = true;
    }
  }

  if (!changed) return;

  for (const listener of currency_rate_listeners) {
    listener();
  }
}

export function convert_cents(usd_cents: number, currency: string): number {
  const code = currency.toLowerCase();

  if (code === "usd") return Math.round(usd_cents);

  const rate = CURRENCY_RATES[code] ?? 1;

  return Math.round(usd_cents * rate * (1 + CURRENCY_CONVERSION_MARGIN));
}

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  { code: "usd", label: "USD ($)" },
  { code: "eur", label: "EUR (\u20AC)" },
  { code: "gbp", label: "GBP (\u00A3)" },
  { code: "cad", label: "CAD (C$)" },
  { code: "aud", label: "AUD (A$)" },
  { code: "jpy", label: "JPY (\u00A5)" },
  { code: "chf", label: "CHF (Fr)" },
  { code: "sek", label: "SEK (kr)" },
  { code: "nok", label: "NOK (kr)" },
  { code: "dkk", label: "DKK (kr)" },
  { code: "pln", label: "PLN (z\u0142)" },
  { code: "brl", label: "BRL (R$)" },
  { code: "mxn", label: "MXN ($)" },
  { code: "inr", label: "INR (\u20B9)" },
];

const LOCALE_CURRENCY_MAP: Record<string, string> = {
  en_us: "usd",
  en_gb: "gbp",
  en_au: "aud",
  en_ca: "cad",
  en_in: "inr",
  fr: "eur",
  de: "eur",
  es: "eur",
  it: "eur",
  nl: "eur",
  pt_br: "brl",
  pt: "eur",
  ja: "jpy",
  sv: "sek",
  nb: "nok",
  nn: "nok",
  da: "dkk",
  pl: "pln",
  es_mx: "mxn",
  hi: "inr",
};

export const CURRENCY_STORAGE_KEY = "aster_preferred_currency";

export function detect_currency_from_locale(): string {
  const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);

  if (stored && SUPPORTED_CURRENCIES.some((c) => c.code === stored)) {
    return stored;
  }

  const lang = navigator.language.toLowerCase().replace("-", "_");

  if (LOCALE_CURRENCY_MAP[lang]) return LOCALE_CURRENCY_MAP[lang];

  const short_lang = lang.split("_")[0];

  if (LOCALE_CURRENCY_MAP[short_lang]) return LOCALE_CURRENCY_MAP[short_lang];

  return "usd";
}

export interface FamilyPlanFeature {
  label_key: TranslationKey;
  on: boolean;
}

export const FAMILY_PLAN_DUO_FEATURES: FamilyPlanFeature[] = [
  { label_key: "settings.family_feat_members_2", on: true },
  { label_key: "settings.family_feat_everything_nova", on: true },
  { label_key: "settings.family_feat_pool_1tb", on: true },
  { label_key: "settings.plan_feat_e2ee", on: true },
  { label_key: "settings.plan_feat_zero_knowledge", on: true },
  { label_key: "settings.family_shared_aliases", on: true },
  { label_key: "settings.plan_feat_aliases_unlimited", on: true },
  { label_key: "settings.plan_feat_domains_30", on: true },
  { label_key: "settings.plan_feat_imap_smtp", on: true },
  { label_key: "settings.family_feat_invite", on: true },
  { label_key: "settings.plan_f_support_priority", on: true },
  { label_key: "settings.family_feat_domain_sharing", on: true },
  { label_key: "settings.family_feat_security_policies", on: true },
  { label_key: "settings.lockdown_title", on: true },
  { label_key: "settings.family_feat_admin_transfer", on: true },
  { label_key: "settings.family_feat_org_groups", on: false },
  { label_key: "settings.family_feat_activity_log", on: false },
  { label_key: "settings.family_feat_org_filters", on: false },
  { label_key: "settings.family_feat_retention", on: false },
  { label_key: "settings.family_feat_storage_controls", on: false },
];

export const FAMILY_PLAN_FAMILY_FEATURES: FamilyPlanFeature[] = [
  { label_key: "settings.family_feat_members_6", on: true },
  { label_key: "settings.family_feat_everything_supernova", on: true },
  { label_key: "settings.family_feat_pool_3tb", on: true },
  { label_key: "settings.plan_feat_e2ee", on: true },
  { label_key: "settings.plan_feat_zero_knowledge", on: true },
  { label_key: "settings.family_shared_aliases", on: true },
  { label_key: "settings.plan_feat_aliases_unlimited", on: true },
  { label_key: "settings.plan_feat_domains_30", on: true },
  { label_key: "settings.plan_feat_imap_smtp", on: true },
  { label_key: "settings.family_feat_invite", on: true },
  { label_key: "settings.plan_f_support_priority", on: true },
  { label_key: "settings.family_feat_org_groups", on: true },
  { label_key: "settings.family_feat_activity_log", on: true },
  { label_key: "settings.family_feat_org_filters", on: true },
  { label_key: "settings.family_feat_domain_sharing", on: true },
  { label_key: "settings.family_feat_security_policies", on: true },
  { label_key: "settings.lockdown_title", on: true },
  { label_key: "settings.family_feat_retention", on: true },
  { label_key: "settings.family_feat_storage_controls", on: true },
  { label_key: "settings.family_feat_admin_transfer", on: true },
];

export const FEATURE_MIN_PLAN: Record<string, string> = {
  has_advanced_aliases: "star",
  has_alias_avatars: "star",
  has_alias_rules: "star",
  has_alias_external_relay: "star",
  has_auto_delete_spam_trash: "star",
  has_auto_forwarding: "star",
  has_catch_all: "star",
  has_priority_support: "star",
  has_quiet_hours: "star",
  has_remove_branding: "star",
  has_vacation_reply: "star",
  max_alias_directories: "star",
  max_custom_categories: "star",
  has_contact_merge_wizard: "nova",
  has_custom_key_rotation: "nova",
  has_encrypted_export: "nova",
  has_password_protected_folders: "nova",
  has_dedicated_support: "supernova",
  has_early_access: "supernova",
  has_receipt_tracking: "supernova",
};

export function min_plan_for_feature(feature: string | null): PlanTier | null {
  if (!feature) return null;
  const code = FEATURE_MIN_PLAN[feature] ?? feature;

  return PLAN_TIERS.find((tier) => tier.id === code) ?? null;
}
