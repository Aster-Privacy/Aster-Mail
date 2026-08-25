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

import type { StripeElementLocale } from "@stripe/stripe-js";

import { app_locale } from "@/utils/date_format";

const STRIPE_LOCALE_BY_APP_LOCALE: Record<string, StripeElementLocale> = {
  en: "en",
  es: "es",
  fr: "fr",
  de: "de",
  it: "it",
  pt: "pt",
  "zh-CN": "zh",
  ja: "ja",
  ko: "ko",
  ar: "ar",
  ru: "ru",
  nl: "nl",
  pl: "pl",
  tr: "tr",
};

export function stripe_locale(): StripeElementLocale {
  const locale = app_locale();

  if (!locale) return "auto";

  return (
    STRIPE_LOCALE_BY_APP_LOCALE[locale] ??
    STRIPE_LOCALE_BY_APP_LOCALE[locale.split("-")[0]] ??
    "auto"
  );
}
