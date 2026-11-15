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

import { useCallback, useRef, useState } from "react";

import { StepUpModal } from "@/components/settings/step_up_modal";
import { use_i18n } from "@/lib/i18n/context";

export interface GuardStepUp {
  request_proof: () => Promise<StepUpProof | null>;
  step_up_modal: ReactNode;
}

export function use_guard_step_up(): GuardStepUp {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);
  const resolver_ref = useRef<((proof: StepUpProof | null) => void) | null>(
    null,
  );

  const settle = useCallback((proof: StepUpProof | null) => {
    const resolve = resolver_ref.current;

    resolver_ref.current = null;
    set_is_open(false);
    resolve?.(proof);
  }, []);

  const request_proof = useCallback(() => {
    resolver_ref.current?.(null);

    return new Promise<StepUpProof | null>((resolve) => {
      resolver_ref.current = resolve;
      set_is_open(true);
    });
  }, []);

  const step_up_modal = (
    <StepUpModal
      confirm_label={t("guard.step_up_confirm")}
      description={t("guard.step_up_description")}
      is_open={is_open}
      title={t("guard.step_up_title")}
      on_close={() => settle(null)}
      allow_passkey
      on_proof={async (proof) => settle(proof)}
    />
  );

  return { request_proof, step_up_modal };
}
