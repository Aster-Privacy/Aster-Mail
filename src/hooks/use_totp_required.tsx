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
import { useEffect, useState } from "react";

import { fetch_step_up_requirements } from "@/services/api/step_up";
import {
  peek_totp_required,
  subscribe_totp_required,
} from "@/services/api/step_up_cache";
import { ignore_error } from "@/lib/ignore_error";
import { use_auth } from "@/contexts/auth_context";

let warming: Promise<void> | null = null;

export function warm_totp_required(): Promise<void> {
  if (peek_totp_required() !== null) return Promise.resolve();
  if (!warming) {
    warming = fetch_step_up_requirements()
      .then(() => undefined)
      .catch((caught) => ignore_error("hooks/use_totp_required:warm", caught))
      .finally(() => {
        warming = null;
      });
  }

  return warming;
}

export interface TotpRequirementState {
  totp_required: boolean;
  totp_unknown: boolean;
  totp_failed: boolean;
}

export function use_totp_required(is_open: boolean): TotpRequirementState {
  const [known, set_known] = useState<boolean | null>(peek_totp_required);
  const [failed, set_failed] = useState(false);

  useEffect(() => subscribe_totp_required(set_known), []);

  useEffect(() => {
    if (!is_open) return;
    let active = true;

    set_known(peek_totp_required());
    set_failed(false);
    fetch_step_up_requirements()
      .then((requirements) => {
        if (active) set_known(requirements.totp_required);
      })
      .catch((caught) => {
        if (!active) return;
        if (peek_totp_required() === null) set_failed(true);
        ignore_error("hooks/use_totp_required:use_totp_required", caught);
      });

    return () => {
      active = false;
    };
  }, [is_open]);

  return {
    totp_required: known === true,
    totp_unknown: known === null && !failed,
    totp_failed: known === null && failed,
  };
}

export function TotpRequirementWarmup(): null {
  const { user } = use_auth();
  const user_id = user?.id ?? null;

  useEffect(() => {
    if (user_id) void warm_totp_required();
  }, [user_id]);

  return null;
}
