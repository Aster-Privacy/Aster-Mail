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
import { clear_csrf_cache } from "./csrf";

interface SwitchTokenResponse {
  switch_token: string;
  expires_at: string;
}

interface SwitchResponse {
  user_id: string;
  username: string;
  email: string;
  display_name: string | null;
  profile_color: string | null;
  csrf_token: string;
  encrypted_vault: string;
  vault_nonce: string;
  switch_token: string;
  switch_token_expires_at: string;
  needs_prekey_replenishment: boolean;
  access_token?: string;
}

interface AccountLimitResponse {
  max_accounts: number;
  plan_code: string;
  plan_name: string;
}

export async function request_switch_token(): Promise<
  ApiResponse<SwitchTokenResponse>
> {
  return api_client.post<SwitchTokenResponse>("/core/v1/auth/switch-token", {});
}

export async function switch_account_with_token(
  switch_token: string,
): Promise<ApiResponse<SwitchResponse>> {
  const response = await api_client.post<SwitchResponse>(
    "/core/v1/auth/switch",
    { switch_token },
  );

  if (response.data) {
    clear_csrf_cache();
    if (response.data.csrf_token) {
      api_client.set_csrf(response.data.csrf_token);
    }
    if (response.data.access_token) {
      api_client.set_dev_token(response.data.access_token);
    }
    api_client.set_authenticated(true);
  }

  return response;
}

export async function revoke_switch_token(): Promise<ApiResponse<unknown>> {
  return api_client.delete("/core/v1/auth/switch-token");
}

export async function get_account_limit(): Promise<
  ApiResponse<AccountLimitResponse>
> {
  return api_client.get<AccountLimitResponse>(
    "/payments/v1/plans/account-limit",
  );
}

export type { SwitchTokenResponse, SwitchResponse, AccountLimitResponse };
