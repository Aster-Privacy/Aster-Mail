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
    .filter(
      (change) =>
        change.missing ||
        Boolean(change.new_fingerprint) ||
        Boolean(change.prior_fingerprint),
    )
    .map((change) =>
      change.missing
        ? change.prior_fingerprint
          ? t("common.key_trust_missing_detail", {
              email: change.email,
              prior: format_fingerprint(change.prior_fingerprint),
            })
          : t("common.key_trust_missing_unreadable_detail", {
              email: change.email,
            })
        : change.unreadable || !change.prior_fingerprint
          ? t("common.key_trust_unreadable_detail", {
              email: change.email,
              current: format_fingerprint(change.new_fingerprint),
            })
          : t("common.key_trust_change_detail", {
              email: change.email,
              prior: format_fingerprint(change.prior_fingerprint),
              current: format_fingerprint(change.new_fingerprint),
            }),
    )
    .join(" ");

  const missing = pending.filter((change) => change.missing);
  const own = pending.filter((change) => change.own && !change.missing);
  const changed = pending.filter(
    (change) => !change.unreadable && !change.missing && !change.own,
  );
  const unread = pending.filter(
    (change) => change.unreadable && !change.missing && !change.own,
  );
  const only_missing = missing.length > 0 && missing.length === pending.length;

  const summary = [
    own.length > 0
      ? t("common.key_trust_own_message", {
          recipients: own.map((change) => change.email).join(", "),
        })
      : "",
    changed.length > 0
      ? t("common.key_trust_change_message", {
          recipients: changed.map((change) => change.email).join(", "),
        })
      : "",
    unread.length > 0
      ? t("common.key_trust_unreadable_message", {
          recipients: unread.map((change) => change.email).join(", "),
        })
      : "",
    missing.length > 0
      ? t("common.key_trust_missing_message", {
          recipients: missing.map((change) => change.email).join(", "),
        })
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ConfirmModal
      hide_dont_ask
      confirm_text={t(
        missing.length > 0
          ? "common.key_trust_missing_confirm"
          : "common.key_trust_change_confirm",
      )}
      confirm_variant="destructive"
      description={details ? `${summary} ${details}` : summary}
      dont_ask={false}
      on_cancel={() => settle(false)}
      on_confirm={() => settle(true)}
      on_dont_ask_change={() => {}}
      show={changes !== null}
      title={t(
        only_missing
          ? "common.key_trust_missing_title"
          : "common.key_trust_change_title",
      )}
    />
  );
}
