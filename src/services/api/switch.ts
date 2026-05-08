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

interface AccountLimitResponse {
  max_accounts: number;
  plan_code: string;
  plan_name: string;
}

export async function get_account_limit(): Promise<
  ApiResponse<AccountLimitResponse>
> {
  return api_client.get<AccountLimitResponse>(
    "/payments/v1/plans/account-limit",
  );
}

export type { AccountLimitResponse };
