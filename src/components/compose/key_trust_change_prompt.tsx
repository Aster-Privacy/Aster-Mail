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
import { format_fingerprint } from "@/services/api/keys";
import {
  set_key_trust_prompt_handler,
  type KeyFingerprintChange,
} from "@/services/key_trust_consent";

export function KeyTrustChangePrompt(): React.ReactElement {
  const { t } = use_i18n();
  const [changes, set_changes] = useState<KeyFingerprintChange[] | null>(null);
  const pending_resolve = useRef<((trusted: boolean) => void) | null>(null);

  useEffect(() => {
    set_key_trust_prompt_handler((pending) => {
      pending_resolve.current?.(false);

      return new Promise<boolean>((resolve) => {
        pending_resolve.current = resolve;
        set_changes(pending);
      });
    });

    return () => {
      set_key_trust_prompt_handler(null);
    };
  }, []);

  const settle = (trusted: boolean) => {
    const resolve = pending_resolve.current;

    pending_resolve.current = null;
    set_changes(null);
    resolve?.(trusted);
  };

  const pending = changes ?? [];

  const details = pending
    .map((change) =>
      t("common.key_trust_change_detail", {
        email: change.email,
        prior: format_fingerprint(change.prior_fingerprint),
        current: format_fingerprint(change.new_fingerprint),
      }),
    )
    .join(" ");

  const summary = t("common.key_trust_change_message", {
    recipients: pending.map((change) => change.email).join(", "),
  });

  return (
    <ConfirmModal
      hide_dont_ask
      confirm_text={t("common.key_trust_change_confirm")}
      confirm_variant="destructive"
      description={`${summary} ${details}`}
      dont_ask={false}
      on_cancel={() => settle(false)}
      on_confirm={() => settle(true)}
      on_dont_ask_change={() => {}}
      show={changes !== null}
      title={t("common.key_trust_change_title")}
    />
  );
}
