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

const DEV_SUPPORT_ORIGINS = ["http://localhost:5175", "http://localhost:5176"];
const PROD_SUPPORT_ORIGINS = ["https://support.astermail.org"];
const RETURN_PARAM = "return_to";
const STORAGE_KEY = "aster_support_return";
const MAX_AGE_MS = 15 * 60 * 1000;
const MAX_URL_LENGTH = 2048;

interface stored_return {
  url: string;
  at: number;
}

export function support_site_origins(): string[] {
  const configured =
    (import.meta.env.VITE_ACCOUNT_LINK_ORIGINS as string | undefined) ?? "";
  const list = configured
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== window.location.origin);

  if (list.length > 0) return list;

  return import.meta.env.DEV ? DEV_SUPPORT_ORIGINS : PROD_SUPPORT_ORIGINS;
}

export function safe_support_return(raw: string | null): string | null {
  if (!raw || raw.length > MAX_URL_LENGTH) return null;

  try {
    const url = new URL(raw);

    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    if (!support_site_origins().includes(url.origin)) return null;

    return url.href;
  } catch {
    return null;
  }
}

export function capture_support_return(): void {
  try {
    const params = new URLSearchParams(window.location.search);

    if (!params.has(RETURN_PARAM)) return;

    const url = safe_support_return(params.get(RETURN_PARAM));

    if (!url) {
      safe_session_remove(STORAGE_KEY);

      return;
    }

    const record: stored_return = { url, at: Date.now() };

    safe_session_set(STORAGE_KEY, JSON.stringify(record));
  } catch {
    return;
  }
}

export function take_support_return(): string | null {
  const raw = safe_session_get(STORAGE_KEY);

  if (!raw) return null;

  safe_session_remove(STORAGE_KEY);

  try {
    const record = JSON.parse(raw) as Partial<stored_return>;

    if (typeof record.url !== "string" || typeof record.at !== "number") {
      return null;
    }
    if (Date.now() - record.at > MAX_AGE_MS || record.at > Date.now()) {
      return null;
    }

    return safe_support_return(record.url);
  } catch {
    return null;
  }
}
