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
import type { TranslationKey } from "@/lib/i18n/types";
import type {
  EmailAuthCheckResult,
  EmailAuthResults,
} from "@/utils/email_authentication";
import type {
  HeaderHelpTopic,
  RawHeader,
} from "@/utils/message_header_details";

import { memo, useId, useMemo } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { InfoPopover } from "@/components/ui/info_popover";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CHECK_NAME,
  CHECK_PURPOSE,
  EmailAuthCheckStatus,
  display_domain,
  status_color,
} from "@/components/email/email_auth_indicator";
import { summarize_email_authentication } from "@/utils/email_authentication";
import {
  get_mailed_by,
  get_mailing_list,
  get_reply_to,
  get_signed_by,
  segment_auth_value,
  to_display_headers,
} from "@/utils/message_header_details";

export type HeadersViewMode = "formatted" | "raw";

const HEADER_HELP: Record<HeaderHelpTopic, TranslationKey> = {
  received: "mail.header_help_received",
  return_path: "mail.header_help_return_path",
  authentication_results: "mail.header_help_authentication_results",
  received_spf: "mail.header_help_received_spf",
  dkim_signature: "mail.header_help_dkim_signature",
  arc: "mail.header_help_arc",
  message_id: "mail.header_help_message_id",
  list_unsubscribe: "mail.header_help_list_unsubscribe",
  spam: "mail.header_help_spam",
};

const LABEL_CLASS = {
  desktop:
    "min-w-24 flex-shrink-0 whitespace-nowrap pe-2 font-medium text-txt-muted",
  mobile:
    "min-w-20 flex-shrink-0 whitespace-nowrap pe-2 text-[12px] font-medium text-[var(--text-muted)]",
};

const VALUE_CLASS = {
  desktop: "min-w-0 text-txt-secondary break-words",
  mobile: "min-w-0 text-[12px] text-[var(--text-secondary)] break-words",
};

type Variant = keyof typeof LABEL_CLASS;

export function DetailsRow({
  label,
  variant,
  children,
}: {
  label: string;
  variant: Variant;
  children: ReactNode;
}) {
  return (
    <div className="flex">
      <span className={LABEL_CLASS[variant]}>{label}</span>
      <span className={VALUE_CLASS[variant]}>{children}</span>
    </div>
  );
}

function meaning_key(result: EmailAuthCheckResult): TranslationKey | null {
  if (result.status === "pass") return `mail.email_auth_${result.check}_pass`;
  if (result.status === "fail") return `mail.email_auth_${result.check}_fail`;
  if (result.status === "none") return "mail.email_auth_check_none";
  if (result.status === "missing") return "mail.email_auth_check_missing";

  return null;
}

export function EmailAuthCheckPill({
  result,
}: {
  result: EmailAuthCheckResult;
}) {
  const { t } = use_i18n();
  const title_id = useId();
  const desc_id = useId();
  const key = meaning_key(result);
  const meaning = key
    ? t(key)
    : t("mail.email_auth_check_other", { value: result.value });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1.5 rounded-full border border-edge-secondary px-2 py-0.5 text-xs transition-colors hover:bg-surf-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
          data-check={result.check}
          type="button"
        >
          <span className="font-semibold text-txt-primary">
            {CHECK_NAME[result.check]}
          </span>
          <EmailAuthCheckStatus result={result} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-describedby={desc_id}
        aria-labelledby={title_id}
        className="w-72 max-w-[calc(100vw-24px)] p-3"
        collisionPadding={12}
        side="bottom"
      >
        <div className="flex items-center justify-between gap-3">
          <p
            className="text-[13px] font-semibold text-txt-primary"
            id={title_id}
          >
            {CHECK_NAME[result.check]}
            <span className="font-normal text-txt-muted">
              {" · "}
              {t(CHECK_PURPOSE[result.check])}
            </span>
          </p>
          <EmailAuthCheckStatus result={result} />
        </div>
        <p
          className="mt-1.5 text-xs leading-relaxed text-txt-secondary"
          id={desc_id}
        >
          {meaning}
        </p>
      </PopoverContent>
    </Popover>
  );
}

const SUMMARY_KEY = {
  authenticated: "mail.email_auth_summary_authenticated",
  unverified: "mail.email_auth_summary_unverified",
  partial: "mail.email_auth_partial_desc",
  failed: "mail.email_auth_failed_desc",
} as const satisfies Record<string, TranslationKey>;

const SUMMARY_COLOR = {
  authenticated: "var(--text-secondary)",
  unverified: "var(--text-secondary)",
  partial: "var(--cat-amber-fg)",
  failed: "var(--cat-rose-fg)",
};

