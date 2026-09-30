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
export const IMAGE_LOAD_RETRY_MAX_ATTEMPTS = 2;

export const IMAGE_LOAD_RETRY_BASE_DELAY_MS = 800;

export function image_load_retry_delay_ms(attempt: number): number {
  const step = Math.max(0, attempt);

  return IMAGE_LOAD_RETRY_BASE_DELAY_MS * Math.pow(2, step);
}

export function should_retry_image_load(attempt: number, src: string): boolean {
  if (attempt >= IMAGE_LOAD_RETRY_MAX_ATTEMPTS) return false;

  return /^https?:/i.test(src.trim());
}

export function parse_retry_attempt(value: string | null): number {
  if (!value) return 0;

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
