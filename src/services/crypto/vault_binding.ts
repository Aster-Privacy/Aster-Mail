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
import { peek_account_key_capabilities } from "@/services/api/account_key";
import { is_format_retired } from "@/services/format_retirement/record";

let bound_seen = false;
let last_open_bound: boolean | null = null;

export function note_own_vault_opened(bound: boolean): void {
  last_open_bound = bound;
  if (bound) bound_seen = true;
}

export function note_own_vault_sealed(bound: boolean): void {
  if (bound) bound_seen = true;
}

export function own_vault_last_open_bound(): boolean | null {
  return last_open_bound;
}

export function own_vault_bound_seen(): boolean {
  return bound_seen;
}

export function server_requests_bound_vault(): boolean {
  return peek_account_key_capabilities().bound_vault_writes === true;
}

export function vault_write_binds(own_vault: boolean): boolean {
  if (server_requests_bound_vault()) return true;
  if (!own_vault) return false;

  return bound_seen || is_format_retired("vault_unbound");
}

export function reset_vault_binding_state(): void {
  bound_seen = false;
  last_open_bound = null;
}
