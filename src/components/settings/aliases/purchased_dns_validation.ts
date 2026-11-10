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
import type { TranslationKey } from "@/lib/i18n/types";
import type {
  PurchasedDnsRecord,
  PurchasedDnsRecordInput,
  PurchasedDnsRecordType,
} from "@/services/api/domains";

export const PURCHASED_DNS_TYPES: PurchasedDnsRecordType[] = [
  "A",
  "AAAA",
  "CNAME",
  "TXT",
  "MX",
  "SRV",
  "CAA",
];

export const PURCHASED_DNS_TTL_OPTIONS = [
  3600, 7200, 14400, 43200, 86400, 604800, 2592000,
];

export const MAX_TXT_LENGTH = 2048;
export const MAX_CAA_VALUE_LENGTH = 255;
const MAX_FQDN_LENGTH = 253;
const MAX_LABEL_LENGTH = 63;
const MAX_HOST_INPUT_LENGTH = 300;

const PROTECTED_HOSTS = [
  "_aster-verify",
  "_dmarc",
  "_smtp._tls",
  "_mta-sts",
  "mta-sts",
  "default._bimi",
  "_domainkey",
];

export interface PurchasedDnsDraft {
  type: PurchasedDnsRecordType;
  host: string;
  value: string;
  ttl: number;
  priority: string;
  weight: string;
  port: string;
  target: string;
  flags: string;
  tag: string;
}

export type DraftField = keyof Omit<PurchasedDnsDraft, "type" | "ttl">;

export interface DraftError {
  field: DraftField;
  key: TranslationKey;
}

export function empty_draft(
  type: PurchasedDnsRecordType = "A",
): PurchasedDnsDraft {
  return {
    type,
    host: "",
    value: "",
    ttl: 3600,
    priority: type === "MX" ? "10" : type === "SRV" ? "10" : "",
    weight: type === "SRV" ? "5" : "",
    port: "",
    target: "",
    flags: "0",
    tag: "issue",
  };
}

export function is_supported_type(raw: string): raw is PurchasedDnsRecordType {
  return (PURCHASED_DNS_TYPES as string[]).includes(raw);
}

export const MIN_TTL = 3600;
export const MAX_TTL = 2_592_000;

export function nearest_ttl(ttl: number): number {
  if (PURCHASED_DNS_TTL_OPTIONS.includes(ttl)) return ttl;
  if (Number.isInteger(ttl) && ttl >= MIN_TTL && ttl <= MAX_TTL) return ttl;

  return PURCHASED_DNS_TTL_OPTIONS.reduce((best, option) =>
    Math.abs(option - ttl) < Math.abs(best - ttl) ? option : best,
  );
}

export function draft_from_record(
  record: PurchasedDnsRecord,
): PurchasedDnsDraft | null {
  if (!is_supported_type(record.type)) return null;
  const base = empty_draft(record.type);

  return {
    ...base,
    host: record.host === "@" ? "" : record.host,
    value: record.type === "SRV" ? "" : record.value,
    ttl: nearest_ttl(record.ttl),
    priority:
      record.priority !== undefined ? String(record.priority) : base.priority,
    weight: record.weight !== undefined ? String(record.weight) : base.weight,
    port: record.port !== undefined ? String(record.port) : "",
    target: record.target ?? "",
    flags: record.flags !== undefined ? String(record.flags) : base.flags,
    tag: record.tag ?? base.tag,
  };
}

const MAIL_POLICY = /^v=(spf1|stsv1|tlsrptv1|dmarc1|dkim1|bimi1)(\s|;|$)/i;
const QUOTED_SEGMENTS = /^"[^"]*"(?:\s+"[^"]*")+$/;

function strip_quotes(value: string): string {
  const trimmed = value.trim();

  if (QUOTED_SEGMENTS.test(trimmed)) {
    return trimmed.split(/"\s+"/).join("").slice(1, -1);
  }
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function valid_label(label: string): boolean {
  return (
    label.length > 0 &&
    label.length <= MAX_LABEL_LENGTH &&
    !label.startsWith("-") &&
    !label.endsWith("-") &&
    /^[a-z0-9_-]+$/.test(label)
  );
}

export function normalize_host(raw: string, domain: string): string | null {
  if (raw.length > MAX_HOST_INPUT_LENGTH) return null;
  const trimmed = raw.trim();

  if (!/^[\x20-\x7e]*$/.test(trimmed)) return null;
  const lowered = trimmed.replace(/\.+$/, "").toLowerCase();

  if (trimmed.startsWith(".") || trimmed.includes("..")) return null;
  const apex = domain.toLowerCase().replace(/\.+$/, "");
  let host: string;

  if (lowered === "" || lowered === "@" || lowered === apex) {
    host = "";
  } else if (lowered.endsWith(`.${apex}`)) {
    host = lowered.slice(0, -(apex.length + 1));
  } else {
    host = lowered;
  }
  if (host === "") return "";
  if (`${host}.${apex}`.length > MAX_FQDN_LENGTH) return null;
  const labels = host.split(".");

  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === "*") {
      if (i !== 0) return null;
      continue;
    }
    if (!valid_label(labels[i])) return null;
  }

  return host;
}

