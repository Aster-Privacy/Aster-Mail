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
import { api_client } from "@/services/api/client";

const IDENTITY_ENDPOINT = "/core/v1/auth/me";
const IDENTITY_RECHECK_MS = 30_000;
const ANONYMOUS_ACCOUNT = "anonymous";

let confirmed_account: string | null = null;
let confirmed_at = 0;
let pending: { account_id: string; promise: Promise<boolean> } | null = null;
let generation = 0;

export function reset_calendar_identity(): void {
  generation += 1;
  confirmed_account = null;
  confirmed_at = 0;
  pending = null;
}

export async function confirm_calendar_identity(
  account_id: string,
): Promise<boolean> {
  if (!account_id || account_id === ANONYMOUS_ACCOUNT) return false;

  const expected = api_client.get_expected_user_id();

  if (expected && expected !== account_id) return false;
  if (
    confirmed_account === account_id &&
    Date.now() - confirmed_at < IDENTITY_RECHECK_MS
  ) {
    return true;
  }
  if (pending && pending.account_id === account_id) return pending.promise;

  const started = generation;
  const promise = fetch_identity(account_id, started).finally(() => {
    if (pending?.promise === promise) pending = null;
  });

  pending = { account_id, promise };

  return promise;
}

async function fetch_identity(
  account_id: string,
  started: number,
): Promise<boolean> {
  let actual: unknown;

  try {
    const response = await api_client.get<{ user_id?: string }>(
      IDENTITY_ENDPOINT,
      { skip_cache: true, skip_dedup: true },
    );

    actual = response.data?.user_id;
  } catch {
    return false;
  }

  if (started !== generation) return false;
  if (typeof actual !== "string" || actual.length === 0) return false;
  if (actual !== account_id) {
    confirmed_account = null;
    void api_client.verify_identity(true);

    return false;
  }

  confirmed_account = account_id;
  confirmed_at = Date.now();

  return true;
}
