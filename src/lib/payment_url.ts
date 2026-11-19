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
export const PAYMENT_HOSTS: ReadonlySet<string> = new Set([
  "checkout.stripe.com",
  "billing.stripe.com",
]);

export const INVOICE_HOSTS: ReadonlySet<string> = new Set([
  "invoice.stripe.com",
]);

export const INVOICE_PDF_HOSTS: ReadonlySet<string> = new Set([
  "pay.stripe.com",
  "invoice.stripe.com",
]);

export function exact_host_https_url(
  url: string | null | undefined,
  hosts: ReadonlySet<string>,
): URL | null {
  if (!url) return null;
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password || parsed.port) return null;
  if (!hosts.has(parsed.hostname)) return null;

  return parsed;
}

function parse_payment_url(url: string): URL | null {
  return exact_host_https_url(url, PAYMENT_HOSTS);
}

export function is_https_payment_url(url: string): boolean {
  return parse_payment_url(url) !== null;
}

export function checked_payment_url(
  url: string | null | undefined,
): string | null {
  return exact_host_https_url(url, PAYMENT_HOSTS)?.toString() ?? null;
}

export function payment_url_or_throw(url: string): string {
  const parsed = parse_payment_url(url);

  if (!parsed) {
    throw new Error("Refusing to open an unexpected payment URL");
  }

  return parsed.toString();
}

export function checked_invoice_pdf_url(
  url: string | null | undefined,
): string | null {
  return exact_host_https_url(url, INVOICE_PDF_HOSTS)?.toString() ?? null;
}
