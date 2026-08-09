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
import { useEffect, useRef, useState } from "react";

import { ConfirmModal } from "@/components/email/inbox/inbox_confirmation_dialog";
import { use_i18n } from "@/lib/i18n/context";
import { set_post_quantum_prompt_handler } from "@/services/post_quantum_consent";

interface PromptState {
  recipients: string[];
}

export function PostQuantumSendPrompt(): React.ReactElement {
  const { t } = use_i18n();
  const [state, set_state] = useState<PromptState | null>(null);
  const pending_resolve = useRef<((allow: boolean) => void) | null>(null);

  useEffect(() => {
    set_post_quantum_prompt_handler((recipients) => {
      pending_resolve.current?.(false);

      return new Promise<boolean>((resolve) => {
        pending_resolve.current = resolve;
        set_state({ recipients });
      });
    });

    return () => {
      set_post_quantum_prompt_handler(null);
    };
  }, []);

  const settle = (allow: boolean) => {
    const resolve = pending_resolve.current;

    pending_resolve.current = null;
    set_state(null);
    resolve?.(allow);
  };

  return (
    <ConfirmModal
      confirm_text={t("common.post_quantum_send_anyway")}
      confirm_variant="destructive"
      description={t("common.post_quantum_unavailable_message", {
        recipients: state?.recipients.join(", ") ?? "",
      })}
      dont_ask={false}
      hide_dont_ask
      on_cancel={() => settle(false)}
      on_confirm={() => settle(true)}
      on_dont_ask_change={() => {}}
      show={state !== null}
      title={t("common.post_quantum_unavailable_title")}
    />
  );
}
