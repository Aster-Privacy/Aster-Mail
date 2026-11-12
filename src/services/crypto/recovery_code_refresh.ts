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
import { get_vault_from_memory, get_vault_owner_id } from "./memory_key_store";
import {
  canonicalize_recovery_code,
  is_valid_recovery_code,
} from "./recovery_key";
import { adopt_latest_vault_when } from "./vault_cas_write";

export const CURRENT_RECOVERY_CODE_SEGMENTS = 4;

let is_dismissed_for_session = false;
let dismissed_owner_id: string | null = null;

function is_dismissed_for_current_account(): boolean {
  return is_dismissed_for_session && dismissed_owner_id === get_vault_owner_id();
}

export function is_outdated_recovery_code(code: unknown): boolean {
  if (typeof code !== "string" || !is_valid_recovery_code(code)) return false;

  return (
    canonicalize_recovery_code(code).split("-").length - 1 <
    CURRENT_RECOVERY_CODE_SEGMENTS
  );
}

export function has_outdated_recovery_codes(
  codes: readonly unknown[] | null | undefined,
): boolean {
  if (!Array.isArray(codes)) return false;

  return codes.some((code) => is_outdated_recovery_code(code));
}

export function is_recovery_code_refresh_due(
  codes: readonly unknown[] | null | undefined,
): boolean {
  return !is_dismissed_for_current_account() && has_outdated_recovery_codes(codes);
}

export function dismiss_recovery_code_refresh(): void {
  is_dismissed_for_session = true;
  dismissed_owner_id = get_vault_owner_id();
}

export function reset_recovery_code_refresh(): void {
  is_dismissed_for_session = false;
  dismissed_owner_id = null;
}

export async function confirm_recovery_code_refresh_due(): Promise<boolean> {
  if (!is_recovery_code_refresh_due(get_vault_from_memory()?.recovery_codes)) {
    return false;
  }

  const adopted = await adopt_latest_vault_when(
    (vault) => !has_outdated_recovery_codes(vault.recovery_codes),
  );

  return adopted === null;
}
