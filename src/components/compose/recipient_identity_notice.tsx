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
import { ShieldExclamationIcon } from "@heroicons/react/24/solid";

import { use_i18n } from "@/lib/i18n/context";
import {
  is_internal_recipient,
  use_recipient_classification,
} from "@/services/recipient_classification";
import { acknowledge_identity_change } from "@/services/crypto/ratchet_identity_pin";
import {
  get_recipient_identity_status,
  trust_recipient_identity,
  type RecipientIdentityStatus,
} from "@/services/crypto/recipient_identity_check";
import { subscribe_peer_identity_events } from "@/services/crypto/ratchet_verification_status";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RecipientIdentityNoticeProps {
  recipients: string[];
  class_name?: string;
}

interface ChangedRecipient {
  email: string;
  status: Exclude<RecipientIdentityStatus, "unchanged">;
}

export function RecipientIdentityNotice({
  recipients,
  class_name,
}: RecipientIdentityNoticeProps) {
  const { t } = use_i18n();
  const [changed, set_changed] = useState<ChangedRecipient[]>([]);
  const [dismissed, set_dismissed] = useState<Set<string>>(() => new Set());
  const [event_tick, set_event_tick] = useState(0);

  use_recipient_classification(recipients);

  const recipients_key = [
    ...new Set(
      recipients
        .map((email) => email.trim().toLowerCase())
        .filter(
          (email) => EMAIL_SHAPE.test(email) && is_internal_recipient(email),
        ),
    ),
  ]
    .sort()
    .join(",");

  useEffect(
    () => subscribe_peer_identity_events(() => set_event_tick((v) => v + 1)),
    [],
  );

  useEffect(() => {
    const candidates = recipients_key ? recipients_key.split(",") : [];

    if (candidates.length === 0) {
      set_changed([]);

      return;
    }

    let cancelled = false;

    Promise.all(
      candidates.map(async (email) => ({
        email,
        status: await get_recipient_identity_status(email),
      })),
    )
      .then((results) => {
        if (cancelled) return;

        set_changed(
          results.filter(
            (entry): entry is ChangedRecipient => entry.status !== "unchanged",
          ),
        );
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [recipients_key, event_tick]);

  const visible = changed.filter(
    (entry) => entry.status === "untrusted" || !dismissed.has(entry.email),
  );

  if (visible.length === 0) return null;

  return (
    <div
      className={`flex flex-col gap-1.5${class_name ? ` ${class_name}` : ""}`}
      data-testid="recipient-identity-notice"
      role={
        visible.some((entry) => entry.status === "untrusted")
          ? "alert"
          : "status"
      }
    >
      {visible.map(({ email, status }) =>
        status === "untrusted" ? (
          <div
            key={email}
            className="flex items-start gap-2 rounded-[var(--aster-radius-control)] bg-red-500/10 px-3 py-2 text-xs text-txt-primary"
            data-testid="recipient-identity-untrusted"
          >
            <ShieldExclamationIcon
              aria-hidden="true"
              className="w-4 h-4 flex-shrink-0 text-red-500"
            />
            <span className="flex-1 min-w-0 break-words">
              {t("mail.recipient_identity_untrusted", { email })}
            </span>
            <button
              className="flex-shrink-0 font-medium text-txt-secondary hover:text-txt-primary"
              type="button"
              onClick={() => {
                trust_recipient_identity(email)
                  .catch(() => undefined)
                  .finally(() => set_event_tick((v) => v + 1));
              }}
            >
              {t("mail.trust_new_key")}
            </button>
          </div>
        ) : (
          <div
            key={email}
            className="flex items-start gap-2 rounded-[var(--aster-radius-control)] bg-amber-500/10 px-3 py-2 text-xs text-txt-primary"
          >
            <ShieldExclamationIcon
              aria-hidden="true"
              className="w-4 h-4 flex-shrink-0 text-amber-500"
            />
            <span className="flex-1 min-w-0 break-words">
              {t("mail.recipient_identity_changed", { email })}
            </span>
            <button
              className="flex-shrink-0 font-medium text-txt-secondary hover:text-txt-primary"
              type="button"
              onClick={() => {
                set_dismissed((prev) => new Set(prev).add(email));
                acknowledge_identity_change(email).catch(() => undefined);
              }}
            >
              {t("common.dismiss")}
            </button>
          </div>
        ),
      )}
    </div>
  );
}
