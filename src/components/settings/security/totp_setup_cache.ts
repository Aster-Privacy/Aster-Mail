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
import type { TotpSetupInitiateResponse } from "@/services/api/totp";

const SETUP_CACHE_TTL_MS = 9 * 60 * 1000;

let cached_setup_data: TotpSetupInitiateResponse | null = null;
let cached_setup_at = 0;

export function clear_totp_setup_cache(): void {
  cached_setup_data = null;
  cached_setup_at = 0;
}

export function store_totp_setup(data: TotpSetupInitiateResponse): void {
  cached_setup_data = data;
  cached_setup_at = Date.now();
}

export function read_cached_totp_setup(): TotpSetupInitiateResponse | null {
  if (!cached_setup_data) return null;
  if (Date.now() - cached_setup_at > SETUP_CACHE_TTL_MS) {
    clear_totp_setup_cache();

    return null;
  }

  return cached_setup_data;
}
