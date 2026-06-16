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
export const ADDON_BADGES: Record<string, "popular" | "best_value"> = {
  "100 GB": "popular",
  "10 TB": "best_value",
};

export interface PlanTier {
  id: string;
  name: string;
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
  max_members: number;
  storage_label: string;
  monthly_cents: number;
  yearly_cents: number;
  savings_label: string;
  is_recommended?: boolean;
}

export const FAMILY_PLAN_TIERS: FamilyPlanTier[] = [
  {
    id: "duo",
    name: "Duo",
    max_members: 2,
    storage_label: "1 TB shared",
    monthly_cents: 1299,
    yearly_cents: 11999,
    savings_label: "Save $35.89/yr",
  },
  {
    id: "family",
    name: "Family",
    max_members: 6,
    storage_label: "3 TB shared",
    monthly_cents: 2699,
    yearly_cents: 26399,
    savings_label: "Save $59.89/yr",
    is_recommended: true,
  },
];

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "star",
    name: "Star",
    monthly_cents: 299,
    yearly_cents: 2899,
    biennial_cents: 4999,
    savings_cents: 689,
    biennial_savings_cents: 2177,
  },
  {
    id: "nova",
    name: "Nova",
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

export const CURRENCY_RATES: Record<string, number> = {
  usd: 1,
  eur: 0.92,
  gbp: 0.79,
  cad: 1.36,
  aud: 1.52,
  jpy: 151,
  chf: 0.88,
  sek: 10.4,
  nok: 10.7,
  dkk: 6.85,
  pln: 3.95,
  brl: 5.05,
  mxn: 17.1,
  inr: 83.3,
};

export function convert_cents(usd_cents: number, currency: string): number {
  const rate = CURRENCY_RATES[currency.toLowerCase()] ?? 1;

  return Math.round(usd_cents * rate);
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
  label: string;
  on: boolean;
}

export const FAMILY_PLAN_DUO_FEATURES: FamilyPlanFeature[] = [
  { label: "2 members, separate accounts", on: true },
  { label: "1 TB shared pool, privately allocated per member", on: true },
  { label: "End-to-end encryption", on: true },
  { label: "Zero-access architecture", on: true },
  { label: "Shared family aliases", on: true },
  { label: "Unlimited email aliases", on: true },
  { label: "30 custom domains", on: true },
  { label: "Use your favorite mail app (via Aster Bridge)", on: true },
  { label: "Invite by link or email", on: true },
  { label: "Priority support", on: true },
  { label: "Domain sharing across members", on: true },
  { label: "Security policies (2FA enforcement)", on: true },
  { label: "Lockdown Mode", on: true },
  { label: "Admin role transfer", on: true },
  { label: "Org groups & distribution lists", on: false },
  { label: "Activity log & audit trail", on: false },
  { label: "Org-wide email filters", on: false },
  { label: "Data retention policies", on: false },
  { label: "Per-member storage controls", on: false },
];

export const FAMILY_PLAN_FAMILY_FEATURES: FamilyPlanFeature[] = [
  { label: "Up to 6 members, separate accounts", on: true },
  { label: "3 TB shared pool, privately allocated per member", on: true },
  { label: "End-to-end encryption", on: true },
  { label: "Zero-access architecture", on: true },
  { label: "Shared family aliases", on: true },
  { label: "Unlimited email aliases", on: true },
  { label: "30 custom domains", on: true },
  { label: "Use your favorite mail app (via Aster Bridge)", on: true },
  { label: "Invite by link or email", on: true },
  { label: "Priority support", on: true },
  { label: "Org groups & distribution lists", on: true },
  { label: "Activity log & audit trail", on: true },
  { label: "Org-wide email filters", on: true },
  { label: "Domain sharing across members", on: true },
  { label: "Security policies (2FA enforcement)", on: true },
  { label: "Lockdown Mode", on: true },
  { label: "Data retention policies", on: true },
  { label: "Per-member storage controls", on: true },
  { label: "Admin role transfer", on: true },
];
