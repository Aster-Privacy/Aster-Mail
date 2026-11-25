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
import { api_client, type ApiResponse } from "./client";

export const MTA_STS_STATES = [
  "off",
  "locked",
  "retiring",
  "pending_dns",
  "pending_certificate",
  "live",
  "attention",
] as const;

export type MtaStsState = (typeof MTA_STS_STATES)[number];

export const MTA_STS_MODES = ["testing", "enforce"] as const;

export type MtaStsMode = (typeof MTA_STS_MODES)[number];

export const MTA_STS_RECORD_KINDS = [
  "policy_host",
  "policy_id",
  "tls_reporting",
] as const;

export type MtaStsRecordKind = (typeof MTA_STS_RECORD_KINDS)[number];

export const MTA_STS_RECORD_STATUSES = [
  "ok",
  "missing",
  "wrong",
  "stale",
  "multiple",
] as const;

export type MtaStsRecordStatus = (typeof MTA_STS_RECORD_STATUSES)[number];

export const MTA_STS_HOSTNAME_STATUSES = [
  "pending",
  "active",
  "failed",
] as const;

export type MtaStsHostnameStatus = (typeof MTA_STS_HOSTNAME_STATUSES)[number];

export interface MtaStsRecord {
  kind: MtaStsRecordKind;
  record_type: string;
  host: string;
  fqdn: string;
  value: string;
  status: MtaStsRecordStatus | null;
  optional: boolean;
}

export interface MtaStsView {
  available: boolean;
  entitled: boolean;
  state: MtaStsState;
  enabled: boolean;
  domain_active: boolean;
  mode: MtaStsMode | null;
  policy_url: string | null;
  preview: string | null;
  max_age: number | null;
  records: MtaStsRecord[];
  hostname_status: MtaStsHostnameStatus | null;
  retire_until: string | null;
  last_checked_at: string | null;
  managed_by_registrar: boolean;
}

type RawMtaStsView = Record<string, unknown>;

const MAX_RECORDS = 8;
const MAX_FIELD_LENGTH = 512;
const MAX_PREVIEW_LENGTH = 2048;

function one_of<T extends string>(
  values: readonly T[],
  value: unknown,
): T | null {
  return typeof value === "string" &&
    (values as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function bounded_string(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max
    ? value
    : null;
}

function parse_policy_url(value: unknown): string | null {
  const raw = bounded_string(value, MAX_FIELD_LENGTH);

  if (!raw) return null;
  try {
    const url = new URL(raw);

    return url.protocol === "https:" &&
      url.pathname === "/.well-known/mta-sts.txt" &&
      url.hostname.startsWith("mta-sts.")
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function parse_record(value: unknown): MtaStsRecord | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const kind = one_of(MTA_STS_RECORD_KINDS, record.kind);
  const record_type = bounded_string(record.record_type, 16);
  const host = bounded_string(record.host, MAX_FIELD_LENGTH);
  const fqdn = bounded_string(record.fqdn, MAX_FIELD_LENGTH);
  const record_value = bounded_string(record.value, MAX_FIELD_LENGTH);

  if (!kind || !record_type || !host || !fqdn || !record_value) return null;

  return {
    kind,
    record_type,
    host,
    fqdn,
    value: record_value,
    status: one_of(MTA_STS_RECORD_STATUSES, record.status),
    optional: record.optional === true,
  };
}

function parse_max_age(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

export function parse_mta_sts_view(raw: RawMtaStsView): MtaStsView {
  const records = Array.isArray(raw.records)
    ? raw.records
        .slice(0, MAX_RECORDS)
        .map(parse_record)
        .filter((record): record is MtaStsRecord => record !== null)
    : [];

  return {
    available: raw.available === true,
    entitled: raw.entitled === true,
    state: one_of(MTA_STS_STATES, raw.state) ?? "off",
    enabled: raw.enabled === true,
    domain_active: raw.domain_active === true,
    mode: one_of(MTA_STS_MODES, raw.mode),
    policy_url: parse_policy_url(raw.policy_url),
    preview: bounded_string(raw.preview, MAX_PREVIEW_LENGTH),
    max_age: parse_max_age(raw.max_age),
    records,
    hostname_status: one_of(MTA_STS_HOSTNAME_STATUSES, raw.hostname_status),
    retire_until: bounded_string(raw.retire_until, 64),
    last_checked_at: bounded_string(raw.last_checked_at, 64),
    managed_by_registrar: raw.managed_by_registrar === true,
  };
}

export function normalize_mta_sts_state(
  value: string | null | undefined,
): MtaStsState {
  return one_of(MTA_STS_STATES, value) ?? "off";
}

function map_view(
  response: ApiResponse<RawMtaStsView>,
): ApiResponse<MtaStsView> {
  if (!response.data || typeof response.data !== "object") {
    return { ...response, data: undefined };
  }

  return { ...response, data: parse_mta_sts_view(response.data) };
}

function mta_sts_path(domain_id: string, suffix = ""): string {
  return `/addresses/v1/domains/${encodeURIComponent(domain_id)}/mta-sts${suffix}`;
}

export async function get_mta_sts(
  domain_id: string,
): Promise<ApiResponse<MtaStsView>> {
  return map_view(
    await api_client.get<RawMtaStsView>(mta_sts_path(domain_id), {
      skip_cache: true,
    }),
  );
}

export async function enable_mta_sts(
  domain_id: string,
  mode: MtaStsMode,
): Promise<ApiResponse<MtaStsView>> {
  return map_view(
    await api_client.put<RawMtaStsView>(mta_sts_path(domain_id), { mode }),
  );
}

export async function disable_mta_sts(
  domain_id: string,
): Promise<ApiResponse<MtaStsView>> {
  return map_view(
    await api_client.delete<RawMtaStsView>(mta_sts_path(domain_id)),
  );
}

export async function check_mta_sts(
  domain_id: string,
): Promise<ApiResponse<MtaStsView>> {
  return map_view(
    await api_client.post<RawMtaStsView>(mta_sts_path(domain_id, "/check"), {}),
  );
}
