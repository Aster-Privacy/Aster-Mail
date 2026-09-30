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
import { api_client, type ApiResponse } from "./client";

export function is_session_failure(response: ApiResponse<unknown>): boolean {
  if (response.status === 401 || response.code === "UNAUTHORIZED") {
    return true;
  }

  return response.status === 403 && response.server_code === "CSRF_INVALID";
}

export async function with_session_recovery<T>(
  run: () => Promise<ApiResponse<T>>,
): Promise<ApiResponse<T>> {
  const first = await run();

  if (!is_session_failure(first)) return first;

  let recovered = false;

  try {
    recovered = await api_client.recover_session();
  } catch {
    recovered = false;
  }

  if (!recovered) return first;

  return run();
}
