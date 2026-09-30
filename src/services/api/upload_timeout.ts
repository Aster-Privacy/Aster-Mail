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
import { get_effective_timeout } from "@/services/routing/routing_provider";

const BASE_TIMEOUT_MS = 30_000;
const MIN_UPLOAD_BYTES_PER_SECOND = 64 * 1024;
const MAX_UPLOAD_TIMEOUT_MS = 15 * 60_000;

export function upload_timeout_ms(payload_bytes: number): number {
  const transfer_ms = Math.ceil(
    (Math.max(0, payload_bytes) / MIN_UPLOAD_BYTES_PER_SECOND) * 1000,
  );

  return Math.min(
    MAX_UPLOAD_TIMEOUT_MS,
    Math.max(
      get_effective_timeout(BASE_TIMEOUT_MS),
      BASE_TIMEOUT_MS + transfer_ms,
    ),
  );
}
