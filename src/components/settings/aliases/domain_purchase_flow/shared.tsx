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
import type { ApiErrorCode } from "@/services/api/client";

import {
  CheckCircleIcon as CheckCircleSolid,
  XCircleIcon as XCircleSolid,
} from "@heroicons/react/24/solid";
import { Badge, Tooltip } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import {
  format_domain_price,
  type DomainSearchResult,
} from "@/services/api/domains";
import { ignore_error } from "@/lib/ignore_error";

export type PurchaseView = "search" | "confirm" | "progress";

export const TERMINAL_ORDER_STATUSES = new Set([
  "complete",
  "failed",
  "refund_pending",
  "refunded",
  "expired",
  "lapsed",
]);

export function checkout_error_key(code?: ApiErrorCode, server_code?: string) {
  if (server_code === "PLAN_LIMIT_EXCEEDED")
    return "settings.domain_purchase_error_limit" as const;
  if (server_code === "SERVICE_UNAVAILABLE")
    return "settings.domain_purchase_error_paused" as const;
  if (code === "CONFLICT")
    return "settings.domain_purchase_error_taken" as const;
  if (code === "FORBIDDEN")
    return "settings.domain_purchase_error_not_allowed" as const;
  if (code === "RATE_LIMIT_EXCEEDED")
    return "settings.domain_purchase_error_slow_down" as const;

  return "settings.domain_purchase_error" as const;
}

export interface DomainPurchaseFlowProps {
  initial_order_id?: string | null;
  initial_query?: string | null;
  on_done: () => void;
  on_purchased: () => void;
  on_create_address?: () => void;
}

export const TERMS_LINKS: {
  key: "aster" | "registrar" | "icann";
  url: string;
}[] = [
  { key: "aster", url: "https://astermail.org/terms" },
  {
    key: "registrar",
    url: "https://www.namesilo.com/support/v2/articles/general-terms/terms-and-conditions",
  },
  {
    key: "icann",
    url: "https://www.icann.org/resources/pages/benefits-2013-09-16-en",
  },
];

export function use_terms_labels() {
  const { t } = use_i18n();

  return {
    aster: t("settings.domain_purchase_terms_aster"),
    registrar: t("settings.domain_purchase_terms_registrar"),
    icann: t("settings.domain_purchase_terms_icann"),
  };
}

export function TermsSentence({
  on_external,
}: {
  on_external: (url: string) => void;
}) {
  const { t } = use_i18n();
  const terms_labels = use_terms_labels();
  const sentence = t("settings.domain_purchase_terms_inline");
  const parts = sentence.split(
    /(\{\{aster\}\}|\{\{registrar\}\}|\{\{icann\}\})/g,
  );

  return (
    <p className="text-xs leading-relaxed text-txt-muted">
      {parts.map((part, index) => {
        const link = TERMS_LINKS.find(({ key }) => part === `{{${key}}}`);

        if (!link) {
          return <span key={index}>{part}</span>;
        }

        return (
          <button
            key={index}
            className="inline text-start text-txt-muted underline underline-offset-2 decoration-txt-muted/30 transition-colors hover:text-[var(--accent-color)] hover:decoration-current"
            onClick={() => on_external(link.url)}
          >
            {terms_labels[link.key]}
          </button>
        );
      })}
    </p>
  );
}

