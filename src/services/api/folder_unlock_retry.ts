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

import { get_sole_unlock_token } from "@/services/folder_context";

export async function with_folder_unlock<T>(
  known_token: string | null,
  run: (unlock_token?: string) => Promise<ApiResponse<T>>,
): Promise<ApiResponse<T>> {
  const first = await run(known_token ?? undefined);

  if (!first.error) return first;
  if (first.code !== "NOT_FOUND" && first.code !== "FORBIDDEN") return first;

  const fallback = get_sole_unlock_token();

  if (!fallback || fallback === known_token) return first;

  const retried = await run(fallback);

  return retried.error ? first : retried;
}
