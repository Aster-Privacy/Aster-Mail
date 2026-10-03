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
import type {
  EmailAuthResults,
  EmailAuthStatus,
} from "@/utils/email_authentication";

import { normalize_email_auth_status } from "@/utils/email_authentication";
import { get_root_domain } from "@/lib/utils";
import { extract_reply_to } from "@/utils/reply_to";

export interface RawHeader {
  name: string;
  value: string;
}

export type HeaderHelpTopic =
  | "received"
  | "return_path"
  | "authentication_results"
  | "received_spf"
  | "dkim_signature"
  | "arc"
  | "message_id"
  | "list_unsubscribe"
  | "spam";

export interface DisplayHeader {
  name: string;
  value: string;
  has_valid_name: boolean;
  help?: HeaderHelpTopic;
  highlight_results: boolean;
}

export interface ValueSegment {
  text: string;
  status?: EmailAuthStatus;
}

const HEADER_NAME = /^[\x21-\x39\x3b-\x7e]+$/;
const MAX_SHOWN_DOMAIN = 253;
const MAX_LIST_ID = 200;
const DOMAIN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const RESULT_TOKEN =
  /\b((?:spf|dkim|dmarc|arc|bimi|compauth|auth)=)(pass|fail|hardfail|softfail|neutral|none|temperror|permerror|policy)\b/gi;
const LEADING_RESULT =
  /^(\s*)(pass|fail|softfail|neutral|none|temperror|permerror)\b/i;

export function format_raw_headers(
  raw_headers: RawHeader[] | undefined | null,
): string | null {
  if (!raw_headers || raw_headers.length === 0) return null;

  return raw_headers.map((h) => `${h.name}: ${h.value}`).join("\n");
}

function find_values(raw_headers: RawHeader[] | undefined, name: string) {
  const wanted = name.toLowerCase();

  return (raw_headers ?? [])
    .filter((h) => h.name.trim().toLowerCase() === wanted)
    .map((h) => h.value);
}

function first_value(raw_headers: RawHeader[] | undefined, name: string) {
  return find_values(raw_headers, name)[0];
}

export function header_help_topic(name: string): HeaderHelpTopic | undefined {
  const lower = name.trim().toLowerCase();

  if (lower === "received") return "received";
  if (lower === "return-path") return "return_path";
  if (lower === "authentication-results") return "authentication_results";
  if (lower === "received-spf") return "received_spf";
  if (lower === "dkim-signature") return "dkim_signature";
  if (lower.startsWith("arc-")) return "arc";
  if (lower === "message-id") return "message_id";
  if (lower === "list-unsubscribe") return "list_unsubscribe";
  if (lower.startsWith("x-spam-")) return "spam";

  return undefined;
}

export function to_display_headers(
  raw_headers: RawHeader[] | undefined | null,
): DisplayHeader[] {
  const helped = new Set<HeaderHelpTopic>();

  return (raw_headers ?? []).map((header) => {
    const name = header.name;
    const has_valid_name = HEADER_NAME.test(name);
    const topic = has_valid_name ? header_help_topic(name) : undefined;
    const help = topic && !helped.has(topic) ? topic : undefined;
    const lower = name.toLowerCase();

    if (help) helped.add(help);

    return {
      name,
      value: header.value.replace(/\r\n?/g, "\n"),
      has_valid_name,
      help,
      highlight_results:
        has_valid_name &&
        (lower === "authentication-results" ||
          lower === "arc-authentication-results" ||
          lower === "received-spf"),
    };
  });
}

export function segment_auth_value(
  name: string,
  value: string,
): ValueSegment[] {
  const segments: ValueSegment[] = [];
  let rest = value;

  if (name.trim().toLowerCase() === "received-spf") {
    const lead = rest.match(LEADING_RESULT);

    if (lead) {
      if (lead[1]) segments.push({ text: lead[1] });
      segments.push({
        text: lead[2],
        status: normalize_email_auth_status(lead[2]).status,
      });
      rest = rest.slice(lead[0].length);
    }
  }

  let last = 0;

  for (const match of rest.matchAll(RESULT_TOKEN)) {
    const start = match.index ?? 0;
    const result_start = start + match[1].length;

    if (result_start > last) {
      segments.push({ text: rest.slice(last, result_start) });
    }
    segments.push({
      text: match[2],
      status: normalize_email_auth_status(match[2]).status,
    });
    last = result_start + match[2].length;
  }
  if (last < rest.length) segments.push({ text: rest.slice(last) });

  return segments;
}

