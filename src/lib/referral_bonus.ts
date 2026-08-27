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
export const REFERRAL_BONUS_BYTES_PER_REFERRAL = 1073741824;
export const REFERRAL_BONUS_BYTES_MAX = 10737418240;

export function referral_count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

export function referral_bytes(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export function bonus_bytes_per_referral(value: unknown): number {
  return referral_bytes(value, REFERRAL_BONUS_BYTES_PER_REFERRAL);
}

export function bonus_bytes_max(value: unknown): number {
  return referral_bytes(value, REFERRAL_BONUS_BYTES_MAX);
}