export function is_protected_host(host: string): boolean {
  if (PROTECTED_HOSTS.includes(host)) return true;
  if (!host.endsWith("._domainkey")) return false;
  const selector = host.slice(0, -"._domainkey".length);

  return /^aster\d*$/.test(selector);
}

export function valid_target(raw: string): boolean {
  const trimmed = raw.trim().toLowerCase().replace(/\.$/, "");

  if (!trimmed || trimmed.length > MAX_FQDN_LENGTH) return false;
  const labels = trimmed.split(".");

  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1];

  if (/^\d+$/.test(tld) || tld.includes("_")) return false;

  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= MAX_LABEL_LENGTH &&
      !label.startsWith("-") &&
      !label.endsWith("-") &&
      /^[a-z0-9_-]+$/.test(label),
  );
}

export function parse_ipv4(raw: string): number[] | null {
  const parts = raw.trim().split(".");

  if (parts.length !== 4) return null;
  const octets: number[] = [];

  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith("0")) return null;
    const n = Number(part);

    if (n > 255) return null;
    octets.push(n);
  }

  return octets;
}

export function is_private_ipv4(o: number[]): boolean {
  const [a, b, c] = o;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

export function parse_ipv6(raw: string): number[] | null {
  const value = raw.trim().toLowerCase();

  if (!value || value.length > 45 || !/^[0-9a-f:.]+$/.test(value)) return null;
  const halves = value.split("::");

  if (halves.length > 2) return null;
  const expand = (part: string, is_last: boolean): number[] | null => {
    if (part === "") return [];
    const groups = part.split(":");
    const out: number[] = [];

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];

      if (group.includes(".")) {
        if (!is_last || i !== groups.length - 1) return null;
        const v4 = parse_ipv4(group);

        if (!v4) return null;
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      out.push(parseInt(group, 16));
    }

    return out;
  };
  const head = expand(halves[0], halves.length === 1);
  const tail = halves.length === 2 ? expand(halves[1], true) : [];

  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;

  if (missing < 1) return null;

  return [...head, ...new Array<number>(missing).fill(0), ...tail];
}

export function is_private_ipv6(g: number[]): boolean {
  const all_zero_prefix = g.slice(0, 7).every((x) => x === 0);

  if (all_zero_prefix && (g[7] === 0 || g[7] === 1)) return true;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return is_private_ipv4([g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff]);
  }
  if (g[0] === 0) return true;
  if ((g[0] & 0xfe00) === 0xfc00) return true;
  if ((g[0] & 0xffc0) === 0xfe80) return true;
  if ((g[0] & 0xffc0) === 0xfec0) return true;
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true;
  if (g[0] === 0x2002) return true;
  if (g[0] === 0x2001 && g[1] === 0) return true;
  if ((g[0] & 0xff00) === 0xff00) return true;
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;
  if (g[0] === 0x0064 && g[1] === 0xff9b) return true;

  return false;
}

function parse_u16(raw: string, min: number): number | null {
  const trimmed = raw.trim();

  if (!/^\d{1,5}$/.test(trimmed)) return null;
  const n = Number(trimmed);

  if (n < min || n > 65535) return null;

  return n;
}

