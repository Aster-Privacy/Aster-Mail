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
import { useEffect, useMemo, useState } from "react";
import { ShieldExclamationIcon } from "@heroicons/react/24/solid";

import { use_i18n } from "@/lib/i18n/context";
import { is_internal_email } from "@/services/api/keys";
import { acknowledge_identity_change } from "@/services/crypto/ratchet_identity_pin";
import { has_recipient_identity_changed } from "@/services/crypto/recipient_identity_check";
import { subscribe_peer_identity_events } from "@/services/crypto/ratchet_verification_status";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RecipientIdentityNoticeProps {
  recipients: string[];
  class_name?: string;
}

export function RecipientIdentityNotice({
  recipients,
  class_name,
}: RecipientIdentityNoticeProps) {
  const { t } = use_i18n();
  const [changed, set_changed] = useState<string[]>([]);
  const [dismissed, set_dismissed] = useState<Set<string>>(() => new Set());
  const [event_tick, set_event_tick] = useState(0);

  const recipients_key = useMemo(() => {
    const unique = new Set(
      recipients
        .map((email) => email.trim().toLowerCase())
        .filter((email) => EMAIL_SHAPE.test(email) && is_internal_email(email)),
    );

    return [...unique].sort().join(",");
  }, [recipients]);

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
      candidates.map(async (email) =>
        (await has_recipient_identity_changed(email)) ? email : null,
      ),
    ).then((results) => {
      if (cancelled) return;

      set_changed(results.filter((email): email is string => email !== null));
    });

    return () => {
      cancelled = true;
    };
  }, [recipients_key, event_tick]);

  const visible = changed.filter((email) => !dismissed.has(email));

  if (visible.length === 0) return null;

  return (
    <div
      className={`flex flex-col gap-1.5${class_name ? ` ${class_name}` : ""}`}
      data-testid="recipient-identity-notice"
      role="status"
    >
      {visible.map((email) => (
        <div
          key={email}
          className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-txt-primary"
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
      ))}
    </div>
  );
}
