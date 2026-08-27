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
  ShareIcon,
  QrCodeIcon,
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
  claim_referral_code,
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
import { open_external } from "@/utils/open_link";
import { copy_text } from "@/utils/copy_text";
import { ignore_error } from "@/lib/ignore_error";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { RoundedQrCode } from "@/components/ui/rounded_qr_code";
import { format_bytes } from "@/lib/utils";
import { share_invite, copy_invite_link } from "@/lib/referral_share";
import { invalidate_referral_summary } from "@/hooks/use_referral_summary";

const AFFILIATE_MIN_PAYOUT_CENTS = 500;

async function get_all_contact_emails(): Promise<string[]> {
  const all_emails: string[] = [];
  let cursor: string | undefined;
  let has_more = true;

  while (has_more) {
    const res = await list_contacts({ limit: 100, cursor });

    if (!res.data) throw new Error("list_contacts failed");

    if (!res.data.items?.length) break;

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
  const { user } = use_auth();
  const [info_load_failed, set_info_load_failed] = useState(false);
  const [history_load_failed, set_history_load_failed] = useState(false);
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
  const [is_qr_visible, set_is_qr_visible] = useState(false);
  const [is_sharing, set_is_sharing] = useState(false);
  const [claim_input, set_claim_input] = useState("");
  const [is_claiming, set_is_claiming] = useState(false);

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

    const requested_cents = Math.round(parseFloat(payout_amount_input) * 100);

    if (!Number.isFinite(requested_cents) || requested_cents <= 0) {
      show_toast(t("settings.affiliate_payout_amount_invalid"), "error");

      return;
    }

    if (requested_cents < AFFILIATE_MIN_PAYOUT_CENTS) {
      show_toast(t("settings.affiliate_payout_amount_below_minimum"), "error");

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
        commission_percent: my_affiliate_status.commission_percent,
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
            to: user?.email ? [user.email] : [],
            bcc: all_emails,
            subject: t("settings.referral_email_subject"),
            body: body_html,
          },
        }),
      );
    } catch (caught) {
      ignore_error(
        "components/settings/referral_tab:handle_send_referral",
        caught,
      );
      show_toast(t("common.something_went_wrong_try_again"), "error");
    } finally {
      set_is_sending_referral(false);
    }
  }, [referral_info, t, user]);

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
            to: user?.email ? [user.email] : [],
            bcc: all_emails,
            subject: t("settings.referral_email_subject"),
            body: body_html,
          },
        }),
      );
    } catch (caught) {
      ignore_error(
        "components/settings/referral_tab:handle_send_affiliate_link",
        caught,
      );
      show_toast(t("common.something_went_wrong_try_again"), "error");
    } finally {
      set_is_sending_affiliate_link(false);
    }
  }, [referral_info, t, user]);

  const handle_claim = useCallback(async () => {
    const code = claim_input.trim();

    if (!code) return;

    set_is_claiming(true);

    try {
      const res = await claim_referral_code(code);

      if (res.data?.accepted) {
        set_claim_input("");
        show_toast(t("settings.referral_claim_success"), "success");
        invalidate_referral_summary();

        const status_res = await get_my_referral_status();

        if (status_res.data) set_my_referral_status(status_res.data);

        return;
      }

      const messages: Record<string, string> = {
        REFERRAL_CODE_INVALID: t("settings.referral_claim_invalid"),
        REFERRAL_CLAIM_WINDOW_CLOSED: t(
          "settings.referral_claim_window_closed",
        ),
        REFERRAL_ALREADY_CLAIMED: t("settings.referral_claim_already"),
        REFERRAL_CODE_SELF: t("settings.referral_claim_self"),
      };

      show_toast(
        messages[res.server_code ?? ""] ??
          t("common.something_went_wrong_try_again"),
        "error",
      );
    } catch (caught) {
      ignore_error("components/settings/referral_tab:handle_claim", caught);
      show_toast(t("common.something_went_wrong_try_again"), "error");
    } finally {
      set_is_claiming(false);
    }
  }, [claim_input, t]);

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
        set_info_load_failed(false);
      } else {
        set_info_load_failed(true);
      }

      if (history_res.data) {
        set_referral_history(history_res.data.referrals);
        set_history_load_failed(false);
      } else {
        set_history_load_failed(true);
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
    } catch (caught) {
      set_info_load_failed(true);
      set_history_load_failed(true);
      ignore_error("components/settings/referral_tab:load_data", caught);
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
    const next_month_start = new Date(now.getFullYear(), now.getMonth() + 1, 1);

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
                percent: my_affiliate_status.commission_percent,
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
                className="flex-shrink-0 h-7 px-2.5 rounded-md text-xs font-semibold bg-blue-600 text-white inline-flex items-center justify-center gap-1.5 whitespace-nowrap hover:bg-blue-700 transition-colors"
                type="button"
                onClick={async () => {
                  if (
                    await copy_text(
                      build_referral_invite_url(referral_info.referral_code),
                    )
                  ) {
                    show_toast(t("settings.link_copied"), "success");
                  } else {
                    show_toast(t("common.failed_to_copy"), "error");
                  }
                }}
              >
                <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                {t("settings.copy_link")}
              </button>
              <button
                className="flex-shrink-0 h-7 px-2.5 rounded-md text-xs font-semibold bg-surf-tertiary border border-edge-secondary text-txt-secondary inline-flex items-center justify-center gap-1.5 whitespace-nowrap hover:bg-surf-primary transition-colors disabled:opacity-60"
                disabled={is_sending_affiliate_link}
                type="button"
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
            bottom_label={`${t("settings.affiliate_total_earned")} ${format_price(
              my_affiliate_status.earned_this_month_cents,
            )}`}
            percent={affiliate_cap_percent}
          />
          <div className="flex items-center gap-1 mt-1">
            <p className="text-xs text-txt-muted">
              {t("settings.affiliate_lifetime_cap", {
                value: format_price(AFFILIATE_MONTHLY_CAP_CENTS),
              })}
            </p>
            <InfoHint
              tip={t("settings.affiliate_info_hint_cap", {
                value: format_price(AFFILIATE_MONTHLY_CAP_CENTS),
                days: affiliate_days_until_reset,
              })}
              title={t("settings.affiliate_info_hint_cap_title")}
            />
          </div>
          <p className="text-[11px] text-txt-muted mt-0.5">
            {t("settings.affiliate_cap_resets_in", {
              days: affiliate_days_until_reset,
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
            <div className="absolute top-2 end-2">
              <InfoHint
                tip={t("settings.affiliate_info_hint_paid_out")}
                title={t("settings.affiliate_info_hint_paid_out_title")}
              />
            </div>
          </div>
          <div className="relative">
            <StatRing
              color_class="text-yellow-500"
              display_value={format_price(
                my_affiliate_status.outstanding_cents,
              )}
              icon={ClockIcon}
              label={t("settings.affiliate_amount_owed")}
              max={affiliate_total_for_ratio}
              value={my_affiliate_status.outstanding_cents}
            />
            <div className="absolute top-2 end-2">
              <InfoHint
                tip={t("settings.affiliate_info_hint_owed")}
                title={t("settings.affiliate_info_hint_owed_title")}
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
              <span className="absolute start-2.5 top-1/2 -translate-y-1/2 text-xs text-txt-muted">
                $
              </span>
              <input
                className="h-9 w-full ps-5 pe-2 rounded-lg bg-surf-primary border border-edge-secondary text-sm text-txt-primary disabled:opacity-50"
                disabled={
                  is_requesting_payout ||
                  my_affiliate_status.outstanding_cents <= 0
                }
                max={my_affiliate_status.outstanding_cents / 100}
                min="5.00"
                step="0.01"
                type="number"
                value={payout_amount_input}
                onBlur={(e) => {
                  const parsed = parseFloat(e.target.value);

                  if (Number.isFinite(parsed)) {
                    set_payout_amount_input(parsed.toFixed(2));
                  }
                }}
                onChange={(e) => {
                  set_payout_amount_touched(true);
                  set_payout_amount_input(e.target.value);
                }}
              />
            </div>
            <button
              className="h-9 px-2.5 rounded-lg text-xs font-semibold border border-edge-secondary text-txt-secondary hover:bg-surf-tertiary transition-colors disabled:opacity-50"
              disabled={
                is_requesting_payout ||
                my_affiliate_status.outstanding_cents <= 0
              }
              type="button"
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
              className="h-9 px-3 rounded-lg text-sm font-semibold bg-blue-600 text-white inline-flex items-center justify-center gap-2 whitespace-nowrap hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={
                is_requesting_payout ||
                my_affiliate_status.outstanding_cents <= 0
              }
              type="button"
              onClick={handle_request_payout}
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
                    percent: my_affiliate_status.commission_percent,
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
                    className="text-xs text-brand hover:underline whitespace-nowrap"
                    type="button"
                    onClick={() => set_is_irs_confirm_open(true)}
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

  if (!referral_info && info_load_failed) {
    return (
      <div>
        {affiliate_section}
        {my_discount_section}
        <LoadFailedNotice on_retry={() => void load_data()} />
      </div>
    );
  }

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

  const invite_url = build_referral_invite_url(referral_info.referral_code);
  const bonus_amount = format_bytes(referral_info.bonus_bytes_per_referral);
  const bonus_max = format_bytes(referral_info.bonus_bytes_max);
  const bonus_earned = format_bytes(referral_info.bonus_bytes_earned);

  const handle_share = async () => {
    set_is_sharing(true);

    try {
      const outcome = await share_invite(
        t("settings.referral_share_title"),
        t("settings.referral_share_message", { amount: bonus_amount }),
        invite_url,
      );

      if (outcome === "shared") {
        show_toast(t("settings.referral_shared"), "success");
      } else if (outcome === "copied") {
        show_toast(t("settings.referral_message_copied"), "success");
      } else {
        show_toast(t("common.failed_to_copy"), "error");
      }
    } finally {
      set_is_sharing(false);
    }
  };

  const claim_section = my_referral_status?.can_claim ? (
    <div className="mb-5 rounded-2xl border border-edge-secondary p-4 bg-surf-tertiary">
      <p className="text-sm font-semibold text-txt-primary">
        {t("settings.referral_claim_title")}
      </p>
      <p className="text-xs text-txt-muted mt-1">
        {t("settings.referral_claim_description", {
          amount: bonus_amount,
          date: my_referral_status.claim_window_ends_at
            ? format_date(my_referral_status.claim_window_ends_at)
            : "",
        })}
      </p>
      <div className="flex items-center gap-2 mt-3">
        <input
          className="h-9 flex-1 min-w-0 px-3 rounded-lg bg-surf-primary border border-edge-secondary text-sm text-txt-primary font-mono uppercase"
          disabled={is_claiming}
          maxLength={16}
          placeholder={t("settings.referral_claim_placeholder")}
          value={claim_input}
          onChange={(e) => set_claim_input(e.target.value.toUpperCase())}
        />
        <button
          className="h-9 px-3 rounded-lg text-sm font-semibold bg-blue-600 text-white inline-flex items-center gap-2 whitespace-nowrap hover:bg-blue-700 transition-colors disabled:opacity-50"
          disabled={is_claiming || !claim_input.trim()}
          type="button"
          onClick={handle_claim}
        >
          {is_claiming && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
          {t("settings.referral_claim_button")}
        </button>
      </div>
    </div>
  ) : null;

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
            className="pointer-events-none absolute end-0 top-0 h-full w-1/2 object-cover opacity-60 mix-blend-screen"
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
                className="text-lg font-bold text-white tracking-tight max-w-[380px]"
                style={{ textShadow: "0 1px 3px rgba(0, 0, 0, 0.15)" }}
              >
                {t("settings.referral_storage_headline", {
                  amount: bonus_amount,
                })}
              </h3>
              {referral_info.bonus_bytes_earned > 0 && (
                <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-white/15 text-white tabular-nums">
                  {t("settings.referral_storage_earned_badge", {
                    amount: bonus_earned,
                  })}
                </span>
              )}
            </div>
            <p
              className="text-sm text-white/70 mb-4 max-w-[420px]"
              style={{ textShadow: "0 1px 2px rgba(0, 0, 0, 0.1)" }}
            >
              {t("settings.referral_storage_subhead", {
                amount: bonus_amount,
                max: bonus_max,
              })}
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
                  className="h-9 px-3 rounded-lg text-sm font-semibold bg-white inline-flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-60"
                  disabled={is_sharing}
                  style={{
                    color: "var(--accent-mix-b70, #1e3a8a)",
                    boxShadow:
                      "0 2px 8px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.9) inset",
                  }}
                  type="button"
                  onClick={handle_share}
                >
                  {is_sharing ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShareIcon className="w-4 h-4" />
                  )}
                  {t("settings.referral_share_button")}
                </button>
                <button
                  aria-label={t("settings.copy_link")}
                  className="h-9 px-3 rounded-lg text-sm font-semibold bg-black/20 border border-white/10 text-white inline-flex items-center justify-center gap-2 whitespace-nowrap hover:bg-black/30 transition-colors"
                  type="button"
                  onClick={async () => {
                    if (await copy_invite_link(invite_url)) {
                      show_toast(t("settings.link_copied"), "success");
                    } else {
                      show_toast(t("common.failed_to_copy"), "error");
                    }
                  }}
                >
                  <ClipboardDocumentIcon className="w-4 h-4" />
                  {t("settings.copy_link")}
                </button>
                <button
                  aria-label={
                    is_qr_visible
                      ? t("settings.referral_hide_qr")
                      : t("settings.referral_show_qr")
                  }
                  className="h-9 w-9 rounded-lg bg-black/20 border border-white/10 text-white inline-flex items-center justify-center hover:bg-black/30 transition-colors"
                  type="button"
                  onClick={() => set_is_qr_visible((visible) => !visible)}
                >
                  <QrCodeIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {is_qr_visible && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <RoundedQrCode
                  aria_label={t("settings.referral_qr_alt")}
                  quiet_zone={12}
                  size={204}
                  value={invite_url}
                />
                <p className="text-xs text-white/70 text-center">
                  {t("settings.referral_qr_hint")}
                </p>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-white/15">
              <button
                className="text-xs font-medium text-white/80 inline-flex items-center gap-1.5 hover:text-white transition-colors disabled:opacity-60"
                disabled={is_sending_referral}
                type="button"
                onClick={handle_send_referral}
              >
                {is_sending_referral ? (
                  <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <EnvelopeIcon className="w-3.5 h-3.5" />
                )}
                {t("settings.send_referral_to_contacts")}
              </button>
              <p className="text-[11px] text-white/60 mt-1">
                {t("settings.referral_email_all_contacts_hint")}
              </p>
            </div>
          </div>
        </div>
      )}

      {claim_section}

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
          value={Math.max(
            0,
            referral_info.total_referrals - referral_info.activated_referrals,
          )}
        />
        <StatRing
          color_class="text-green-500"
          icon={CheckCircleIcon}
          label={t("settings.referral_active_referrals")}
          max={referral_info.total_referrals}
          value={referral_info.activated_referrals}
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
                {t("settings.referral_step_earn", {
                  amount: bonus_amount,
                  max: bonus_max,
                })}
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
              {t("settings.referral_reward_info", {
                amount: bonus_amount,
                max: bonus_max,
              })}
            </p>
            <p className="text-sm text-txt-secondary">
              {t("settings.referral_commission_info", {
                percent: referral_info.commission_percent || 10,
              })}
            </p>
            {referral_info.bonus_bytes_max > 0 && (
              <div className="pt-2 flex flex-col items-center">
                <SemicircleGauge
                  bottom_label={`${t("settings.referral_bonus_gauge_label")} ${bonus_earned}`}
                  percent={
                    (referral_info.bonus_bytes_earned /
                      referral_info.bonus_bytes_max) *
                    100
                  }
                />
                <p className="text-xs text-txt-muted mt-2 text-center">
                  {t("settings.referral_bonus_max", { value: bonus_max })}
                </p>
                {total_earned_cents > 0 && (
                  <p className="text-xs text-txt-muted mt-1 text-center">
                    {t("settings.referral_gauge_earned_label")}{" "}
                    {format_price(total_earned_cents)}
                  </p>
                )}
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
                      ref_item.activated_at || ref_item.status === "completed"
                        ? "bg-green-500/15 text-green-500"
                        : "bg-yellow-500/15 text-yellow-500"
                    }`}
                  >
                    {ref_item.activated_at
                      ? t("settings.referral_status_active")
                      : ref_item.status === "completed"
                        ? t("settings.referral_status_completed")
                        : t("settings.referral_status_pending")}
                  </span>
                  {ref_item.bonus_bytes > 0 && (
                    <p className="text-sm font-medium text-green-500">
                      +{format_bytes(ref_item.bonus_bytes)}
                    </p>
                  )}
                  {ref_item.referrer_credit_cents > 0 && (
                    <p className="text-sm font-medium text-green-500">
                      +{format_price(ref_item.referrer_credit_cents)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : history_load_failed ? (
          <LoadFailedNotice on_retry={() => void load_data()} />
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
        show_close_button
        is_open={is_irs_confirm_open}
        on_close={() => set_is_irs_confirm_open(false)}
        size="sm"
      >
        <ModalHeader>
          <ModalTitle>
            {t("settings.affiliate_learn_more_irs_confirm_title")}
          </ModalTitle>
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
              open_external("https://www.irs.gov/instructions/i1099mec");
            }}
          >
            {t("common.continue")}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
