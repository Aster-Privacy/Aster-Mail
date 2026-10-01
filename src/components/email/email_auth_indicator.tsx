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
import type { ComponentType, SVGProps } from "react";

import { useId, useRef, useState } from "react";
import {
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/16/solid";
import {
  CheckCircleIcon as CheckCircleOutlineIcon,
  ExclamationTriangleIcon as ExclamationTriangleOutlineIcon,
  MinusCircleIcon as MinusCircleOutlineIcon,
  XCircleIcon as XCircleOutlineIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  summarize_email_authentication,
  type EmailAuthCheck,
  type EmailAuthCheckResult,
  type EmailAuthResults,
  type EmailAuthStatus,
  type EmailAuthVerdict,
} from "@/utils/email_authentication";

interface EmailAuthIndicatorProps {
  results: EmailAuthResults;
  sender_email?: string;
  on_show_details?: () => void;
  className?: string;
}

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// Only results worth a second look get a badge. Mail that passed, or that
// simply lacks checks, gets none: a green mark next to a name the sender
// chooses would reassure a look-alike domain with its own DMARC too.
type ShownVerdict = Extract<EmailAuthVerdict, "partial" | "failed">;

const VERDICT_BADGE: Record<ShownVerdict, "amber" | "red"> = {
  partial: "amber",
  failed: "red",
};

const VERDICT_ICON: Record<ShownVerdict, Icon> = {
  partial: ExclamationTriangleIcon,
  failed: XCircleIcon,
};

const VERDICT_COLOR: Record<ShownVerdict, string> = {
  partial: "var(--cat-amber-fg)",
  failed: "var(--cat-rose-fg)",
};

const VERDICT_LABEL: Record<ShownVerdict, TranslationKey> = {
  partial: "mail.email_auth_partial",
  failed: "mail.email_auth_failed",
};

const VERDICT_DESC: Record<ShownVerdict, TranslationKey> = {
  partial: "mail.email_auth_partial_desc",
  failed: "mail.email_auth_failed_desc",
};

function is_shown(verdict: EmailAuthVerdict): verdict is ShownVerdict {
  return verdict === "partial" || verdict === "failed";
}

export const CHECK_NAME: Record<EmailAuthCheck, string> = {
  spf: "SPF",
  dkim: "DKIM",
  dmarc: "DMARC",
};

const CHECK_PURPOSE: Record<EmailAuthCheck, TranslationKey> = {
  spf: "settings.domain_check_spf_label",
  dkim: "settings.domain_check_dkim_label",
  dmarc: "settings.domain_check_dmarc_label",
};

const STATUS_LABEL: Partial<Record<EmailAuthStatus, TranslationKey>> = {
  pass: "mail.email_auth_status_pass",
  fail: "mail.email_auth_status_fail",
  none: "mail.email_auth_status_none",
  missing: "mail.email_auth_status_missing",
};

const STATUS_ICON: Record<EmailAuthStatus, Icon> = {
  pass: CheckCircleOutlineIcon,
  fail: XCircleOutlineIcon,
  other: ExclamationTriangleOutlineIcon,
  none: MinusCircleOutlineIcon,
  missing: MinusCircleOutlineIcon,
};

const MUTED = "var(--text-secondary)";
const DOMAIN_SLOT = "[[domain]]";
// Short domains stay on one line instead of breaking at a hyphen; long ones
// may wrap anywhere, so every character stays visible.
const NOWRAP_DOMAIN_LENGTH = 36;
// Longer than any host name.
const MAX_DOMAIN_LENGTH = 253;
const BIDI_CONTROLS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const NON_ASCII = /[\u0080-\uffff]/;
// Dot-separated labels of letters, marks, digits and hyphens. Anything else
// (a slash, a colon, an invisible format character) could make the URL
// parser below keep only part of the domain.
const DOMAIN = /^[\p{L}\p{M}\p{N}-]+(?:\.[\p{L}\p{M}\p{N}-]+)*\.?$/u;

// The domain of the From address, as the checks saw it: without bidi
// controls that could reorder it, and in the ASCII (punycode) form DNS
// resolves, so letters from other scripts show up as such. Empty when it
// could not be a host name, which hides the badge rather than show a domain
// the checks did not see.
function display_domain(sender_email?: string): string {
  const email = (sender_email ?? "").replace(BIDI_CONTROLS, "").trim();
  const at = email.lastIndexOf("@");
  const domain =
    at >= 0
      ? email
          .slice(at + 1)
          .trim()
          .replace(/[A-Z]/g, (letter) => letter.toLowerCase())
      : "";

  if (domain.length > MAX_DOMAIN_LENGTH || !DOMAIN.test(domain)) return "";
  if (!NON_ASCII.test(domain)) return domain;

  try {
    const hostname = new URL(`http://${domain}`).hostname;

    return NON_ASCII.test(hostname) ? "" : hostname;
  } catch {
    return "";
  }
}

function status_color(result: EmailAuthCheckResult): string {
  if (result.status === "pass") return "var(--cat-green-fg)";
  if (result.status === "fail") return "var(--cat-rose-fg)";
  if (result.status === "other") return "var(--cat-amber-fg)";

  return MUTED;
}

// The result of one check as an icon and a coloured word, as in the
// popover and in the message details.
export function EmailAuthCheckStatus({
  result,
}: {
  result: EmailAuthCheckResult;
}) {
  const { t } = use_i18n();
  const status_key = STATUS_LABEL[result.status];
  const StatusIcon = STATUS_ICON[result.status];

  return (
    <span
      className="inline-flex flex-shrink-0 items-center gap-1 text-xs font-medium"
      data-status={result.status}
      style={{ color: status_color(result) }}
    >
      <StatusIcon aria-hidden="true" className="w-3.5 h-3.5 flex-shrink-0" />
      <span>{status_key ? t(status_key) : result.value}</span>
    </span>
  );
}

// A badge next to the sender when the SPF, DKIM and DMARC checks Aster ran
// when the message arrived failed or gave unusual results. Opens the result
// of each check, with a way to the message details.
export function EmailAuthIndicator({
  results,
  sender_email,
  on_show_details,
  className = "",
}: EmailAuthIndicatorProps) {
  const { t } = use_i18n();
  const [open, set_open] = useState(false);
  const trigger_ref = useRef<HTMLButtonElement>(null);
  const details_requested = useRef(false);
  const title_id = useId();
  const desc_id = useId();
  const summary = summarize_email_authentication(results);
  const domain = display_domain(sender_email);

  if (!summary || !domain) return null;

  const { verdict, checks } = summary;

  if (!is_shown(verdict)) return null;
  const VerdictIcon = VERDICT_ICON[verdict];
  const verdict_label = t(VERDICT_LABEL[verdict]);
  const label = t("mail.email_auth_label", { verdict: verdict_label });
  const [before, after = ""] = t(VERDICT_DESC[verdict], {
    domain: DOMAIN_SLOT,
  }).split(DOMAIN_SLOT);
  const stop_activation = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") e.stopPropagation();
  };

  return (
    <Popover open={open} onOpenChange={set_open}>
      <PopoverTrigger asChild>
        <button
          ref={trigger_ref}
          aria-label={label}
          className={`inline-flex min-w-0 max-w-full cursor-pointer rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${className}`}
          data-verdict={verdict}
          type="button"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={stop_activation}
        >
          <Badge className="min-w-0 max-w-full" color={VERDICT_BADGE[verdict]}>
            <VerdictIcon
              aria-hidden="true"
              className="w-3.5 h-3.5 flex-shrink-0"
            />
            <span className="-my-0.5 truncate py-0.5">{verdict_label}</span>
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-describedby={desc_id}
        aria-labelledby={title_id}
        className="w-80 max-w-[calc(100vw-24px)] p-3 outline-none"
        collisionPadding={12}
        side="bottom"
        onClick={(e) => e.stopPropagation()}
        onCloseAutoFocus={(e) => {
          // Opening the details only once the popover has handed focus back
          // to the badge lets the modal take focus and return it there.
          if (!details_requested.current) return;
          details_requested.current = false;
          e.preventDefault();
          trigger_ref.current?.focus();
          on_show_details?.();
        }}
        onKeyDown={stop_activation}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <div className="flex items-start gap-2">
          <VerdictIcon
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 flex-shrink-0"
            style={{ color: VERDICT_COLOR[verdict] }}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-txt-primary" id={title_id}>
              {verdict_label}
            </p>
            <p
              className="mt-1 text-[13px] leading-relaxed text-txt-secondary [overflow-wrap:anywhere]"
              id={desc_id}
            >
              {before}
              <bdi
                className={`font-semibold text-txt-primary ${domain.length <= NOWRAP_DOMAIN_LENGTH ? "whitespace-nowrap" : ""}`}
                dir="ltr"
              >
                {domain}
              </bdi>
              {after}
            </p>
          </div>
        </div>
        <ul className="mt-3 space-y-2">
          {checks.map((result) => (
            <li
              key={result.check}
              className="flex items-start justify-between gap-3"
              data-check={result.check}
            >
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-txt-primary">
                  {CHECK_NAME[result.check]}
                </p>
                <p className="text-xs leading-snug text-txt-secondary">
                  {t(CHECK_PURPOSE[result.check])}
                </p>
              </div>
              <EmailAuthCheckStatus result={result} />
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1.5 border-t border-[var(--aster-floating-divider,var(--border-secondary))] pt-2">
          <p className="text-xs leading-snug text-txt-secondary">
            {t("mail.email_auth_source")}
          </p>
          {on_show_details && (
            <button
              className="text-xs font-medium text-blue-700 hover:underline focus:outline-none focus-visible:underline dark:text-blue-400"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                details_requested.current = true;
                set_open(false);
              }}
            >
              {t("mail.message_details")}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
