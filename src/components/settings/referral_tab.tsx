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
import { useState, useEffect, useCallback } from "react";
import {
  UserGroupIcon,
  ClipboardDocumentIcon,
  ArrowPathIcon,
  EnvelopeIcon,
  GiftIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import {
  get_referral_info,
  get_referral_history,
  format_price,
  format_date,
  type ReferralInfo,
  type ReferralHistoryItem,
} from "@/services/api/billing";
import { list_contacts, decrypt_contacts } from "@/services/api/contacts";
import { show_toast } from "@/components/toast/simple_toast";

export function ReferralTab() {
  const { t } = use_i18n();
  const [referral_info, set_referral_info] = useState<ReferralInfo | null>(
    null,
  );
  const [referral_history, set_referral_history] = useState<
    ReferralHistoryItem[]
  >([]);
  const [is_loading, set_is_loading] = useState(true);
  const [is_sending_referral, set_is_sending_referral] = useState(false);

  const handle_send_referral = useCallback(async () => {
    if (!referral_info) return;

    set_is_sending_referral(true);

    try {
      const all_emails: string[] = [];
      let cursor: string | undefined;
      let has_more = true;

      while (has_more) {
        const res = await list_contacts({ limit: 100, cursor });

        if (!res.data?.items?.length) break;

        const decrypted = await decrypt_contacts(res.data.items);

        for (const contact of decrypted) {
          if (contact.emails) {
            all_emails.push(...contact.emails);
          }
        }

        has_more = res.data.has_more;
        cursor = res.data.next_cursor || undefined;
      }

      if (all_emails.length === 0) {
        show_toast(t("settings.referral_no_contacts"), "error");

        return;
      }

      const body_text = t("settings.referral_email_body", {
        referral_link: referral_info.referral_link,
      });

      const body_html = body_text
        .split("\n")
        .map((line: string) => (line.trim() === "" ? "<br>" : `<p>${line}</p>`))
        .join("");

      window.dispatchEvent(
        new CustomEvent("aster:open-compose-prefilled", {
          detail: {
            to: all_emails,
            subject: t("settings.referral_email_subject"),
            body: body_html,
          },
        }),
      );
    } finally {
      set_is_sending_referral(false);
    }
  }, [referral_info, t]);

  const load_data = useCallback(async () => {
    set_is_loading(true);

    try {
      const [info_res, history_res] = await Promise.all([
        get_referral_info(),
        get_referral_history(),
      ]);

      if (info_res.data) {
        set_referral_info(info_res.data);
      }

      if (history_res.data) {
        set_referral_history(history_res.data.referrals);
      }
    } finally {
      set_is_loading(false);
    }
  }, []);

  useEffect(() => {
    load_data();
  }, [load_data]);

  if (is_loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <ArrowPathIcon className="w-5 h-5 animate-spin text-txt-muted" />
      </div>
    );
  }

  if (!referral_info || !referral_info.referral_code) {
    return (
      <div className="text-center py-16">
        <UserGroupIcon className="w-10 h-10 text-txt-muted mx-auto mb-3" />
        <p className="text-sm text-txt-secondary">
          {t("settings.referral_not_eligible")}
        </p>
        <p className="text-xs text-txt-muted mt-1">
          {t("settings.referral_not_eligible_description")}
        </p>
      </div>
    );
  }

  const total_earned_cents =
    (referral_info.credits_earned_cents || 0) +
    (referral_info.commission_earned_cents || 0);

  return (
    <div>
      <p className="text-xs font-semibold tracking-wide uppercase text-txt-muted mb-3">
        {t("settings.referral_program")}
      </p>

      <div
        className="relative overflow-hidden rounded-2xl p-6 mb-5"
        style={{ backgroundColor: "#1d4ed8" }}
      >
        <img
          alt=""
          className="pointer-events-none absolute right-0 top-0 h-full w-1/2 object-cover opacity-60 mix-blend-screen"
          draggable={false}
          src="/settings/decentralized.webp"
          style={{
            maskImage:
              "linear-gradient(to right, transparent, black 35%, black 90%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 35%, black 90%, transparent)",
          }}
        />
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3
              className="text-lg font-bold text-white tracking-tight"
              style={{ textShadow: "0 1px 3px rgba(0, 0, 0, 0.15)" }}
            >
              {t("settings.your_referral_link")}
            </h3>
            <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/15 text-white tabular-nums">
              {format_price(total_earned_cents)} {t("settings.total_earned")}
            </span>
          </div>
          <p
            className="text-sm text-blue-100/70 mb-4 max-w-[420px]"
            style={{ textShadow: "0 1px 2px rgba(0, 0, 0, 0.1)" }}
          >
            {t("settings.referral_program_description")}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 h-9 px-3 rounded-lg bg-black/20 border border-white/10 flex items-center gap-2 min-w-0">
              <GiftIcon className="w-4 h-4 text-white/60 flex-shrink-0" />
              <span className="font-mono text-xs text-white whitespace-nowrap overflow-x-auto">
                {referral_info.referral_link}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="h-9 px-3 rounded-lg text-sm font-semibold bg-white text-blue-900 inline-flex items-center justify-center gap-2 whitespace-nowrap"
                style={{
                  boxShadow:
                    "0 2px 8px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.9) inset",
                }}
                onClick={() => {
                  navigator.clipboard.writeText(referral_info.referral_link);
                  show_toast(t("settings.link_copied"), "success");
                }}
              >
                <ClipboardDocumentIcon className="w-4 h-4" />
                {t("settings.copy_link")}
              </button>
              <button
                type="button"
                disabled={is_sending_referral}
                className="h-9 px-3 rounded-lg text-sm font-semibold bg-white text-blue-900 inline-flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-60"
                style={{
                  boxShadow:
                    "0 2px 8px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.9) inset",
                }}
                onClick={handle_send_referral}
              >
                {is_sending_referral ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <EnvelopeIcon className="w-4 h-4" />
                )}
                {t("settings.send_referral_to_contacts")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="px-3 py-3 rounded-xl border border-edge-secondary text-center">
          <p className="text-2xl font-bold text-txt-primary tabular-nums">
            {referral_info.total_referrals}
          </p>
          <p className="text-xs text-txt-muted mt-0.5">
            {t("settings.total_referrals")}
          </p>
        </div>
        <div className="px-3 py-3 rounded-xl border border-edge-secondary text-center">
          <p className="text-2xl font-bold text-yellow-500 tabular-nums">
            {referral_info.pending_referrals}
          </p>
          <p className="text-xs text-txt-muted mt-0.5">
            {t("settings.pending_referrals")}
          </p>
        </div>
        <div className="px-3 py-3 rounded-xl border border-edge-secondary text-center">
          <p className="text-2xl font-bold text-green-500 tabular-nums">
            {referral_info.completed_referrals}
          </p>
          <p className="text-xs text-txt-muted mt-0.5">
            {t("settings.completed_referrals")}
          </p>
        </div>
      </div>

      <div className="mb-5">
        <p className="text-xs font-medium text-txt-secondary mb-2">
          {t("settings.referral_how_it_works")}
        </p>
        <div className="p-3 rounded-lg bg-surf-tertiary border border-edge-secondary">
          <ol className="space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 border border-edge-secondary text-txt-secondary">
                1
              </span>
              <span className="text-sm text-txt-secondary">
                {t("settings.referral_step_share")}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 border border-edge-secondary text-txt-secondary">
                2
              </span>
              <span className="text-sm text-txt-secondary">
                {t("settings.referral_step_signup")}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 border border-edge-secondary text-txt-secondary">
                3
              </span>
              <span className="text-sm text-txt-secondary">
                {t("settings.referral_step_earn")}
              </span>
            </li>
          </ol>
        </div>
      </div>

      <div className="mb-5">
        <p className="text-xs font-medium text-txt-secondary mb-2">
          {t("settings.referral_rewards")}
        </p>
        <div className="rounded-lg border border-edge-secondary p-4 space-y-2 bg-surf-tertiary">
          <p className="text-sm text-txt-secondary">
            {t("settings.referral_reward_info")}
          </p>
          <p className="text-sm text-txt-secondary">
            {t("settings.referral_commission_info", {
              percent: String(referral_info.commission_percent || 5),
            })}
          </p>
          {referral_info.max_credits_cents > 0 && (
            <div className="pt-1">
              <div className="h-1.5 rounded-full bg-txt-primary/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-txt-primary transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      (total_earned_cents / referral_info.max_credits_cents) *
                        100,
                    )}%`,
                  }}
                />
              </div>
              <p className="text-xs text-txt-muted mt-1.5">
                {t("settings.referral_max_credits", {
                  value: format_price(referral_info.max_credits_cents),
                })}
              </p>
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-txt-secondary mb-2">
          {t("settings.referral_history")}
        </p>
        {referral_history.length > 0 ? (
          <div className="rounded-xl border overflow-hidden border-edge-secondary">
            {referral_history.map((ref_item) => (
              <div
                key={ref_item.id}
                className="flex items-center justify-between px-4 py-3 border-b border-edge-secondary last:border-b-0 hover:bg-surf-hover transition-colors"
              >
                <div>
                  <p className="text-sm text-txt-primary">
                    {ref_item.referee_email_masked}
                  </p>
                  <p className="text-xs mt-0.5 text-txt-muted">
                    {format_date(ref_item.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      ref_item.status === "completed"
                        ? "bg-green-500/15 text-green-500"
                        : "bg-yellow-500/15 text-yellow-500"
                    }`}
                  >
                    {ref_item.status === "completed"
                      ? t("settings.referral_status_completed")
                      : t("settings.referral_status_pending")}
                  </span>
                  {ref_item.referrer_credit_cents > 0 && (
                    <p className="text-sm font-medium text-green-500">
                      +{format_price(ref_item.referrer_credit_cents)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-edge-secondary py-8 text-center">
            <UserGroupIcon className="w-8 h-8 text-txt-muted mx-auto mb-2" />
            <p className="text-xs text-txt-muted">
              {t("settings.no_referrals_yet")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
