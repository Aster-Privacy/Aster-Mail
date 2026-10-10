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
import type { ApiResponse } from "./client";

export const BULK_REQUEST_LIMIT = 100;

export async function send_in_chunks<T, R>(
  items: T[],
  chunk_size: number,
  send: (chunk: T[]) => Promise<ApiResponse<R>>,
  merge: (total: R, next: R) => R,
): Promise<ApiResponse<R>> {
  if (items.length <= chunk_size) return send(items);

  let merged: R | undefined;

  for (let i = 0; i < items.length; i += chunk_size) {
    const response = await send(items.slice(i, i + chunk_size));

    if (response.error || response.data === undefined) return response;

    merged = merged === undefined ? response.data : merge(merged, response.data);
  }

  return { data: merged };
}

export function merge_affected<R extends { affected: number }>(
  total: R,
  next: R,
): R {
  return { ...next, affected: total.affected + next.affected };
}