export function EmailAuthDetails({
  results,
  sender_email,
  variant,
}: {
  results: EmailAuthResults;
  sender_email: string;
  variant: Variant;
}) {
  const { t } = use_i18n();
  const summary = summarize_email_authentication(results);
  const domain = display_domain(sender_email) || sender_email;
  const text_size = variant === "mobile" ? "text-[12px]" : "text-[13px]";

  if (!summary) {
    return (
      <p
        className={cn(text_size, "leading-relaxed text-txt-muted")}
        data-auth-summary="unavailable"
      >
        {t("mail.email_auth_summary_unavailable")}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p
        className={cn(text_size, "leading-relaxed [overflow-wrap:anywhere]")}
        data-auth-summary={summary.verdict}
        style={{ color: SUMMARY_COLOR[summary.verdict] }}
      >
        {t(SUMMARY_KEY[summary.verdict], { domain })}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {summary.checks.map((result) => (
          <EmailAuthCheckPill key={result.check} result={result} />
        ))}
      </div>
    </div>
  );
}

export function get_header_insights(
  raw_headers: RawHeader[] | undefined,
  results: EmailAuthResults,
  sender_email: string,
) {
  return {
    reply_to: get_reply_to(raw_headers, sender_email),
    mailing_list: get_mailing_list(raw_headers),
    mailed_by: get_mailed_by(raw_headers),
    signed_by: get_signed_by(raw_headers, results, sender_email),
  };
}

export function ReplyToValue({
  email,
  name,
  other_domain,
}: {
  email: string;
  name?: string;
  other_domain: boolean;
}) {
  const { t } = use_i18n();

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span dir="auto">{name ? `${name} <${email}>` : email}</span>
      {other_domain && (
        <span
          className="inline-flex items-start gap-1 text-xs"
          data-reply-to-warning=""
          style={{ color: "var(--cat-amber-fg)" }}
        >
          <ExclamationTriangleIcon
            aria-hidden="true"
            className="mt-px h-3.5 w-3.5 flex-shrink-0"
          />
          {t("mail.reply_to_other_domain")}
        </span>
      )}
    </span>
  );
}

export function MailingListValue({
  id,
  has_unsubscribe,
}: {
  id: string;
  has_unsubscribe: boolean;
}) {
  const { t } = use_i18n();

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <bdi className="break-all" dir="ltr">
        {id}
      </bdi>
      {has_unsubscribe && (
        <span className="text-xs text-txt-muted">
          {t("mail.list_unsubscribe_available")}
        </span>
      )}
    </span>
  );
}

export function HeadersViewToggle({
  mode,
  on_change,
}: {
  mode: HeadersViewMode;
  on_change: (mode: HeadersViewMode) => void;
}) {
  const { t } = use_i18n();
  const options: Array<[HeadersViewMode, TranslationKey]> = [
    ["formatted", "mail.headers_formatted"],
    ["raw", "mail.headers_raw"],
  ];

  return (
    <div
      aria-label={t("mail.headers_view_label")}
      className="aster_segmented"
      role="group"
    >
      {options.map(([value, key]) => (
        <button
          key={value}
          aria-pressed={mode === value}
          className="aster_segmented_option !min-h-7 !px-2.5 !text-xs"
          type="button"
          onClick={() => on_change(value)}
        >
          {t(key)}
        </button>
      ))}
    </div>
  );
}

const BOX_CLASS =
  "overflow-y-auto overflow-x-hidden rounded-lg bg-[var(--bg-tertiary,var(--surf-tertiary))] p-3 font-mono text-xs leading-relaxed text-txt-secondary whitespace-pre-wrap [overflow-wrap:anywhere] [tab-size:2]";
const LINE_CLASS = "ps-[2ch] -indent-[2ch]";

const FormattedHeaders = memo(function FormattedHeaders({
  raw_headers,
}: {
  raw_headers: RawHeader[];
}) {
  const { t } = use_i18n();
  const headers = useMemo(() => to_display_headers(raw_headers), [raw_headers]);

  return (
    <>
      {headers.map((header, index) => (
        <div
          key={index}
          className={cn(LINE_CLASS, index > 0 && "mt-1.5")}
          data-header-line=""
        >
          {header.has_valid_name ? (
            <>
              <span className="font-semibold text-txt-muted">
                {header.name}:
              </span>
              {header.help && (
                <span className="ms-1 inline-flex indent-0 align-[-2px]">
                  <InfoPopover
                    description={t(HEADER_HELP[header.help])}
                    icon_class="h-3.5 w-3.5"
                    title={header.name}
                  />
                </span>
              )}{" "}
              <span className="text-txt-secondary">
                {header.highlight_results
                  ? segment_auth_value(header.name, header.value).map(
                      (segment, i) =>
                        segment.status ? (
                          <span
                            key={i}
                            className="font-semibold"
                            data-result={segment.status}
                            style={{
                              color: status_color({
                                check: "spf",
                                status: segment.status,
                                value: segment.text,
                              }),
                            }}
                          >
                            {segment.text}
                          </span>
                        ) : (
                          segment.text
                        ),
                    )
                  : header.value}
              </span>
            </>
          ) : (
            `${header.name}: ${header.value}`
          )}
        </div>
      ))}
    </>
  );
});

export function HeadersBox({
  raw_headers,
  text,
  mode,
  className,
}: {
  raw_headers?: RawHeader[] | null;
  text: string;
  mode: HeadersViewMode;
  className?: string;
}) {
  const lines = useMemo(() => text.split("\n"), [text]);
  const formatted = mode === "formatted" && !!raw_headers?.length;

  return (
    <div
      className={cn(BOX_CLASS, className)}
      data-headers-mode={formatted ? "formatted" : "raw"}
      data-testid="message-headers"
    >
      {formatted ? (
        <FormattedHeaders raw_headers={raw_headers!} />
      ) : (
        lines.map((line, index) => (
          <div key={index} className={LINE_CLASS}>
            {line}
          </div>
        ))
      )}
    </div>
  );
}
