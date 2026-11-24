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
import { public_web_url } from "@/lib/public_origin";
import {
  domain_for_display,
  domain_to_ascii,
  domain_unicode,
  registrable_domain,
} from "@/lib/sender_trust";

export type LinkSignal =
  "not_encrypted" | "lookalike" | "text_mismatch" | "ip_address";

export type LinkKind = "web" | "mailto" | "blocked";

export interface LinkUrlParts {
  lead: string;
  host: string;
  rest: string;
}

export interface LinkUrlPiece {
  text: string;
  strong: boolean;
}

export interface LinkUrlChunk {
  pieces: LinkUrlPiece[];
  long: boolean;
}

export interface LinkDestination {
  kind: LinkKind;
  href: string;
  scheme: string;
  host: string;
  host_display: string;
  host_unicode: string;
  site: string;
  site_display: string;
  is_ip: boolean;
  mail_address: string;
  shown_site: string;
  parts: LinkUrlParts;
  chunks: LinkUrlChunk[];
  signals: LinkSignal[];
}

const OPENABLE_SCHEMES = new Set(["http:", "https:", "mailto:"]);
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const TEXT_URL_PATTERN =
  /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:www\.)?([^\s/?#@:]+\.[^\s/?#@:]+)(?::\d+)?(?:[/?#]\S*)?$/i;
const MAX_TEXT_LENGTH = 2048;
const PATH_BREAK_CHARS = new Set(["/", "?", "&", "=", "#"]);
const PORT_PATTERN = /:\d+$/;
export const LONG_CHUNK_LENGTH = 30;

function parse_href(href: string): URL | null {
  const trimmed = href.trim();

  if (!trimmed) return null;

  try {
    const candidate = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;

    return new URL(public_web_url(candidate));
  } catch {
    return null;
  }
}

export function is_ip_host(host: string): boolean {
  return host.startsWith("[") || IPV4_PATTERN.test(host);
}

export function site_of_host(host: string): string {
  const bare = host.toLowerCase().replace(/\.+$/, "");

  if (!bare || is_ip_host(bare) || !bare.includes(".")) return bare;

  return registrable_domain(bare);
}

function split_parts(parsed: URL): LinkUrlParts {
  const href = parsed.href;
  const host = parsed.host;
  const scheme_end = parsed.protocol.length + 2;
  const index = host ? href.indexOf(host, scheme_end) : -1;

  if (index < 0) return { lead: "", host: "", rest: href };

  return {
    lead: href.slice(0, index),
    host,
    rest: href.slice(index + host.length),
  };
}

function make_chunk(pieces: LinkUrlPiece[]): LinkUrlChunk {
  const kept = pieces.filter((piece) => piece.text.length > 0);
  const length = kept.reduce((total, piece) => total + piece.text.length, 0);

  return { pieces: kept, long: length > LONG_CHUNK_LENGTH };
}

function split_path(text: string): string[] {
  const segments: string[] = [];
  let current = "";

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    current += char;
    if (
      PATH_BREAK_CHARS.has(char) &&
      !PATH_BREAK_CHARS.has(text[index + 1] ?? "")
    ) {
      segments.push(current);
      current = "";
    }
  }
  if (current) segments.push(current);

  return segments;
}

function split_host(host: string): string[] {
  if (host.startsWith("[")) return [host];

  const labels = host.split(".");

  return labels.map((label, index) =>
    index < labels.length - 1 ? `${label}.` : label,
  );
}

export function url_chunks(parts: LinkUrlParts): LinkUrlChunk[] {
  const port = PORT_PATTERN.exec(parts.host)?.[0] ?? "";
  const host_name = parts.host.slice(0, parts.host.length - port.length);
  const chunks: LinkUrlChunk[] = [];

  if (host_name) {
    const labels = split_host(host_name);

    labels.forEach((label, index) => {
      const pieces: LinkUrlPiece[] = [];

      if (index === 0) pieces.push({ text: parts.lead, strong: false });
      pieces.push({ text: label, strong: true });
      if (index === labels.length - 1) {
        pieces.push({ text: port, strong: false });
      }
      chunks.push(make_chunk(pieces));
    });
  } else if (parts.lead) {
    chunks.push(make_chunk([{ text: parts.lead, strong: false }]));
  }

  for (const segment of split_path(parts.rest)) {
    chunks.push(make_chunk([{ text: segment, strong: false }]));
  }

  return chunks;
}

export function site_in_link_text(text: string | null | undefined): string {
  if (!text) return "";

  const clean = text
    .slice(0, MAX_TEXT_LENGTH)
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[<([{"'\u201c\u2018]+|[>)\]}"'\u201d\u2019.,;:!?]+$/g, "");
  const match = TEXT_URL_PATTERN.exec(clean);

  if (!match) return "";

  const raw_host = match[1].toLowerCase().replace(/\.+$/, "");

  if (IPV4_PATTERN.test(raw_host)) return raw_host;

  const ascii = domain_to_ascii(raw_host);

  if (!ascii) return "";

  const tld = ascii.split(".").pop() ?? "";

  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) return "";

  return site_of_host(ascii);
}

function mail_address_of(parsed: URL): string {
  const first = parsed.pathname.split(",")[0] ?? "";

  try {
    return decodeURIComponent(first).trim();
  } catch {
    return first.trim();
  }
}

function blocked_destination(href: string, scheme: string): LinkDestination {
  return {
    kind: "blocked",
    href,
    scheme,
    host: "",
    host_display: "",
    host_unicode: "",
    site: "",
    site_display: "",
    is_ip: false,
    mail_address: "",
    shown_site: "",
    parts: { lead: "", host: "", rest: href },
    chunks: url_chunks({ lead: "", host: "", rest: href }),
    signals: [],
  };
}

function scheme_of_raw(href: string): string {
  const match = /^\s*([a-z][a-z0-9+.-]*):/i.exec(href);

  return match ? `${match[1].toLowerCase()}:` : "";
}

export function describe_link(
  href: string,
  link_text?: string | null,
): LinkDestination {
  const parsed = parse_href(href);

  if (!parsed) return blocked_destination(href, scheme_of_raw(href));
  if (!OPENABLE_SCHEMES.has(parsed.protocol)) {
    return blocked_destination(href, parsed.protocol);
  }

  if (parsed.protocol === "mailto:") {
    const address = mail_address_of(parsed);
    const domain = address.includes("@")
      ? address.slice(address.lastIndexOf("@") + 1).toLowerCase()
      : "";
    const ascii_domain = domain_to_ascii(domain) || domain;

    return {
      kind: "mailto",
      href: parsed.href,
      scheme: parsed.protocol,
      host: ascii_domain,
      host_display: ascii_domain ? domain_for_display(ascii_domain) : "",
      host_unicode: ascii_domain ? domain_unicode(ascii_domain) : "",
      site: ascii_domain,
      site_display: ascii_domain ? domain_for_display(ascii_domain) : "",
      is_ip: false,
      mail_address: address,
      shown_site: "",
      parts: { lead: "", host: "", rest: parsed.href },
      chunks: url_chunks({ lead: "", host: "", rest: parsed.href }),
      signals: [],
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/\.+$/, "");

  if (!host) return blocked_destination(href, parsed.protocol);

  const is_ip = is_ip_host(host);
  const site = site_of_host(host);
  const host_display = is_ip ? host : domain_for_display(host);
  const host_unicode = is_ip ? host : domain_unicode(host);
  const site_display = is_ip ? host : domain_for_display(site);
  const signals: LinkSignal[] = [];
  const parts = split_parts(parsed);

  if (!is_ip && host_unicode !== host && host_display !== host_unicode) {
    signals.push("lookalike");
  }

  const shown_site = site_in_link_text(link_text);
  const mismatch = shown_site !== "" && shown_site !== site;

  if (mismatch) signals.push("text_mismatch");
  if (is_ip) signals.push("ip_address");
  if (parsed.protocol === "http:") signals.push("not_encrypted");

  return {
    kind: "web",
    href: parsed.href,
    scheme: parsed.protocol,
    host,
    host_display,
    host_unicode,
    site,
    site_display,
    is_ip,
    mail_address: "",
    shown_site: mismatch ? domain_for_display(shown_site) : "",
    parts,
    chunks: url_chunks(parts),
    signals,
  };
}