export function validate_draft(
  draft: PurchasedDnsDraft,
  domain: string,
): DraftError | null {
  const host = normalize_host(draft.host, domain);

  if (host === null) {
    return { field: "host", key: "settings.purchased_dns_error_host" };
  }
  if (host !== "" && is_protected_host(host)) {
    return {
      field: "host",
      key: "settings.purchased_dns_error_protected_host",
    };
  }
  if (host === "" && (draft.type === "MX" || draft.type === "CNAME")) {
    return {
      field: "host",
      key:
        draft.type === "MX"
          ? "settings.purchased_dns_error_apex_mx"
          : "settings.purchased_dns_error_apex_cname",
    };
  }

  switch (draft.type) {
    case "A": {
      if (!draft.value.trim()) {
        return { field: "value", key: "settings.purchased_dns_error_required" };
      }
      const v4 = parse_ipv4(draft.value);

      if (!v4)
        return { field: "value", key: "settings.purchased_dns_error_ipv4" };
      if (is_private_ipv4(v4)) {
        return {
          field: "value",
          key: "settings.purchased_dns_error_private_ip",
        };
      }

      return null;
    }
    case "AAAA": {
      if (!draft.value.trim()) {
        return { field: "value", key: "settings.purchased_dns_error_required" };
      }
      const v6 = parse_ipv6(draft.value);

      if (!v6)
        return { field: "value", key: "settings.purchased_dns_error_ipv6" };
      if (is_private_ipv6(v6)) {
        return {
          field: "value",
          key: "settings.purchased_dns_error_private_ip",
        };
      }

      return null;
    }
    case "CNAME": {
      if (!draft.value.trim()) {
        return { field: "value", key: "settings.purchased_dns_error_required" };
      }
      if (!valid_target(draft.value)) {
        return { field: "value", key: "settings.purchased_dns_error_target" };
      }
      const target = draft.value.trim().toLowerCase().replace(/\.$/, "");
      const apex = domain.toLowerCase();

      if (target === (host ? `${host}.${apex}` : apex)) {
        return {
          field: "value",
          key: "settings.purchased_dns_error_cname_self",
        };
      }

      return null;
    }
    case "TXT": {
      const value = strip_quotes(draft.value);

      if (!value) {
        return { field: "value", key: "settings.purchased_dns_error_required" };
      }
      if (value.length > MAX_TXT_LENGTH) {
        return {
          field: "value",
          key: "settings.purchased_dns_error_txt_length",
        };
      }
      if (!/^[\x20-\x7e]+$/.test(value) || /["\\]/.test(value)) {
        return {
          field: "value",
          key: "settings.purchased_dns_error_txt_chars",
        };
      }
      if (host === "" && /^v=spf1(\s|$)/i.test(value)) {
        return { field: "value", key: "settings.purchased_dns_error_apex_spf" };
      }
      if (host === "*" && MAIL_POLICY.test(value)) {
        return {
          field: "host",
          key: "settings.purchased_dns_error_protected_host",
        };
      }

      return null;
    }
    case "MX": {
      if (!draft.value.trim()) {
        return { field: "value", key: "settings.purchased_dns_error_required" };
      }
      if (!valid_target(draft.value)) {
        return { field: "value", key: "settings.purchased_dns_error_target" };
      }
      if (parse_u16(draft.priority, 0) === null) {
        return {
          field: "priority",
          key: "settings.purchased_dns_error_priority",
        };
      }

      return null;
    }
    case "SRV": {
      const labels = host.split(".");

      if (
        labels.length < 2 ||
        !labels[0].startsWith("_") ||
        labels[0].length < 2 ||
        !["_tcp", "_udp", "_tls"].includes(labels[1])
      ) {
        return { field: "host", key: "settings.purchased_dns_error_srv_host" };
      }
      if (parse_u16(draft.priority, 0) === null) {
        return {
          field: "priority",
          key: "settings.purchased_dns_error_priority",
        };
      }
      if (parse_u16(draft.weight, 0) === null) {
        return { field: "weight", key: "settings.purchased_dns_error_weight" };
      }
      if (parse_u16(draft.port, 1) === null) {
        return { field: "port", key: "settings.purchased_dns_error_port" };
      }
      if (!draft.target.trim()) {
        return {
          field: "target",
          key: "settings.purchased_dns_error_required",
        };
      }
      if (!valid_target(draft.target)) {
        return { field: "target", key: "settings.purchased_dns_error_target" };
      }

      return null;
    }
    case "CAA": {
      if (draft.flags !== "0" && draft.flags !== "128") {
        return {
          field: "flags",
          key: "settings.purchased_dns_error_caa_flags",
        };
      }
      if (!["issue", "issuewild", "iodef"].includes(draft.tag)) {
        return { field: "tag", key: "settings.purchased_dns_error_caa_tag" };
      }
      const value = strip_quotes(draft.value);

      if (!value) {
        return { field: "value", key: "settings.purchased_dns_error_required" };
      }
      if (
        value.length > MAX_CAA_VALUE_LENGTH ||
        !/^[\x20-\x7e]+$/.test(value) ||
        /["\\]/.test(value)
      ) {
        return {
          field: "value",
          key: "settings.purchased_dns_error_caa_value",
        };
      }

      return null;
    }
  }
}

export function draft_to_input(
  draft: PurchasedDnsDraft,
  domain: string,
): PurchasedDnsRecordInput {
  const host = normalize_host(draft.host, domain) ?? draft.host.trim();
  const base: PurchasedDnsRecordInput = {
    type: draft.type,
    host: host === "" ? "@" : host,
    ttl: draft.ttl,
  };

  switch (draft.type) {
    case "A":
    case "AAAA":
    case "CNAME":
      return { ...base, value: draft.value.trim() };
    case "TXT":
      return { ...base, value: strip_quotes(draft.value) };
    case "MX":
      return {
        ...base,
        value: draft.value.trim(),
        priority: Number(draft.priority.trim()),
      };
    case "SRV":
      return {
        ...base,
        priority: Number(draft.priority.trim()),
        weight: Number(draft.weight.trim()),
        port: Number(draft.port.trim()),
        target: draft.target.trim(),
      };
    case "CAA":
      return {
        ...base,
        value: strip_quotes(draft.value),
        flags: Number(draft.flags),
        tag: draft.tag,
      };
  }
}

const SERVER_CODE_KEYS: Record<string, TranslationKey> = {
  DNS_INVALID_HOST: "settings.purchased_dns_error_host",
  DNS_INVALID_VALUE: "settings.purchased_dns_error_value",
  DNS_INVALID_IP: "settings.purchased_dns_error_ip",
  DNS_PRIVATE_IP: "settings.purchased_dns_error_private_ip",
  DNS_INVALID_TARGET: "settings.purchased_dns_error_target",
  DNS_TXT_TOO_LONG: "settings.purchased_dns_error_txt_length",
  DNS_INVALID_TXT: "settings.purchased_dns_error_txt_chars",
  DNS_INVALID_TTL: "settings.purchased_dns_error_ttl",
  DNS_INVALID_PRIORITY: "settings.purchased_dns_error_priority",
  DNS_INVALID_PORT: "settings.purchased_dns_error_port",
  DNS_INVALID_WEIGHT: "settings.purchased_dns_error_weight",
  DNS_INVALID_SRV_HOST: "settings.purchased_dns_error_srv_host",
  DNS_INVALID_CAA_FLAGS: "settings.purchased_dns_error_caa_flags",
  DNS_INVALID_CAA_TAG: "settings.purchased_dns_error_caa_tag",
  DNS_INVALID_CAA_VALUE: "settings.purchased_dns_error_caa_value",
  DNS_MISSING_FIELD: "settings.purchased_dns_error_required",
  DNS_PROTECTED_HOST: "settings.purchased_dns_error_protected_host",
  DNS_APEX_MX: "settings.purchased_dns_error_apex_mx",
  DNS_APEX_SPF: "settings.purchased_dns_error_apex_spf",
  DNS_APEX_CNAME: "settings.purchased_dns_error_apex_cname",
  DNS_CNAME_CONFLICT: "settings.purchased_dns_error_cname_conflict",
  DNS_CNAME_SELF: "settings.purchased_dns_error_cname_self",
  DNS_DUPLICATE: "settings.purchased_dns_error_duplicate",
  DNS_TOO_MANY_RECORDS: "settings.purchased_dns_error_too_many",
  DNS_PROTECTED_RECORD: "settings.purchased_dns_error_protected_record",
  DNS_TYPE_CHANGE: "settings.purchased_dns_error_type_change",
  DNS_LOCKED: "settings.purchased_dns_error_locked",
  DNS_REGISTRAR_BUSY: "settings.purchased_dns_error_busy",
};

export function server_error_key(
  server_code: string | undefined,
  status: number | undefined,
): TranslationKey {
  if (
    server_code &&
    Object.prototype.hasOwnProperty.call(SERVER_CODE_KEYS, server_code)
  ) {
    return SERVER_CODE_KEYS[server_code];
  }
  if (status === 404) return "settings.purchased_dns_error_not_found";
  if (status === 429) return "settings.purchased_dns_error_rate_limited";
  if (status === 503) return "settings.purchased_dns_error_busy";

  return "settings.purchased_dns_error_generic";
}

export function format_ttl_parts(ttl: number): {
  unit: "seconds" | "hours" | "days";
  count: number;
} {
  if (ttl > 0 && ttl % 86400 === 0) return { unit: "days", count: ttl / 86400 };
  if (ttl > 0 && ttl % 3600 === 0) return { unit: "hours", count: ttl / 3600 };

  return { unit: "seconds", count: ttl };
}

export function record_content(record: PurchasedDnsRecord): string {
  switch (record.type) {
    case "MX":
      return `${record.priority ?? 0} ${record.value}`;
    case "SRV":
      return record.target !== undefined
        ? `${record.priority ?? 0} ${record.weight ?? 0} ${record.port ?? 0} ${record.target}`
        : record.value;
    case "CAA":
      return record.tag !== undefined
        ? `${record.flags ?? 0} ${record.tag} "${record.value}"`
        : record.value;
    default:
      return record.value;
  }
}

export function load_error_key(status: number | undefined): TranslationKey {
  if (status === 429) return "settings.purchased_dns_error_rate_limited";

  return "settings.purchased_dns_load_failed";
}
