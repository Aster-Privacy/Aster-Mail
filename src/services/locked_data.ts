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
import { list_inactive_key_sets } from "./api/recovery";
import { recover_sent_mail_with_password } from "./account_data_conversion";
import { restore_inactive_key_sets } from "./crypto/restore_inactive_keys";
import { get_passphrase_from_memory } from "./crypto/memory_key_store";
import {
  LOCKED_DATA_CHANGED_EVENT,
  read_locked_sent_mail,
  write_locked_sent_mail,
} from "./locked_sent_mail_store";
import { reencrypt_all_sent_mail } from "./sent_mail_reseal";

import { ignore_error } from "@/lib/ignore_error";

export interface LockedDataStatus {
  inactive_key_sets: number;
  locked_sent_mail: number;
  signature: string;
}

export interface LockedDataRecovery {
  restored_key_sets: number;
  recovered_sent_mail: number;
  failed: boolean;
}

export function has_locked_data(status: LockedDataStatus | null): boolean {
  return (
    !!status && (status.inactive_key_sets > 0 || status.locked_sent_mail > 0)
  );
}

export async function get_locked_data_status(
  account_id: string,
): Promise<LockedDataStatus | null> {
  if (!account_id) return null;

  const listed = await list_inactive_key_sets().catch(() => null);

  if (!listed?.data) return null;

  const ids = listed.data.inactive_key_sets
    .map((key_set) => key_set.id)
    .filter((id) => typeof id === "string" && id.length > 0)
    .sort();
  const locked_sent_mail = read_locked_sent_mail(account_id);

  return {
    inactive_key_sets: ids.length,
    locked_sent_mail,
    signature: `${ids.join(",")}|${locked_sent_mail > 0 ? "sent" : ""}`,
  };
}

async function recover_sent_mail(
  account_id: string,
  password: string,
): Promise<{ recovered: number; failed: boolean }> {
  const current = get_passphrase_from_memory();

  if (!current) return { recovered: 0, failed: true };
  if (current === password) return { recovered: 0, failed: false };

  const converted = await recover_sent_mail_with_password(account_id, password);

  if (converted) {
    return { recovered: converted.converted, failed: converted.failed > 0 };
  }

  const summary = await reencrypt_all_sent_mail(password, current);

  write_locked_sent_mail(account_id, summary.unreadable);

  return { recovered: summary.rewritten, failed: summary.failed > 0 };
}

export async function recover_locked_data(
  account_id: string,
  password: string,
): Promise<LockedDataRecovery> {
  const result: LockedDataRecovery = {
    restored_key_sets: 0,
    recovered_sent_mail: 0,
    failed: false,
  };

  if (!account_id || !password) return result;

  try {
    result.restored_key_sets = await restore_inactive_key_sets(password);
  } catch (caught) {
    result.failed = true;
    ignore_error("services/locked_data:restore_key_sets", caught);
  }

  try {
    const sent = await recover_sent_mail(account_id, password);

    result.recovered_sent_mail = sent.recovered;
    result.failed = result.failed || sent.failed;
  } catch (caught) {
    result.failed = true;
    ignore_error("services/locked_data:recover_sent_mail", caught);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LOCKED_DATA_CHANGED_EVENT));
  }

  return result;
}
