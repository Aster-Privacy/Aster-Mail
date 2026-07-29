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
  BanknotesIcon,
  ClockIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@aster/ui";
import { StatRing, SemicircleGauge } from "@/components/settings/stat_ring";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";
import { InfoHint } from "@/components/settings/aliases/info_hint";
import {
  get_referral_info,
  get_referral_history,
  get_my_referral_status,
  get_my_affiliate_status,
  request_affiliate_payout,
  list_my_affiliate_payout_requests,
  build_referral_invite_url,
  format_price,
  format_date,
  type ReferralInfo,
  type ReferralHistoryItem,
  type MyReferralStatus,
  type MyAffiliateStatus,
  type MyAffiliatePayoutRequestItem,
} from "@/services/api/billing";
import { list_contacts, decrypt_contacts } from "@/services/api/contacts";
import { show_toast } from "@/components/toast/simple_toast";

const AFFILIATE_MIN_PAYOUT_CENTS = 500;

async function get_all_contact_emails(): Promise<string[]> {
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

  return all_emails;
}


export function ReferralTab() {
  const { t } = use_i18n();
  const [referral_info, set_referral_info] = useState<ReferralInfo | null>(
    null,
  );
  const [referral_history, set_referral_history] = useState<
    ReferralHistoryItem[]
  >([]);
  const [my_referral_status, set_my_referral_status] =
    useState<MyReferralStatus | null>(null);
  const [my_affiliate_status, set_my_affiliate_status] =
    useState<MyAffiliateStatus | null>(null);
  const [is_loading, set_is_loading] = useState(true);
  const [is_sending_referral, set_is_sending_referral] = useState(false);
  const [is_sending_affiliate_link, set_is_sending_affiliate_link] =
    useState(false);
  const [is_requesting_payout, set_is_requesting_payout] = useState(false);
  const [payout_history, set_payout_history] = useState<
    MyAffiliatePayoutRequestItem[]
  >([]);
  const [payout_amount_input, set_payout_amount_input] = useState("");
  const [payout_amount_touched, set_payout_amount_touched] = useState(false);
  const [is_irs_confirm_open, set_is_irs_confirm_open] = useState(false);

  useEffect(() => {
    if (payout_amount_touched || !my_affiliate_status) return;

    set_payout_amount_input(
      (my_affiliate_status.outstanding_cents / 100).toFixed(2),
    );
  }, [my_affiliate_status, payout_amount_touched]);

  const handle_request_payout = useCallback(async () => {
    if (!my_affiliate_status) return;

    if (my_affiliate_status.outstanding_cents <= 0) {
      show_toast(t("settings.affiliate_nothing_owed"), "error");
      return;
    }

    const requested_cents = Math.round(
      parseFloat(payout_amount_input) * 100,
    );

    if (!Number.isFinite(requested_cents) || requested_cents <= 0) {
      show_toast(t("settings.affiliate_payout_amount_invalid"), "error");
      return;
    }

    if (requested_cents < AFFILIATE_MIN_PAYOUT_CENTS) {
      show_toast(
        t("settings.affiliate_payout_amount_below_minimum"),
        "error",
      );
      return;
    }

    if (requested_cents > my_affiliate_status.outstanding_cents) {
      show_toast(t("settings.affiliate_payout_amount_exceeds"), "error");
      return;
    }

    set_is_requesting_payout(true);

    try {
      const res = await request_affiliate_payout(requested_cents);

      if (!res.data) {
        show_toast(t("settings.affiliate_payout_request_failed"), "error");
        return;
      }

      const body_text = t("settings.affiliate_payout_email_body", {
        request_id: res.data.short_code,
        commission_percent: String(my_affiliate_status.commission_percent),
        total_earned: format_price(my_affiliate_status.total_earned_cents),
        total_paid_out: format_price(my_affiliate_status.total_paid_out_cents),
        outstanding: format_price(res.data.amount_cents),
      });

      const body_html = body_text
        .split("\n")
        .map((line: string) => (line.trim() === "" ? "<br>" : `<p>${line}</p>`))
        .join("");

      window.dispatchEvent(
        new CustomEvent("aster:open-compose-prefilled", {
          detail: {
            to: ["hello@astermail.org"],
            subject: t("settings.affiliate_payout_email_subject"),
            body: body_html,
          },
        }),
      );

      show_toast(t("settings.affiliate_template_copied"), "success");
      set_payout_amount_touched(false);

      const [history_res, status_res] = await Promise.all([
        list_my_affiliate_payout_requests(),
        get_my_affiliate_status(),
      ]);

      if (history_res.data) {
        set_payout_history(history_res.data);
      }
      if (status_res.data) {
        set_my_affiliate_status(status_res.data);
      }
    } finally {
      set_is_requesting_payout(false);
    }
  }, [my_affiliate_status, payout_amount_input, t]);

  const handle_send_referral = useCallback(async () => {
    if (!referral_info) return;

    set_is_sending_referral(true);

    try {
      const all_emails = await get_all_contact_emails();

      if (all_emails.length === 0) {
        show_toast(t("settings.referral_no_contacts"), "error");

        return;
      }

      const body_text = t("settings.referral_email_body", {
        referral_link: build_referral_invite_url(referral_info.referral_code),
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

  const handle_send_affiliate_link = useCallback(async () => {
    if (!referral_info) return;

    set_is_sending_affiliate_link(true);

    try {
      const all_emails = await get_all_contact_emails();

      if (all_emails.length === 0) {
        show_toast(t("settings.referral_no_contacts"), "error");

        return;
      }

      const body_text = t("settings.referral_email_body", {
        referral_link: build_referral_invite_url(referral_info.referral_code),
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
      set_is_sending_affiliate_link(false);
    }
  }, [referral_info, t]);

  const load_data = useCallback(async () => {
    set_is_loading(true);

    try {
      const [
        info_res,
        history_res,
        my_status_res,
        affiliate_status_res,
        payout_history_res,
      ] = await Promise.all([
        get_referral_info(),
        get_referral_history(),
        get_my_referral_status(),
        get_my_affiliate_status(),
        list_my_affiliate_payout_requests(),
      ]);

      if (info_res.data) {
        set_referral_info(info_res.data);
      }

      if (history_res.data) {
        set_referral_history(history_res.data.referrals);
      }

      if (my_status_res.data) {
        set_my_referral_status(my_status_res.data);
      }

      if (affiliate_status_res.data) {
        set_my_affiliate_status(affiliate_status_res.data);
      }

      if (payout_history_res.data) {
        set_payout_history(payout_history_res.data);
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

  const my_discount_section = my_referral_status?.was_referred ? (
    <div className="mb-5">
      <p className="text-xs font-medium text-txt-secondary mb-2">
        {t("settings.referral_your_discount")}
      </p>
      <div className="rounded-lg border border-edge-secondary p-4 bg-surf-tertiary">
        {my_referral_status.discount_redeemed_at ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/15 text-green-500">
              {t("settings.referral_discount_redeemed")}
            </span>
          </div>
        ) : my_referral_status.discount_promo_code ? (
          <>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/15 text-green-500">
                {t("settings.referral_discount_active")}
              </span>
              <span className="font-mono text-xs text-txt-secondary">
                {my_referral_status.discount_promo_code}
              </span>
            </div>
            <p className="text-xs text-txt-muted">
              {t("settings.referral_discount_auto_apply")}
            </p>
            {my_referral_status.discount_expires_at && (
              <p className="text-xs text-txt-muted mt-1">
                {t("settings.referral_discount_expires", {
                  date: format_date(my_referral_status.discount_expires_at),
                })}
              </p>
            )}
          </>
        ) : (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-txt-primary/10 text-txt-muted">
            {t("settings.referral_discount_expired")}
          </span>
        )}
      </div>
    </div>
  ) : null;

  const affiliate_total_for_ratio = Math.max(
    my_affiliate_status?.total_earned_cents ?? 0,
    1,
  );

  const AFFILIATE_MONTHLY_CAP_CENTS = 500_000;
  const affiliate_days_until_reset = (() => {
    const now = new Date();
    const next_month_start = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
    );
    return Math.max(
      1,
      Math.ceil(
        (next_month_start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );
  })();
  const affiliate_cap_percent = my_affiliate_status
    ? Math.min(
        100,
        (my_affiliate_status.earned_this_month_cents /
          AFFILIATE_MONTHLY_CAP_CENTS) *
          100,
      )
    : 0;

  const affiliate_section = my_affiliate_status?.is_affiliate ? (
    <div className="mb-5">
      <p className="text-xs font-semibold tracking-wide uppercase text-txt-muted mb-3">
        {t("settings.affiliate_program")}
      </p>
      <div className="rounded-2xl border border-edge-secondary p-5 bg-surf-tertiary">
        <div className="flex items-start gap-2.5 mb-5">
          <BanknotesIcon className="w-5 h-5 text-green-500 flex-shrink-0 mt-2" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-txt-primary">
                {t("settings.affiliate_status_title")}
              </h3>
              <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-green-500/15 text-green-500">
                {t("settings.affiliate_brand_badge")}
              </span>
            </div>
            <p className="text-xs text-txt-muted mt-0.5">
              {t("settings.affiliate_status_description", {
                percent: String(my_affiliate_status.commission_percent),
              })}
            </p>
          </div>
        </div>

        {referral_info?.referral_code && (
          <div className="mb-5">
            <p className="text-xs font-medium text-txt-secondary mb-2">
              {t("settings.affiliate_your_link_label")}
            </p>
            <div className="h-9 px-3 rounded-lg bg-surf-secondary border border-edge-secondary flex items-center gap-2 min-w-0">
              <GiftIcon className="w-4 h-4 text-txt-muted flex-shrink-0" />
              <span className="flex-1 font-mono text-xs text-txt-secondary whitespace-nowrap overflow-x-auto">
                {build_referral_invite_url(referral_info.referral_code)}
              </span>
              <button
                type="button"
                className="flex-shrink-0 h-7 px-2.5 rounded-md text-xs font-semibold bg-blue-600 text-white inline-flex items-center justify-center gap-1.5 whitespace-nowrap hover:bg-blue-700 transition-colors"
                onClick={() => {
                  navigator.clipboard.writeText(
                    build_referral_invite_url(referral_info.referral_code),
                  );
                  show_toast(t("settings.link_copied"), "success");
                }}
              >
                <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                {t("settings.copy_link")}
              </button>
              <button
                type="button"
                disabled={is_sending_affiliate_link}
                className="flex-shrink-0 h-7 px-2.5 rounded-md text-xs font-semibold bg-surf-tertiary border border-edge-secondary text-txt-secondary inline-flex items-center justify-center gap-1.5 whitespace-nowrap hover:bg-surf-primary transition-colors disabled:opacity-60"
                onClick={handle_send_affiliate_link}
              >
                {is_sending_affiliate_link ? (
                  <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <EnvelopeIcon className="w-3.5 h-3.5" />
                )}
                {t("settings.affiliate_email_link_button")}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col items-center mb-5">
          <SemicircleGauge
            percent={affiliate_cap_percent}
            bottom_label={`${t("settings.affiliate_total_earned")} ${format_price(
              my_affiliate_status.earned_this_month_cents,
            )}`}
          />
          <div className="flex items-center gap-1 mt-1">
            <p className="text-xs text-txt-muted">
              {t("settings.affiliate_lifetime_cap", {
                value: format_price(AFFILIATE_MONTHLY_CAP_CENTS),
              })}
            </p>
            <InfoHint
              title={t("settings.affiliate_info_hint_cap_title")}
              tip={t("settings.affiliate_info_hint_cap", {
                value: format_price(AFFILIATE_MONTHLY_CAP_CENTS),
                days: String(affiliate_days_until_reset),
              })}
            />
          </div>
          <p className="text-[11px] text-txt-muted mt-0.5">
            {t("settings.affiliate_cap_resets_in", {
              days: String(affiliate_days_until_reset),
            })}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="relative">
            <StatRing
              color_class="text-green-500"
              display_value={format_price(
                my_affiliate_status.total_paid_out_cents,
              )}
              icon={CheckCircleIcon}
              label={t("settings.affiliate_paid_out")}
              max={affiliate_total_for_ratio}
              value={my_affiliate_status.total_paid_out_cents}
            />
            <div className="absolute top-2 right-2">
              <InfoHint
              title={t("settings.affiliate_info_hint_paid_out_title")}
              tip={t("settings.affiliate_info_hint_paid_out")}
            />
            </div>
          </div>
          <div className="relative">
            <StatRing
              color_class="text-yellow-500"
              display_value={format_price(my_affiliate_status.outstanding_cents)}
              icon={ClockIcon}
              label={t("settings.affiliate_amount_owed")}
              max={affiliate_total_for_ratio}
              value={my_affiliate_status.outstanding_cents}
            />
            <div className="absolute top-2 right-2">
              <InfoHint
              title={t("settings.affiliate_info_hint_owed_title")}
              tip={t("settings.affiliate_info_hint_owed")}
            />
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-surf-secondary border border-edge-secondary p-3">
          <p className="text-xs text-txt-secondary mb-2">
            {t("settings.affiliate_payout_instructions")}
          </p>
          <label className="text-[11px] font-medium text-txt-muted mb-1 block">
            {t("settings.affiliate_payout_amount_label")}
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-[120px]">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-txt-muted">
                $
              </span>
              <input
                type="number"
                min="5.00"
                step="0.01"
                max={my_affiliate_status.outstanding_cents / 100}
                value={payout_amount_input}
                onChange={(e) => {
                  set_payout_amount_touched(true);
                  set_payout_amount_input(e.target.value);
                }}
                onBlur={(e) => {
                  const parsed = parseFloat(e.target.value);
                  if (Number.isFinite(parsed)) {
                    set_payout_amount_input(parsed.toFixed(2));
                  }
                }}
                disabled={
                  is_requesting_payout ||
                  my_affiliate_status.outstanding_cents <= 0
                }
                className="h-9 w-full pl-5 pr-2 rounded-lg bg-surf-primary border border-edge-secondary text-sm text-txt-primary disabled:opacity-50"
              />
            </div>
            <button
              type="button"
              disabled={
                is_requesting_payout ||
                my_affiliate_status.outstanding_cents <= 0
              }
              className="h-9 px-2.5 rounded-lg text-xs font-semibold border border-edge-secondary text-txt-secondary hover:bg-surf-tertiary transition-colors disabled:opacity-50"
              onClick={() => {
                set_payout_amount_touched(true);
                set_payout_amount_input(
                  (my_affiliate_status.outstanding_cents / 100).toFixed(2),
                );
              }}
            >
              {t("settings.affiliate_payout_amount_max")}
            </button>
            <button
              type="button"
              className="h-9 px-3 rounded-lg text-sm font-semibold bg-blue-600 text-white inline-flex items-center justify-center gap-2 whitespace-nowrap hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handle_request_payout}
              disabled={
                is_requesting_payout ||
                my_affiliate_status.outstanding_cents <= 0
              }
            >
              {is_requesting_payout ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <BanknotesIcon className="w-4 h-4" />
              )}
              {t("settings.affiliate_copy_template")}
            </button>
          </div>
          <p className="text-[11px] text-txt-muted mt-2">
            {t("settings.affiliate_payout_processing_note")}
          </p>
        </div>

        <div className="mt-5">
          <p className="text-xs font-medium text-txt-secondary mb-2">
            {t("settings.affiliate_payout_history_title")}
          </p>
          {payout_history.length === 0 ? (
            <p className="text-xs text-txt-muted rounded-lg border border-edge-secondary px-3 py-2.5 bg-surf-secondary">
              {t("settings.affiliate_payout_history_empty")}
            </p>
          ) : (
            <div className="rounded-lg border border-edge-secondary divide-y divide-edge-secondary overflow-hidden">
              {payout_history.map((item) => {
                const status_label =
                  item.status === "accepted"
                    ? t("settings.affiliate_payout_status_accepted")
                    : item.status === "rejected"
                      ? t("settings.affiliate_payout_status_rejected")
                      : t("settings.affiliate_payout_status_pending");
                const status_class =
                  item.status === "accepted"
                    ? "bg-green-500/15 text-green-500"
                    : item.status === "rejected"
                      ? "bg-red-500/15 text-red-500"
                      : "bg-yellow-500/15 text-yellow-500";

                return (
                  <div
                    key={item.short_code}
                    className="flex items-center justify-between px-3 py-2.5 bg-surf-secondary"
                  >
                    <div>
                      <p className="text-sm font-semibold text-txt-primary tabular-nums">
                        {format_price(item.amount_cents)}
                      </p>
                      <p className="text-[11px] text-txt-muted mt-0.5">
                        {t("settings.affiliate_payout_requested_on", {
                          date: format_date(item.created_at),
                        })}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${status_class}`}
                    >
                      {status_label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-5">
          <p className="text-xs font-medium text-txt-secondary mb-2">
            {t("settings.affiliate_info_title")}
          </p>
          <div className="p-3 rounded-lg bg-surf-secondary border border-edge-secondary">
            <ol className="space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 border border-edge-secondary text-txt-secondary">
                  1
                </span>
                <span className="text-sm text-txt-secondary">
                  {t("settings.affiliate_info_step_commission", {
                    percent: String(my_affiliate_status.commission_percent),
                  })}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 border border-edge-secondary text-txt-secondary">
                  2
                </span>
                <span className="text-sm text-txt-secondary">
                  {t("settings.affiliate_info_step_cap", {
                    value: format_price(AFFILIATE_MONTHLY_CAP_CENTS),
                  })}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 border border-edge-secondary text-txt-secondary">
                  3
                </span>
                <span className="text-sm text-txt-secondary">
                  {t("settings.affiliate_info_step_payout")}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 border border-edge-secondary text-txt-secondary">
                  4
                </span>
                <span className="text-sm text-txt-secondary">
                  {t("settings.affiliate_info_step_disclosure")}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 border border-edge-secondary text-txt-secondary">
                  5
                </span>
                <span className="text-sm text-txt-secondary">
                  {t("settings.affiliate_info_step_tax")}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 border border-edge-secondary text-txt-secondary">
                  6
                </span>
                <span className="text-sm text-txt-secondary">
                  {t("settings.affiliate_info_step_tax_reporting")}{" "}
                  <button
                    type="button"
                    onClick={() => set_is_irs_confirm_open(true)}
                    className="text-xs text-brand hover:underline whitespace-nowrap"
                  >
                    {t("common.learn_more")}
                  </button>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5 border border-edge-secondary text-txt-secondary">
                  7
                </span>
                <span className="text-sm text-txt-secondary">
                  {t("settings.affiliate_info_step_account_binding")}
                </span>
              </li>
            </ol>
            <p className="text-[11px] text-txt-muted mt-3 pt-3 border-t border-edge-secondary">
              {t("settings.affiliate_info_footer_note")}
            </p>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  if (!referral_info || !referral_info.referral_code) {
    return (
      <div>
        {affiliate_section}
        {my_discount_section}
        <div className="text-center py-16">
          <UserGroupIcon className="w-10 h-10 text-txt-muted mx-auto mb-3" />
          <p className="text-sm text-txt-secondary">
            {t("settings.referral_not_eligible")}
          </p>
          <p className="text-xs text-txt-muted mt-1">
            {t("settings.referral_not_eligible_description")}
          </p>
        </div>
      </div>
    );
  }

  const total_earned_cents =
    (referral_info.credits_earned_cents || 0) +
    (referral_info.commission_earned_cents || 0);

  return (
    <div>
      {affiliate_section}

      <p className="text-xs font-semibold tracking-wide uppercase text-txt-muted mb-3">
        {t("settings.referral_program")}
      </p>

      {!my_affiliate_status?.is_affiliate && (
        <div
          className="relative overflow-hidden rounded-2xl p-6 mb-5"
          style={{ backgroundColor: "var(--accent-mix-b85, #326fd1)" }}
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
                {format_price(total_earned_cents)}{" "}
                {t("settings.total_earned")}
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
                  {build_referral_invite_url(referral_info.referral_code)}
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
                    navigator.clipboard.writeText(
                      build_referral_invite_url(referral_info.referral_code),
                    );
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
      )}

      {my_discount_section}

      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatRing
          color_class="text-txt-secondary"
          icon={UserGroupIcon}
          label={t("settings.total_referrals")}
          max={referral_info.total_referrals}
          value={referral_info.total_referrals}
        />
        <StatRing
          color_class="text-yellow-500"
          icon={ClockIcon}
          label={t("settings.pending_referrals")}
          max={referral_info.total_referrals}
          value={referral_info.pending_referrals}
        />
        <StatRing
          color_class="text-green-500"
          icon={CheckCircleIcon}
          label={t("settings.completed_referrals")}
          max={referral_info.total_referrals}
          value={referral_info.completed_referrals}
        />
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

      {!my_affiliate_status?.is_affiliate && (
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
                percent: String(referral_info.commission_percent || 10),
              })}
            </p>
            {referral_info.max_credits_cents > 0 && (
              <div className="pt-2 flex flex-col items-center">
                <SemicircleGauge
                  percent={
                    (total_earned_cents / referral_info.max_credits_cents) *
                    100
                  }
                  bottom_label={`${t("settings.referral_gauge_earned_label")} ${format_price(total_earned_cents)}`}
                />
                <p className="text-xs text-txt-muted mt-2 text-center">
                  {t("settings.referral_max_credits", {
                    value: format_price(referral_info.max_credits_cents),
                  })}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

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

      <Modal
        is_open={is_irs_confirm_open}
        on_close={() => set_is_irs_confirm_open(false)}
        show_close_button
        size="sm"
      >
        <ModalHeader>
          <ModalTitle>{t("settings.affiliate_learn_more_irs_confirm_title")}</ModalTitle>
          <ModalDescription>
            {t("settings.affiliate_learn_more_irs_confirm")}
          </ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => set_is_irs_confirm_open(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              set_is_irs_confirm_open(false);
              window.open(
                "https://www.irs.gov/instructions/i1099mec",
                "_blank",
                "noopener,noreferrer",
              );
            }}
          >
            {t("common.continue")}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
