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
