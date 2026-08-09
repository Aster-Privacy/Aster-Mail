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
import type { } from "@/lib/i18n/types";
import { ATTACHMENT_MIME_MAP, SIZE_RANGE_REGEX, SIZE_REGEX } from "./types";

export function parse_size_value(value: string): number | null {
  const match = value.toLowerCase().match(SIZE_REGEX);

  if (!match) {
    return null;
  }

  const num = parseFloat(match[1]);

  if (isNaN(num) || num < 0) {
    return null;
  }

  const unit = (match[2] || "b").toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  const multiplier = multipliers[unit] || 1;

  const result = Math.floor(num * multiplier);

  if (result > Number.MAX_SAFE_INTEGER) {
    return Number.MAX_SAFE_INTEGER;
  }

  return result;
}

export function parse_size_range(
  value: string,
): { min: number; max: number } | null {
  const match = value.toLowerCase().match(SIZE_RANGE_REGEX);

  if (!match) {
    return null;
  }

  const min_num = parseFloat(match[1]);
  const min_unit = (match[2] || "b").toLowerCase();
  const max_num = parseFloat(match[3]);
  const max_unit = (match[4] || "b").toLowerCase();

  if (isNaN(min_num) || isNaN(max_num) || min_num < 0 || max_num < 0) {
    return null;
  }

  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };

  const min = Math.floor(min_num * (multipliers[min_unit] || 1));
  const max = Math.floor(max_num * (multipliers[max_unit] || 1));

  if (min > max) {
    return { min: max, max: min };
  }

  return { min, max };
}

export function format_size_for_display(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);

  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function get_attachment_mimes(type: string): string[] {
  return ATTACHMENT_MIME_MAP[type.toLowerCase()] || [];
}

