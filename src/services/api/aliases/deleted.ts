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
import { } from "@/services/crypto/constants";
import type { } from "@/lib/i18n/types";

import { api_client, type ApiResponse } from "../client";

import { } from "@/lib/i18n/translations/en";
import { } from "@/services/crypto/secure_memory";
import { } from "@/services/crypto/legacy_keks";


import { AliasStats } from "./types";
export async function restore_alias(
  deleted_id: string,
): Promise<ApiResponse<{ id: string; success: boolean }>> {
  return api_client.post<{ id: string; success: boolean }>(
    `/addresses/v1/aliases/deleted/${deleted_id}/restore`,
    {},
  );
}

export async function purge_deleted_alias(
  deleted_id: string,
): Promise<ApiResponse<{ status: string }>> {
  return api_client.delete<{ status: string }>(
    `/addresses/v1/aliases/deleted/${deleted_id}`,
  );
}

export async function empty_deleted_aliases(): Promise<
  ApiResponse<{ status: string; count: number }>
> {
  return api_client.delete<{ status: string; count: number }>(
    `/addresses/v1/aliases/deleted`,
  );
}

export async function get_alias_stats(
  alias_id: string,
): Promise<ApiResponse<AliasStats>> {
  return api_client.get<AliasStats>(`/addresses/v1/aliases/${alias_id}/stats`);
}

