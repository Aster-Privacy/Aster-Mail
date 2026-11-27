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
import type { ReactNode } from "react";
import type { StepUpProof } from "@/services/api/guard";
import type {
  GuardErrorSource,
  StepUpField,
} from "@/components/guard/guard_error_text";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  render_guard_message,
  step_up_rejection,
} from "@/components/guard/guard_error_text";
import { StepUpModal } from "@/components/settings/step_up_modal";
import { use_i18n } from "@/lib/i18n/context";

export class StepUpRejectedError extends Error {
  readonly field: StepUpField;

  constructor(message: string, field: StepUpField) {
    super(message);
    this.name = "StepUpRejectedError";
    this.field = field;
  }
}

export interface StepUpOptions {
  description?: string;
}

export interface GuardStepUp {
  request_proof: (options?: StepUpOptions) => Promise<StepUpProof | null>;
  run: <R extends GuardErrorSource>(
    attempt: (proof: StepUpProof) => Promise<R>,
    options?: StepUpOptions,
  ) => Promise<R | null>;
  step_up_modal: ReactNode;
}

type Attempt = (proof: StepUpProof) => Promise<unknown>;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  attempt: Attempt | null;
}

export function use_guard_step_up(): GuardStepUp {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);
  const [description, set_description] = useState<string | null>(null);
  const pending_ref = useRef<Pending | null>(null);

  const finish = useCallback(
    (outcome: { value: unknown } | { error: unknown }) => {
      const pending = pending_ref.current;

      pending_ref.current = null;
      set_is_open(false);
      if (!pending) return;
      if ("error" in outcome) pending.reject(outcome.error);
      else pending.resolve(outcome.value);
    },
    [],
  );

  useEffect(
    () => () => {
      const pending = pending_ref.current;

      pending_ref.current = null;
      pending?.resolve(null);
    },
    [],
  );

  const open = useCallback(
    (attempt: Attempt | null, options?: StepUpOptions) => {
      pending_ref.current?.resolve(null);

      return new Promise<unknown>((resolve, reject) => {
        pending_ref.current = { resolve, reject, attempt };
        set_description(options?.description ?? null);
        set_is_open(true);
      });
    },
    [],
  );

  const request_proof = useCallback(
    (options?: StepUpOptions) =>
      open(null, options) as Promise<StepUpProof | null>,
    [open],
  );

  const run = useCallback(
    <R extends GuardErrorSource>(
      attempt: (proof: StepUpProof) => Promise<R>,
      options?: StepUpOptions,
    ) => open(attempt, options) as Promise<R | null>,
    [open],
  );

  const handle_proof = useCallback(
    async (proof: StepUpProof) => {
      const pending = pending_ref.current;

      if (!pending) return;
      if (!pending.attempt) {
        finish({ value: proof });

        return;
      }
      let result: unknown;

      try {
        result = await pending.attempt(proof);
      } catch (caught) {
        finish({ error: caught });

        return;
      }
      const rejection = step_up_rejection(result as GuardErrorSource);

      if (rejection) {
        throw new StepUpRejectedError(
          render_guard_message(t, rejection.message),
          rejection.field,
        );
      }
      finish({ value: result });
    },
    [finish, t],
  );

  const step_up_modal = (
    <StepUpModal
      confirm_label={t("guard.step_up_confirm")}
      description={description ?? t("guard.step_up_description")}
      is_open={is_open}
      title={t("guard.step_up_title")}
      on_close={() => finish({ value: null })}
      allow_passkey
      on_proof={handle_proof}
    />
  );

  return { request_proof, run, step_up_modal };
}
