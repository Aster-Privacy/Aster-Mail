// SPDX-FileCopyrightText: 2026 Aster Communications Inc.
// SPDX-License-Identifier: AGPL-3.0-or-later
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
import { useCallback, useEffect, useRef, useState } from "react";

import { get_codes_status, get_recovery_methods } from "@/services/api/recovery";
import { ignore_error } from "@/lib/ignore_error";

export const LOW_RECOVERY_CODES = 3;

export interface RecoveryStatusValues {
  has_codes: boolean;
  codes_remaining: number;
  codes_total: number;
  codes_created_at: string | null;
  codes_low: boolean;
  has_phrase: boolean;
  needs_phrase_migration: boolean;
  recovery_email_set: boolean;
  recovery_email_verified: boolean;
  inactive_key_sets: number;
}

export interface RecoveryStatus extends RecoveryStatusValues {
  is_loaded: boolean;
  has_failed: boolean;
  reload: () => void;
}

const EMPTY: RecoveryStatusValues = {
  has_codes: false,
  codes_remaining: 0,
  codes_total: 0,
  codes_created_at: null,
  codes_low: false,
  has_phrase: false,
  needs_phrase_migration: false,
  recovery_email_set: false,
  recovery_email_verified: false,
  inactive_key_sets: 0,
};

export type RecoveryNudge = "phrase" | "codes" | "codes_low" | "email" | null;

export function recovery_nudge(values: RecoveryStatusValues): RecoveryNudge {
  if (values.needs_phrase_migration) return "phrase";
  if (!values.has_codes) return "codes";
  if (values.codes_low) return "codes_low";
  if (!values.recovery_email_set) return "email";

  return null;
}

export async function load_recovery_status(): Promise<RecoveryStatusValues | null> {
  const [methods, status] = await Promise.all([
    get_recovery_methods(),
    get_codes_status(),
  ]);

  if (methods.error || !methods.data) return null;

  const remaining = status.data
    ? status.data.remaining
    : methods.data.codes_remaining;
  const total = status.data ? status.data.total : remaining;
  const has_codes = methods.data.has_codes && remaining > 0;

  return {
    has_codes,
    codes_remaining: remaining,
    codes_total: total,
    codes_created_at: status.data ? status.data.created_at : null,
    codes_low: has_codes && remaining <= LOW_RECOVERY_CODES,
    has_phrase: methods.data.has_phrase,
    needs_phrase_migration: methods.data.has_phrase && !has_codes,
    recovery_email_set: methods.data.recovery_email_set,
    recovery_email_verified: methods.data.recovery_email_verified,
    inactive_key_sets: methods.data.inactive_key_sets,
  };
}

export function use_recovery_status(enabled: boolean): RecoveryStatus {
  const [values, set_values] = useState<RecoveryStatusValues>(EMPTY);
  const [is_loaded, set_is_loaded] = useState(false);
  const [has_failed, set_has_failed] = useState(false);
  const [nonce, set_nonce] = useState(0);
  const mounted_ref = useRef(true);

  useEffect(() => {
    mounted_ref.current = true;

    return () => {
      mounted_ref.current = false;
    };
  }, []);

  const reload = useCallback(() => {
    set_nonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const load = async () => {
      const values = await load_recovery_status();

      if (cancelled || !mounted_ref.current) return;

      if (!values) {
        set_has_failed(true);
        set_is_loaded(true);

        return;
      }

      set_values(values);
      set_has_failed(false);
      set_is_loaded(true);
    };

    void load().catch((caught) => {
      ignore_error("hooks/use_recovery_status:load", caught);
      if (cancelled || !mounted_ref.current) return;
      set_has_failed(true);
      set_is_loaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, nonce]);

  return { ...values, is_loaded, has_failed, reload };
}
