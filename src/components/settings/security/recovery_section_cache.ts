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
import type { CodesStatus, RecoveryMethods } from "@/services/api/recovery";

import { useEffect, useState } from "react";

import {
  get_codes_status,
  get_recovery_methods,
} from "@/services/api/recovery";
import { vault_keys_need_previous_password } from "@/services/crypto/restore_inactive_keys";

export interface RecoverySectionData {
  methods: RecoveryMethods | null;
  status: CodesStatus | null;
  locked_vault_keys: boolean;
}

let cached_recovery_section: RecoverySectionData | null = null;
let pending_recovery_section: Promise<RecoverySectionData> | null = null;

export async function fetch_recovery_section_data(): Promise<RecoverySectionData> {
  const [methods_response, status_response, keys_locked] = await Promise.all([
    get_recovery_methods(),
    get_codes_status(),
    vault_keys_need_previous_password().catch(() => false),
  ]);
  const data: RecoverySectionData = {
    methods: methods_response.data ?? null,
    status: status_response.data ?? null,
    locked_vault_keys: keys_locked,
  };

  if (data.methods) cached_recovery_section = data;

  return data;
}

export function load_recovery_section_data(): Promise<RecoverySectionData> {
  if (!pending_recovery_section) {
    pending_recovery_section = fetch_recovery_section_data().finally(() => {
      pending_recovery_section = null;
    });
  }

  return pending_recovery_section;
}

export function peek_recovery_section_data(): RecoverySectionData | null {
  return cached_recovery_section;
}

export function clear_recovery_section_cache(): void {
  cached_recovery_section = null;
  pending_recovery_section = null;
}

export function use_recovery_section_preload(): boolean {
  const [settled, set_settled] = useState(
    () => cached_recovery_section !== null,
  );

  useEffect(() => {
    if (settled) return;
    let cancelled = false;

    load_recovery_section_data()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) set_settled(true);
      });

    return () => {
      cancelled = true;
    };
  }, [settled]);

  return settled;
}