function clean_domain(raw: string | undefined | null): string | null {
  const domain = (raw ?? "").trim().replace(/\.$/, "").toLowerCase();

  if (!domain || domain.length > MAX_SHOWN_DOMAIN || !DOMAIN.test(domain)) {
    return null;
  }

  return domain;
}

function domain_of(address: string | undefined | null): string | null {
  const value = (address ?? "").trim();
  const at = value.lastIndexOf("@");

  return at > 0 ? clean_domain(value.slice(at + 1)) : null;
}

export function get_message_id(
  raw_headers: RawHeader[] | undefined,
): string | null {
  const value = first_value(raw_headers, "message-id")?.trim();

  if (!value) return null;

  return value.startsWith("<") ? value : `<${value}>`;
}

export function get_mailed_by(
  raw_headers: RawHeader[] | undefined,
  results: EmailAuthResults,
): string | null {
  if (normalize_email_auth_status(results.spf_result).status !== "pass") {
    return null;
  }
  const value = first_value(raw_headers, "return-path");

  if (!value) return null;
  const inner = value.match(/<([^<>]*)>/)?.[1] ?? value;

  return domain_of(inner);
}

export function get_dkim_domains(raw_headers: RawHeader[] | undefined) {
  const domains: string[] = [];

  for (const value of find_values(raw_headers, "dkim-signature")) {
    const tag = value
      .replace(/\s+/g, "")
      .split(";")
      .find((part) => part.toLowerCase().startsWith("d="));
    const domain = clean_domain(tag?.slice(2));

    if (domain && !domains.includes(domain)) domains.push(domain);
  }

  return domains;
}

export function get_signed_by(
  raw_headers: RawHeader[] | undefined,
  results: EmailAuthResults,
  sender_email: string,
): string | null {
  if (normalize_email_auth_status(results.dkim_result).status !== "pass") {
    return null;
  }
  const domains = get_dkim_domains(raw_headers);

  if (domains.length === 1) return domains[0];
  if (normalize_email_auth_status(results.dmarc_result).status !== "pass") {
    return null;
  }
  const from = domain_of(sender_email);

  if (!from) return null;
  const aligned = domains.filter(
    (domain) => get_root_domain(domain) === get_root_domain(from),
  );

  return aligned.length === 1 ? aligned[0] : null;
}

export interface ReplyToInfo {
  email: string;
  name?: string;
  other_domain: boolean;
}

export function get_reply_to(
  raw_headers: RawHeader[] | undefined,
  sender_email: string,
): ReplyToInfo | null {
  const parsed = extract_reply_to(raw_headers);

  if (!parsed) return null;
  if (parsed.email.toLowerCase() === sender_email.trim().toLowerCase()) {
    return null;
  }
  const reply_domain = domain_of(parsed.email);
  const from_domain = domain_of(sender_email);

  return {
    email: parsed.email,
    name: parsed.name,
    other_domain:
      !reply_domain ||
      !from_domain ||
      get_root_domain(reply_domain) !== get_root_domain(from_domain),
  };
}

export interface MailingListInfo {
  id: string;
  has_unsubscribe: boolean;
}

export function get_mailing_list(
  raw_headers: RawHeader[] | undefined,
): MailingListInfo | null {
  const value = first_value(raw_headers, "list-id");

  if (!value) return null;
  const inner = value.match(/<([^<>]+)>/)?.[1] ?? value;
  const id = Array.from(inner.replace(/\s+/g, " ").trim())
    .slice(0, MAX_LIST_ID)
    .join("");

  if (!id) return null;

  return {
    id,
    has_unsubscribe: find_values(raw_headers, "list-unsubscribe").some(
      (v) => v.trim().length > 0,
    ),
  };
}
