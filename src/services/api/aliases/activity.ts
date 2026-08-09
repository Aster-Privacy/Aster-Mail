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


import { AliasActivityResponse, AliasDeliveryLogResponse, AliasRunStatusResponse } from "./types";
export async function get_alias_activity(
  alias_id: string,
): Promise<ApiResponse<AliasActivityResponse>> {
  return api_client.get<AliasActivityResponse>(
    `/addresses/v1/aliases/${alias_id}/activity`,
  );
}

export async function run_alias_on_existing(
  alias_id: string,
  include_trashed = false,
): Promise<ApiResponse<AliasRunStatusResponse>> {
  return api_client.post<AliasRunStatusResponse>(
    `/addresses/v1/aliases/${alias_id}/run-on-existing?include_trashed=${include_trashed ? "true" : "false"}`,
    {},
  );
}

export async function get_alias_run(
  alias_id: string,
): Promise<ApiResponse<AliasRunStatusResponse>> {
  return api_client.get<AliasRunStatusResponse>(
    `/addresses/v1/aliases/${alias_id}/run`,
    { skip_cache: true },
  );
}

export async function cancel_alias_run(
  alias_id: string,
): Promise<ApiResponse<AliasRunStatusResponse>> {
  return api_client.post<AliasRunStatusResponse>(
    `/addresses/v1/aliases/${alias_id}/run/cancel`,
    {},
  );
}

export async function get_alias_delivery_log(
  alias_id: string,
): Promise<ApiResponse<AliasDeliveryLogResponse>> {
  return api_client.get<AliasDeliveryLogResponse>(
    `/addresses/v1/aliases/${alias_id}/delivery-log`,
  );
}

export async function get_domain_address_delivery_log(
  domain_address_id: string,
): Promise<ApiResponse<AliasDeliveryLogResponse>> {
  return api_client.get<AliasDeliveryLogResponse>(
    `/addresses/v1/aliases/domain-addresses/${domain_address_id}/delivery-log`,
  );
}
