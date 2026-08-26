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
const FIELDS = ["utm_source", "utm_medium", "utm_campaign"] as const;
const MAX_LENGTH = 64;
const VALID_SHAPE = /^[A-Za-z0-9._-]+$/;

export interface AcquisitionSource {
  acquisition_source?: string;
  acquisition_medium?: string;
  acquisition_campaign?: string;
}

let memory_source: AcquisitionSource = {};

export function normalize_label(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const collapsed = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (!collapsed || collapsed.length > MAX_LENGTH) return null;
  if (!VALID_SHAPE.test(collapsed)) return null;
  return collapsed;
}

export function privacy_signal_opt_out(): boolean {
  if (typeof navigator === "undefined") return false;
  try {
    const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl;
    if (gpc === true) return true;
    if (navigator.doNotTrack === "1") return true;
  } catch {
    void 0;
  }
  return false;
}

export function capture_source(search: string): AcquisitionSource {
  if (privacy_signal_opt_out()) {
    memory_source = {};
    return {};
  }
  const params = new URLSearchParams(search);
  const captured: AcquisitionSource = {};
  for (const field of FIELDS) {
    const value = normalize_label(params.get(field));
    if (value) {
      const key = field.replace(
        "utm_",
        "acquisition_",
      ) as keyof AcquisitionSource;
      captured[key] = value;
    }
  }
  if (Object.keys(captured).length > 0) memory_source = captured;
  return memory_source;
}

export function read_source(): AcquisitionSource {
  if (privacy_signal_opt_out()) return {};
  return memory_source;
}

export function clear_source(): void {
  memory_source = {};
}

export function current_source(): AcquisitionSource {
  if (typeof window === "undefined") return {};
  return capture_source(window.location.search);
}
