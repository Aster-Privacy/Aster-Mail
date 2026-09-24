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

export const BIMI_MAX_UPLOAD_BYTES = 64 * 1024;

export const BIMI_STATES = [
  "off",
  "draft",
  "pending",
  "live",
  "attention",
  "external",
] as const;

export type BimiState = (typeof BIMI_STATES)[number];

export const BIMI_RECORD_STATUSES = [
  "missing",
  "published",
  "conflict",
  "external",
] as const;

export type BimiRecordStatus = (typeof BIMI_RECORD_STATUSES)[number];

export const BIMI_DMARC_STATUSES = [
  "ready",
  "missing",
  "invalid",
  "not_enforced",
  "partial",
  "subdomain_policy_none",
  "organization_not_enforced",
] as const;

export type BimiDmarcStatus = (typeof BIMI_DMARC_STATUSES)[number];

export const BIMI_LOGO_ERRORS = [
  "too_large",
  "not_utf8",
  "malformed",
  "doctype_entities",
  "not_svg",
  "empty",
  "missing_view_box",
  "not_square",
  "too_complex",
  "script_content",
  "external_reference",
  "invalid_reference",
  "raster_image",
  "text_not_outlined",
  "unsupported_style",
  "unsupported_element",
  "invalid_value",
] as const;

export type BimiLogoError = (typeof BIMI_LOGO_ERRORS)[number];

export const BIMI_ADJUSTMENTS = [
  "set_tiny_ps_profile",
  "added_title",
  "removed_size",
  "removed_position",
  "derived_view_box",
  "removed_doctype",
  "removed_metadata",
  "removed_editor_data",
  "converted_inline_styles",
  "removed_unsupported_attributes",
] as const;

export type BimiAdjustment = (typeof BIMI_ADJUSTMENTS)[number];

export interface BimiRecord {
  record_type: string;
  host: string;
  value: string;
}

export interface BimiView {
  state: BimiState;
  domain_active: boolean;
  managed_dns: boolean;
  logo_url: string | null;
  preview_png: string | null;
  record: BimiRecord | null;
  record_status: BimiRecordStatus | null;
  dmarc_status: BimiDmarcStatus | null;
  last_checked_at: string | null;
  last_live_at: string | null;
}

export interface BimiUploadResult {
  bimi: BimiView;
  adjustments: BimiAdjustment[];
}

interface RawBimiView {
  state?: unknown;
  domain_active?: unknown;
  managed_dns?: unknown;
  logo_url?: unknown;
  preview_png?: unknown;
  record?: unknown;
  record_status?: unknown;
  dmarc_status?: unknown;
  last_checked_at?: unknown;
  last_live_at?: unknown;
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function one_of<T extends string>(
  values: readonly T[],
  value: unknown,
): T | null {
  return typeof value === "string" &&
    (values as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function string_or_null(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parse_record(value: unknown): BimiRecord | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;

  if (
    typeof record.record_type !== "string" ||
    typeof record.host !== "string" ||
    typeof record.value !== "string"
  ) {
    return null;
  }

  return {
    record_type: record.record_type,
    host: record.host,
    value: record.value,
  };
}

export function parse_bimi_view(raw: RawBimiView): BimiView {
  const preview = string_or_null(raw.preview_png);
  const state =
    typeof raw.state === "string"
      ? (one_of(BIMI_STATES, raw.state) ?? "draft")
      : "off";

  return {
    state,
    domain_active: raw.domain_active === true,
    managed_dns: raw.managed_dns === true,
    logo_url: string_or_null(raw.logo_url),
    preview_png: preview && BASE64_PATTERN.test(preview) ? preview : null,
    record: parse_record(raw.record),
    record_status: one_of(BIMI_RECORD_STATUSES, raw.record_status),
    dmarc_status: one_of(BIMI_DMARC_STATUSES, raw.dmarc_status),
    last_checked_at: string_or_null(raw.last_checked_at),
    last_live_at: string_or_null(raw.last_live_at),
  };
}

export function parse_logo_errors(details: unknown): BimiLogoError[] {
  if (!details || typeof details !== "object") return ["malformed"];

  const errors = (details as Record<string, unknown>).errors;

  if (!Array.isArray(errors)) return ["malformed"];

  const parsed = Array.from(
    new Set(
      errors.map((code) => one_of(BIMI_LOGO_ERRORS, code) ?? "malformed"),
    ),
  );

  return parsed.length > 0 ? parsed : ["malformed"];
}

function parse_adjustments(value: unknown): BimiAdjustment[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((code) => one_of(BIMI_ADJUSTMENTS, code))
        .filter((code): code is BimiAdjustment => code !== null),
    ),
  );
}

function map_view(response: ApiResponse<RawBimiView>): ApiResponse<BimiView> {
  if (!response.data) return { ...response, data: undefined };

  return { ...response, data: parse_bimi_view(response.data) };
}

function bimi_path(domain_id: string, suffix = ""): string {
  return `/addresses/v1/domains/${encodeURIComponent(domain_id)}/bimi${suffix}`;
}

export async function get_bimi(
  domain_id: string,
): Promise<ApiResponse<BimiView>> {
  return map_view(
    await api_client.get<RawBimiView>(bimi_path(domain_id), {
      skip_cache: true,
    }),
  );
}

export async function upload_bimi_logo(
  domain_id: string,
  svg: string,
): Promise<ApiResponse<BimiUploadResult>> {
  const response = await api_client.put_raw<{
    bimi?: RawBimiView;
    adjustments?: unknown;
  }>(bimi_path(domain_id, "/logo"), svg, "image/svg+xml");

  if (!response.data?.bimi) return { ...response, data: undefined };

  return {
    ...response,
    data: {
      bimi: parse_bimi_view(response.data.bimi),
      adjustments: parse_adjustments(response.data.adjustments),
    },
  };
}

export async function publish_bimi(
  domain_id: string,
): Promise<ApiResponse<BimiView>> {
  return map_view(
    await api_client.post<RawBimiView>(bimi_path(domain_id, "/publish"), {}),
  );
}

export async function check_bimi(
  domain_id: string,
): Promise<ApiResponse<BimiView>> {
  return map_view(
    await api_client.post<RawBimiView>(bimi_path(domain_id, "/check"), {}),
  );
}

export async function delete_bimi(
  domain_id: string,
): Promise<ApiResponse<BimiView>> {
  return map_view(await api_client.delete<RawBimiView>(bimi_path(domain_id)));
}
