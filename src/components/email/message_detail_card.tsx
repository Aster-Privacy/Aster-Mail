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

import { Fragment } from "react";

import { use_i18n } from "@/lib/i18n/context";
import {
  summarize_email_authentication,
  type EmailAuthResults,
} from "@/utils/email_authentication";
import {
  CHECK_NAME,
  EmailAuthCheckStatus,
} from "@/components/email/email_auth_indicator";
import { copy_text_or_throw } from "@/utils/copy_text";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { show_toast } from "@/components/toast/simple_toast";

interface DetailRecipient {
  email: string;
  name?: string;
}

interface MessageDetailCardProps {
  sender_name: string;
  sender_email: string;
  sender_authenticated?: boolean;
  delivered_to_address?: string | null;
  to_recipients?: DetailRecipient[];
  cc_recipients?: DetailRecipient[];
  bcc_recipients?: DetailRecipient[];
  date_label: string;
  subject: string;
  // The SPF, DKIM and DMARC results of a received message. Shown for every
  // message that has them, while the badge next to the sender only appears
  // when a check failed or was inconclusive.
  auth_results?: EmailAuthResults | null;
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <dt className="whitespace-nowrap text-end font-medium leading-5 text-txt-muted">
        {label}
      </dt>
      <dd className="m-0 min-w-0 break-words leading-5 text-txt-secondary">
        {children}
      </dd>
    </>
  );
}

export function MessageDetailCard({
  sender_name,
  sender_email,
  sender_authenticated = false,
  delivered_to_address,
  to_recipients,
  cc_recipients,
  bcc_recipients,
  date_label,
  subject,
  auth_results,
}: MessageDetailCardProps) {
  const { t } = use_i18n();
  const auth_summary = auth_results
    ? summarize_email_authentication(auth_results)
    : null;

  const copy_address = (address: string) => {
    copy_text_or_throw(address)
      .then(() => show_toast(t("common.email_copied"), "success"))
      .catch(() => show_toast(t("common.failed_to_copy"), "error"));
  };

  const render_recipients = (list: DetailRecipient[]) => (
    <span className="flex flex-col gap-1.5">
      {list.map((r) => (
        <span key={r.email} className="flex min-w-0 items-center gap-2">
          <ProfileAvatar
            use_domain_logo
            email={r.email}
            name={r.name || ""}
            size="xs"
          />
          <button
            className="min-w-0 truncate text-start hover:underline"
            dir="auto"
            title={r.email}
            type="button"
            onClick={() => copy_address(r.email)}
          >
            {r.name ? (
              <>
                {r.name}{" "}
                <span className="text-txt-muted">&lt;{r.email}&gt;</span>
              </>
            ) : (
              r.email
            )}
          </button>
        </span>
      ))}
    </span>
  );

  const recipient_rows: Array<[string, DetailRecipient[] | undefined]> = [
    [t("common.to_label"), to_recipients],
    [t("common.cc_label"), cc_recipients],
    [t("common.bcc_label"), bcc_recipients],
  ];

  return (
    <dl className="m-0 grid grid-cols-[minmax(3.5rem,auto)_minmax(0,1fr)] items-start gap-x-3 gap-y-2 text-xs">
      <DetailRow label={t("common.from_label")}>
        <span className="flex min-w-0 items-center gap-2">
          <ProfileAvatar
            use_domain_logo
            email={sender_email}
            name={sender_name}
            sender_authenticated={sender_authenticated}
            size="xs"
          />
          <button
            className="min-w-0 truncate text-start hover:underline"
            dir="auto"
            title={sender_email}
            type="button"
            onClick={() => copy_address(sender_email)}
          >
            {sender_name}{" "}
            <span className="text-txt-muted">&lt;{sender_email}&gt;</span>
          </button>
        </span>
      </DetailRow>
      {delivered_to_address && (
        <DetailRow label={t("common.received_on_label")}>
          {delivered_to_address}
        </DetailRow>
      )}
      {recipient_rows.map(([label, list]) =>
        list && list.length > 0 ? (
          <Fragment key={label}>
            <DetailRow label={label}>{render_recipients(list)}</DetailRow>
          </Fragment>
        ) : null,
      )}
      <DetailRow label={t("common.date_label")}>{date_label}</DetailRow>
      <DetailRow label={t("common.subject_label")}>
        <span dir="auto">{subject}</span>
      </DetailRow>
      {auth_summary && (
        <DetailRow label={t("mail.email_auth_details_label")}>
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {auth_summary.checks.map((result) => (
              <span
                key={result.check}
                className="inline-flex items-center gap-1.5"
                data-check={result.check}
              >
                <span className="font-medium text-txt-primary">
                  {CHECK_NAME[result.check]}
                </span>
                <EmailAuthCheckStatus result={result} />
              </span>
            ))}
          </span>
        </DetailRow>
      )}
    </dl>
  );
}