export function ResultRow({
  result,
  primary,
  on_select,
}: {
  result: DomainSearchResult;
  primary?: boolean;
  on_select: (r: DomainSearchResult) => void;
}) {
  const { t } = use_i18n();
  const available = result.available && result.price_cents !== null;

  return (
    <button
      className={`w-full flex items-center justify-between gap-3 px-3 h-[52px] text-start transition-colors rounded-xl ${
        available ? "hover:bg-surf-secondary" : "cursor-default"
      }`}
      disabled={!available}
      onClick={() => on_select(result)}
    >
      <span className="flex items-center gap-2.5 min-w-0">
        {available ? (
          <CheckCircleSolid
            className="w-[18px] h-[18px] flex-shrink-0"
            style={{ color: "var(--color-success)" }}
          />
        ) : (
          <XCircleSolid
            className="w-[18px] h-[18px] flex-shrink-0"
            style={{ color: "var(--color-danger)" }}
          />
        )}
        <span
          className={`truncate ${
            available
              ? primary
                ? "text-[16px] font-semibold text-txt-primary"
                : "text-[15px] text-txt-primary"
              : "text-[15px] text-txt-muted line-through decoration-[var(--color-danger)]/40"
          }`}
        >
          {result.domain}
        </span>
        {available &&
          result.renewal_price_cents !== null &&
          result.price_cents !== null &&
          result.renewal_price_cents > result.price_cents &&
          Math.round(
            (1 - result.price_cents / result.renewal_price_cents) * 100,
          ) >= 5 && (
            <span className="flex-shrink-0">
              <Tooltip
                tip={t("settings.domain_purchase_discount_tooltip", {
                  price: format_domain_price(
                    result.renewal_price_cents,
                    result.currency,
                  ),
                })}
              >
                <Badge color="green">
                  -
                  {Math.round(
                    (1 - result.price_cents / result.renewal_price_cents) * 100,
                  )}
                  %
                </Badge>
              </Tooltip>
            </span>
          )}
      </span>
      {available ? (
        <span className="flex items-center gap-3 min-w-0">
          <span className="text-end flex-shrink-0 flex flex-col justify-center leading-tight">
            <span>
              <span className="block text-[15px] font-medium text-[var(--accent-color)]">
                {t("settings.domain_purchase_per_year", {
                  price: format_domain_price(
                    result.price_cents,
                    result.currency,
                  ),
                })}
              </span>
              {result.renewal_price_cents !== null &&
                result.renewal_price_cents !== result.price_cents && (
                  <span className="hidden sm:block text-[11px] text-txt-muted">
                    {t("settings.domain_purchase_renews_at", {
                      price: format_domain_price(
                        result.renewal_price_cents,
                        result.currency,
                      ),
                    })}
                  </span>
                )}
            </span>
          </span>
          {primary && (
            <span className="hidden sm:inline-block px-4 py-1.5 rounded-full text-[13px] font-semibold text-[var(--accent-fg,#ffffff)] bg-[var(--accent-color)]">
              {t("common.continue")}
            </span>
          )}
        </span>
      ) : (
        <span
          className="text-[13px] font-medium flex-shrink-0"
          style={{ color: "var(--color-danger)" }}
        >
          {t("settings.domain_purchase_taken")}
        </span>
      )}
    </button>
  );
}

export const CHECKOUT_KEY = "alias_domains_purchase_checkout";

export type checkout_draft = {
  selected: DomainSearchResult;
  years: number;
  payment_method: "stripe" | "crypto";
};

export function read_checkout_draft(): checkout_draft | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_KEY);

    if (!raw) return null;
    const parsed = JSON.parse(raw) as checkout_draft;

    if (!parsed?.selected?.domain) return null;

    return {
      selected: parsed.selected,
      years: parsed.years >= 1 && parsed.years <= 3 ? parsed.years : 1,
      payment_method: parsed.payment_method === "crypto" ? "crypto" : "stripe",
    };
  } catch {
    return null;
  }
}

export function write_checkout_draft(draft: checkout_draft | null) {
  try {
    if (!draft) sessionStorage.removeItem(CHECKOUT_KEY);
    else sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(draft));
  } catch (caught) {
    ignore_error(
      "components/settings/aliases/domain_purchase_flow/shared:write_checkout_draft",
      caught,
    );
  }
}

export function SkeletonRows() {
  return (
    <div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between px-3 h-[52px]"
        >
          <div className="flex items-center gap-3 animate-pulse">
            <div className="w-4 h-4 rounded-full bg-surf-tertiary" />
            <div
              className="h-3.5 rounded-full bg-surf-tertiary"
              style={{ width: `${150 + (i % 3) * 40}px` }}
            />
          </div>
          <div className="h-3.5 w-16 rounded-full bg-surf-tertiary animate-pulse" />
        </div>
      ))}
    </div>
  );
}
