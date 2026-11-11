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
import {
  safe_session_get,
  safe_session_remove,
  safe_session_set,
} from "@/lib/safe_storage";

const COMMITMENT_KEY = "aster_link_device_commitment";
const COMMITMENT_PARAM = "v";
const COMMITMENT_TTL_MS = 30 * 60 * 1000;
const FINGERPRINT_HEX_LENGTH = 20;
const FINGERPRINT_PATTERN = /^[0-9A-F]{4}( [0-9A-F]{4}){4}$/;

interface stored_commitment {
  fingerprint: string;
  stored_at: number;
}

function grouped(hex: string): string {
  return hex.match(/.{1,4}/g)?.join(" ") ?? "";
}

export function format_fingerprint_input(raw: string): string {
  return grouped(
    raw
      .replace(/[^0-9a-fA-F]/g, "")
      .toUpperCase()
      .slice(0, FINGERPRINT_HEX_LENGTH),
  );
}

export function normalize_fingerprint(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 64) return null;
  if (/[^0-9a-fA-F\s-]/.test(raw)) return null;

  const hex = raw.replace(/[\s-]/g, "").toUpperCase();

  if (hex.length !== FINGERPRINT_HEX_LENGTH) return null;

  return grouped(hex);
}

export function is_device_fingerprint(value: unknown): value is string {
  return typeof value === "string" && FINGERPRINT_PATTERN.test(value);
}

export function link_device_url(base_url: string, fingerprint: string): string {
  const normalized = normalize_fingerprint(fingerprint);

  if (!normalized) throw new Error("fingerprint_required");

  return `${base_url}#${COMMITMENT_PARAM}=${normalized.replace(/ /g, "")}`;
}

export function capture_link_commitment(): void {
  if (typeof window === "undefined") return;

  const hash = window.location.hash;

  if (hash.length < 2) return;
  if (!/\/link-device\/?$/.test(window.location.pathname)) return;

  const fingerprint = normalize_fingerprint(
    new URLSearchParams(hash.slice(1)).get(COMMITMENT_PARAM),
  );

  try {
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  } catch {
    window.location.hash = "";
  }

  if (!fingerprint) return;

  const value: stored_commitment = { fingerprint, stored_at: Date.now() };

  safe_session_set(COMMITMENT_KEY, JSON.stringify(value));
}

export function read_link_commitment(): string | null {
  const raw = safe_session_get(COMMITMENT_KEY);

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<stored_commitment> | null;
    const age = Date.now() - Number(parsed?.stored_at);

    if (
      parsed &&
      is_device_fingerprint(parsed.fingerprint) &&
      age >= 0 &&
      age <= COMMITMENT_TTL_MS
    ) {
      return parsed.fingerprint;
    }
  } catch {
    safe_session_remove(COMMITMENT_KEY);

    return null;
  }

  safe_session_remove(COMMITMENT_KEY);

  return null;
}

export function clear_link_commitment(): void {
  safe_session_remove(COMMITMENT_KEY);
}
