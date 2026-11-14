//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { get_email_username } from "@/lib/utils";
import { parse_address, type ParsedAddress } from "@/utils/reply_to";
import { decode_header_for_display } from "@/services/import/mime_utils";

export type ForwardingService = "simplelogin" | "addy";

export interface ForwardedAliasInfo {
  service: ForwardingService;
  original: ParsedAddress;
  reverse_alias: ParsedAddress;
}

export interface ForwardingDisplay {
  display_sender_name: string;
  display_sender_email: string;
  forwarding_service: ForwardingService;
}

interface HeaderLike {
  name: string;
  value: string;
}

const SIMPLELOGIN_DOMAINS = [
  "simplelogin.co",
  "simplelogin.com",
  "simplelogin.fr",
  "simplelogin.io",
  "slmail.me",
  "slmails.com",
  "silomails.com",
  "aleeas.com",
  "8alias.com",
  "8shield.net",
  "dralias.com",
];

const ADDY_DOMAINS = [
  "addy.io",
  "anonaddy.me",
  "anonaddy.com",
  "4wrd.cc",
  "mailer.me",
  "addymail.com",
];

const MAX_DISPLAY_NAME_LENGTH = 128;
const MAX_HEADER_VALUE_LENGTH = 998;
const NAME_CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

function domain_of(email: string): string {
  const at = email.lastIndexOf("@");

  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

function matches_forwarder(email: string, domains: string[]): boolean {
  const domain = domain_of(email);

  return domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

function find_header(
  raw_headers: HeaderLike[],
  name: string,
): string | undefined {
  const target = name.toLowerCase();
  const values = raw_headers
    .filter((h) => h.name.toLowerCase() === target)
    .map((h) => (typeof h.value === "string" ? h.value.trim() : ""))
    .filter(Boolean);

  if (values.length === 0) return undefined;
  if (values.some((v) => v !== values[0])) return undefined;
  if (values[0].length > MAX_HEADER_VALUE_LENGTH) return undefined;

  return values[0];
}

function clean_display_name(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const decoded = decode_header_for_display(name)
    .replace(NAME_CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .trim();

  if (!decoded) return undefined;

  return decoded.length > MAX_DISPLAY_NAME_LENGTH
    ? decoded.slice(0, MAX_DISPLAY_NAME_LENGTH).trim()
    : decoded;
}

export function parse_original_sender(
  value: string | undefined,
): ParsedAddress | undefined {
  if (!value) return undefined;
  const parsed = parse_address(value);

  if (!parsed?.email) return undefined;

  return { name: clean_display_name(parsed.name), email: parsed.email };
}

function addy_dmarc_failed(raw_headers: HeaderLike[]): boolean {
  const target = "x-anonaddy-authentication-results";

  return raw_headers.some(
    (h) =>
      h.name.toLowerCase() === target &&
      typeof h.value === "string" &&
      /\bdmarc\s*=\s*fail\b/i.test(h.value),
  );
}

function same_email(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function detect_forwarded_alias(
  raw_headers: HeaderLike[] | undefined,
  literal_from: { name?: string; email: string } | undefined,
): ForwardedAliasInfo | undefined {
  if (!raw_headers || raw_headers.length === 0) return undefined;
  if (!literal_from?.email) return undefined;

  const reverse_alias: ParsedAddress = {
    name: literal_from.name || undefined,
    email: literal_from.email,
  };

  const sl_type = find_header(raw_headers, "X-SimpleLogin-Type");
  const sl_original = find_header(raw_headers, "X-SimpleLogin-Original-From");
  const sl_envelope = find_header(raw_headers, "X-SimpleLogin-Envelope-From");

  if (
    (sl_original || sl_envelope) &&
    matches_forwarder(reverse_alias.email, SIMPLELOGIN_DOMAINS)
  ) {
    const is_forward = !sl_type || /forward/i.test(sl_type);

    if (is_forward) {
      const original =
        parse_original_sender(sl_original) ??
        parse_original_sender(sl_envelope);

      if (original?.email && !same_email(original.email, reverse_alias.email)) {
        return { service: "simplelogin", original, reverse_alias };
      }
    }
  }

  const addy_from_header = find_header(
    raw_headers,
    "X-AnonAddy-Original-From-Header",
  );
  const addy_original = find_header(raw_headers, "X-AnonAddy-Original-Sender");

  if (
    (addy_from_header || addy_original) &&
    matches_forwarder(reverse_alias.email, ADDY_DOMAINS) &&
    !addy_dmarc_failed(raw_headers)
  ) {
    const original =
      parse_original_sender(addy_from_header) ??
      parse_original_sender(addy_original);

    if (original?.email && !same_email(original.email, reverse_alias.email)) {
      return { service: "addy", original, reverse_alias };
    }
  }

  return undefined;
}

export interface ForwardingAuthResults {
  dkim_result?: string;
  dmarc_result?: string;
  sender_aligned?: boolean | null;
}

function auth_status(raw: string | undefined): string {
  const value = (raw ?? "").trim().toLowerCase();

  return value === "missing" ? "" : value;
}

export function is_forwarder_authenticated(
  auth: ForwardingAuthResults | undefined,
): boolean {
  const dkim = auth_status(auth?.dkim_result);
  const dmarc = auth_status(auth?.dmarc_result);

  if (auth?.sender_aligned === false) return false;
  if (auth?.sender_aligned === true) return true;
  if (!dkim && !dmarc) return true;
  if (dmarc === "pass") return true;
  if (dmarc && dmarc !== "none") return false;

  return dkim === "pass";
}

export function resolve_forwarding_display(
  from: { name?: string; email: string } | undefined,
  raw_headers: HeaderLike[] | undefined,
  auth?: ForwardingAuthResults,
): ForwardingDisplay | undefined {
  if (!is_forwarder_authenticated(auth)) return undefined;

  const literal = from?.email
    ? { name: from.name, email: from.email }
    : undefined;
  const forwarded = detect_forwarded_alias(raw_headers, literal);

  if (!forwarded) return undefined;

  return {
    display_sender_name:
      forwarded.original.name ||
      get_email_username(forwarded.original.email) ||
      forwarded.original.email,
    display_sender_email: forwarded.original.email,
    forwarding_service: forwarded.service,
  };
}

export interface SenderDisplayFields {
  sender_name?: string;
  sender_email?: string;
  display_sender_name?: string;
  display_sender_email?: string;
}

export function displayed_sender(item: SenderDisplayFields): {
  name: string;
  email: string;
} {
  if (item.display_sender_email) {
    return {
      name: item.display_sender_name || item.display_sender_email,
      email: item.display_sender_email,
    };
  }

  return {
    name: item.sender_name || "",
    email: item.sender_email || "",
  };
}

export function forwarding_address(item: SenderDisplayFields): string | null {
  const shown = item.display_sender_email?.trim();
  const literal = item.sender_email?.trim();

  if (!shown || !literal) return null;
  if (same_email(shown, literal)) return null;

  return literal;
}
