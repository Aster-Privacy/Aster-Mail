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
export const CID_RETRY_MAX_ATTEMPTS = 3;

export const CID_RETRY_BASE_DELAY_MS = 1500;

export function cid_retry_delay_ms(attempt: number): number {
  const step = Math.max(0, attempt);

  return CID_RETRY_BASE_DELAY_MS * Math.pow(2, step);
}

export function should_retry_cid(attempt: number): boolean {
  return attempt < CID_RETRY_MAX_ATTEMPTS;
}
