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
import type { TranslationKey } from "@/lib/i18n/types";
import type { SenderTrust, SenderWarningKind } from "@/lib/sender_trust";
import type { ReactNode } from "react";

import {
  InformationCircleIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";

interface SenderTrustBannerProps {
  trust: SenderTrust | null | undefined;
  className?: string;
}

const WARNING_BODY: Record<SenderWarningKind, TranslationKey> = {
  address_in_name: "mail.sender_warning_address_in_name",
  lookalike_name: "mail.sender_warning_lookalike_name",
  brand_name: "mail.sender_warning_brand_name",
  home_brand_name: "mail.sender_warning_home_brand_name",
  lookalike_domain: "mail.sender_warning_lookalike_domain",
};

const SLOT = /\[\[(claimed|address|domain|name)\]\]/;

type SlotValues = Record<"claimed" | "address" | "domain" | "name", string>;

const SLOT_MARKERS: SlotValues = {
  claimed: "[[claimed]]",
  address: "[[address]]",
  domain: "[[domain]]",
  name: "[[name]]",
};

function render_with_values(template: string, values: SlotValues): ReactNode[] {
  return template.split(SLOT).map((part, position) =>
    position % 2 === 1 ? (
      <bdi
        key={position}
        className="font-semibold text-txt-primary [overflow-wrap:anywhere]"
      >
        {values[part as keyof SlotValues]}
      </bdi>
    ) : (
      part
    ),
  );
}

export function SenderTrustBanner({
  trust,
  className = "mx-4 mt-2 mb-3",
}: SenderTrustBannerProps) {
  const { t } = use_i18n();

  if (!trust) return null;

  const { warning, contact_notice, reply_to } = trust;

  if (!warning && !contact_notice && !reply_to) return null;

  const values: SlotValues = {
    claimed: warning?.claimed ?? "",
    address: trust.address,
    domain: trust.domain,
    name: contact_notice ?? "",
  };
  const notices: ReactNode[][] = [];

  if (contact_notice) {
    notices.push(
      render_with_values(t("mail.sender_contact_notice", SLOT_MARKERS), values),
    );
  }
  if (reply_to) {
    notices.push(
      render_with_values(t("mail.sender_reply_to_notice", SLOT_MARKERS), {
        ...values,
        address: reply_to,
      }),
    );
  }

  return (
    <div className={`space-y-2 ${className}`} data-sender-trust-banner="">
      {warning && (
        <div
          className="flex items-start gap-2 rounded-xl border px-3 py-2"
          data-warning={warning.kind}
          role="alert"
          style={{
            backgroundColor: "var(--cat-amber-soft)",
            borderColor: "var(--cat-amber-border)",
          }}
        >
          <ShieldExclamationIcon
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 flex-shrink-0"
            style={{ color: "var(--cat-amber-fg)" }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-snug text-txt-primary">
              {t("mail.sender_warning_title")}
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-txt-secondary">
              {render_with_values(
                t(WARNING_BODY[warning.kind], SLOT_MARKERS),
                values,
              )}
            </p>
          </div>
        </div>
      )}
      {notices.map((notice, position) => (
        <div
          key={position}
          className="flex items-start gap-2 rounded-xl border border-edge-secondary bg-surf-secondary px-3 py-2"
          role="note"
        >
          <InformationCircleIcon
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-txt-muted"
          />
          <p className="min-w-0 flex-1 text-[13px] leading-snug text-txt-secondary">
            {notice}
          </p>
        </div>
      ))}
    </div>
  );
}
