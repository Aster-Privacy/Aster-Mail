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

interface SecurityStatusResponse {
  two_factor_enabled: boolean;
  recovery_email_set: boolean;
  last_password_change: string | null;
  password_strength_tier: number | null;
}

export async function get_security_status(): Promise<
  ApiResponse<SecurityStatusResponse>
> {
  return api_client.get<SecurityStatusResponse>("/core/v1/account/security");
}

export async function backfill_password_strength_tier(
  password_strength_tier: number,
): Promise<ApiResponse<SecurityStatusResponse>> {
  return api_client.post<SecurityStatusResponse>(
    "/core/v1/account/security/password-strength",
    { password_strength_tier },
  );
}

export type { SecurityStatusResponse };

interface DeleteAccountRequest {
  password_hash: string;
}

interface DeleteAccountResponse {
  success: boolean;
  message: string;
}

export async function delete_account(
  password_hash: string,
): Promise<ApiResponse<DeleteAccountResponse>> {
  const response = await api_client.delete<DeleteAccountResponse>(
    "/core/v1/account",
    {
      data: { password_hash },
    },
  );

  if (response.data?.success) {
    api_client.set_authenticated(false);
  }

  return response;
}

export type { DeleteAccountRequest, DeleteAccountResponse };
