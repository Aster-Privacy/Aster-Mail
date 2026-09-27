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
  TagIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  Input,
  IslandDivider,
  IslandEmpty,
  IslandRow,
  IslandSection,
  IslandSections,
  PillButton,
} from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
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
import { has_storage_bonus } from "@/lib/referral_bonus";
import { share_invite, copy_invite_link } from "@/lib/referral_share";
import { invalidate_referral_summary } from "@/hooks/use_referral_summary";
import { is_contact_trashed } from "@/lib/contact_trash";

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
      if (is_contact_trashed(contact)) continue;
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

      const referral_link = build_referral_invite_url(
        referral_info.referral_code,
      );
      const body_text = has_storage_bonus(
        referral_info.bonus_bytes_per_referral,
      )
        ? t("settings.referral_email_body", {
            referral_link,
            amount: format_bytes(referral_info.bonus_bytes_per_referral),
          })
        : t("settings.referral_email_body_plain", { referral_link });

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

      const referral_link = build_referral_invite_url(
        referral_info.referral_code,
      );
      const body_text = has_storage_bonus(
        referral_info.bonus_bytes_per_referral,
      )
        ? t("settings.referral_email_body", {
            referral_link,
            amount: format_bytes(referral_info.bonus_bytes_per_referral),
          })
        : t("settings.referral_email_body_plain", { referral_link });

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
    <IslandSection
      icon={<TagIcon />}
      padding="md"
      title={t("settings.referral_your_discount")}
    >
      {my_referral_status.discount_redeemed_at ? (
        <p
          className="text-[14px] font-medium"
          style={{ color: "var(--color-success)" }}
        >
          {t("settings.referral_discount_redeemed")}
        </p>
      ) : my_referral_status.discount_promo_code ? (
        <div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className="text-[14px] font-medium"
              style={{ color: "var(--color-success)" }}
            >
              {t("settings.referral_discount_active")}
            </span>
            <span className="font-mono text-[13px] text-txt-secondary">
              {my_referral_status.discount_promo_code}
            </span>
          </p>
          <p className="mt-1 text-[13px] text-txt-muted">
            {t("settings.referral_discount_auto_apply")}
          </p>
          {my_referral_status.discount_expires_at && (
            <p className="mt-0.5 text-[13px] text-txt-muted">
              {t("settings.referral_discount_expires", {
                date: format_date(my_referral_status.discount_expires_at),
              })}
            </p>
          )}
        </div>
      ) : (
        <p className="text-[14px] font-medium text-txt-muted">
          {t("settings.referral_discount_expired")}
        </p>
      )}
    </IslandSection>
  ) : null;

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

  const notify_copy_result = (copied: boolean) => {
    if (copied) {
      show_toast(t("settings.link_copied"), "success");
    } else {
      show_toast(t("common.failed_to_copy"), "error");
    }
  };
  const copy_link_to_clipboard = async (url: string) =>
    notify_copy_result(await copy_text(url));
  const copy_invite_to_clipboard = async (url: string) =>
    notify_copy_result(await copy_invite_link(url));

  const payout_status_color = (
    status: MyAffiliatePayoutRequestItem["status"],
  ) =>
    status === "accepted"
      ? "var(--color-success)"
      : status === "rejected"
        ? "var(--color-danger)"
        : "var(--color-warning)";

  const affiliate_section = my_affiliate_status?.is_affiliate ? (
    <IslandSection
      icon={<BanknotesIcon />}
      padding="none"
      title={t("settings.affiliate_program")}
    >
      <div className="px-5 pb-5 pt-5">
        <p className="text-[15px] font-semibold leading-5 text-txt-primary">
          {t("settings.affiliate_status_title")}
        </p>
        <p
          className="mt-0.5 text-[13px] font-medium"
          style={{ color: "var(--color-success)" }}
        >
          {t("settings.affiliate_brand_badge")}
        </p>
        <p className="mt-2 text-[14px] leading-5 text-txt-secondary">
          {t("settings.affiliate_status_description", {
            percent: my_affiliate_status.commission_percent,
          })}
        </p>

        {referral_info?.referral_code && (
          <div className="mt-5">
            <p className="mb-2 text-[13px] font-medium text-txt-secondary">
              {t("settings.affiliate_your_link_label")}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                readOnly
                aria-label={t("settings.affiliate_your_link_label")}
                className="min-w-0 flex-1 font-mono text-[13px]"
                size="md"
                value={build_referral_invite_url(referral_info.referral_code)}
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="flex flex-wrap gap-2">
                <PillButton
                  leading={<ClipboardDocumentIcon className="h-4 w-4" />}
                  size="md"
                  type="button"
                  variant="filled"
                  onClick={() =>
                    copy_link_to_clipboard(
                      build_referral_invite_url(referral_info.referral_code),
                    )
                  }
                >
                  {t("settings.copy_link")}
                </PillButton>
                <PillButton
                  disabled={is_sending_affiliate_link}
                  leading={
                    is_sending_affiliate_link ? (
                      <Spinner size="sm" />
                    ) : (
                      <EnvelopeIcon className="h-4 w-4" />
                    )
                  }
                  size="md"
                  type="button"
                  variant="neutral"
                  onClick={handle_send_affiliate_link}
                >
                  {t("settings.affiliate_email_link_button")}
                </PillButton>
              </div>
            </div>
          </div>
        )}
      </div>

      <IslandDivider />

      <div className="px-5 py-5">
        <div className="grid grid-cols-3 gap-4">
          <div className="min-w-0">
            <p className="text-[12.5px] text-txt-muted">
              {t("settings.affiliate_total_earned")}
            </p>
            <p className="mt-1 text-[22px] font-semibold leading-7 tabular-nums text-txt-primary">
              {format_price(my_affiliate_status.earned_this_month_cents)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-[12.5px] text-txt-muted">
              {t("settings.affiliate_paid_out")}
              <InfoHint
                tip={t("settings.affiliate_info_hint_paid_out")}
                title={t("settings.affiliate_info_hint_paid_out_title")}
              />
            </p>
            <p className="mt-1 text-[22px] font-semibold leading-7 tabular-nums text-txt-primary">
              {format_price(my_affiliate_status.total_paid_out_cents)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-[12.5px] text-txt-muted">
              {t("settings.affiliate_amount_owed")}
              <InfoHint
                tip={t("settings.affiliate_info_hint_owed")}
                title={t("settings.affiliate_info_hint_owed_title")}
              />
            </p>
            <p className="mt-1 text-[22px] font-semibold leading-7 tabular-nums text-txt-primary">
              {format_price(my_affiliate_status.outstanding_cents)}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-1 text-[13px] font-medium text-txt-secondary">
              {t("settings.affiliate_lifetime_cap", {
                value: format_price(AFFILIATE_MONTHLY_CAP_CENTS),
              })}
              <InfoHint
                tip={t("settings.affiliate_info_hint_cap", {
                  value: format_price(AFFILIATE_MONTHLY_CAP_CENTS),
                  days: affiliate_days_until_reset,
                })}
                title={t("settings.affiliate_info_hint_cap_title")}
              />
            </p>
            <p className="text-[12.5px] text-txt-muted">
              {t("settings.affiliate_cap_resets_in", {
                days: affiliate_days_until_reset,
              })}
            </p>
          </div>
          <div
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.round(affiliate_cap_percent)}
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
            role="progressbar"
            style={{ backgroundColor: "var(--storage-track)" }}
          >
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${affiliate_cap_percent}%`,
                backgroundColor: "var(--accent-color)",
              }}
            />
          </div>
        </div>
      </div>

      <IslandDivider />

      <div className="px-5 py-5">
        <p className="text-[14px] leading-5 text-txt-secondary">
          {t("settings.affiliate_payout_instructions")}
        </p>
        <label
          className="mb-2 mt-4 block text-[13px] font-medium text-txt-secondary"
          htmlFor="affiliate_payout_amount"
        >
          {t("settings.affiliate_payout_amount_label")}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-[140px]">
            <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[14px] text-txt-muted">
              $
            </span>
            <Input
              disabled={
                is_requesting_payout ||
                my_affiliate_status.outstanding_cents <= 0
              }
              id="affiliate_payout_amount"
              max={my_affiliate_status.outstanding_cents / 100}
              min="5.00"
              size="md"
              step="0.01"
              style={{ paddingInlineStart: "26px" }}
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
          <PillButton
            disabled={
              is_requesting_payout || my_affiliate_status.outstanding_cents <= 0
            }
            size="md"
            type="button"
            variant="neutral"
            onClick={() => {
              set_payout_amount_touched(true);
              set_payout_amount_input(
                (my_affiliate_status.outstanding_cents / 100).toFixed(2),
              );
            }}
          >
            {t("settings.affiliate_payout_amount_max")}
          </PillButton>
          <PillButton
            disabled={
              is_requesting_payout || my_affiliate_status.outstanding_cents <= 0
            }
            leading={
              is_requesting_payout ? (
                <Spinner size="sm" />
              ) : (
                <BanknotesIcon className="h-4 w-4" />
              )
            }
            size="md"
            type="button"
            variant="filled"
            onClick={handle_request_payout}
          >
            {t("settings.affiliate_copy_template")}
          </PillButton>
        </div>
        <p className="mt-2 text-[12.5px] text-txt-muted">
          {t("settings.affiliate_payout_processing_note")}
        </p>
      </div>

      <IslandDivider />

      <div className="px-5 pt-5 pb-2">
        <p className="text-[13px] font-medium text-txt-secondary">
          {t("settings.affiliate_payout_history_title")}
        </p>
      </div>
      {payout_history.length === 0 ? (
        <p className="px-5 pb-5 text-[13px] text-txt-muted">
          {t("settings.affiliate_payout_history_empty")}
        </p>
      ) : (
        <div className="aster_island_divided pb-1">
          {payout_history.map((item) => (
            <IslandRow
              key={item.short_code}
              description={t("settings.affiliate_payout_requested_on", {
                date: format_date(item.created_at),
              })}
              label={
                <span className="tabular-nums">
                  {format_price(item.amount_cents)}
                </span>
              }
              value={
                <span
                  className="text-[13px] font-medium"
                  style={{ color: payout_status_color(item.status) }}
                >
                  {item.status === "accepted"
                    ? t("settings.affiliate_payout_status_accepted")
                    : item.status === "rejected"
                      ? t("settings.affiliate_payout_status_rejected")
                      : t("settings.affiliate_payout_status_pending")}
                </span>
              }
            />
          ))}
        </div>
      )}

      <IslandDivider />

      <div className="px-5 py-5">
        <p className="text-[13px] font-medium text-txt-secondary">
          {t("settings.affiliate_info_title")}
        </p>
        <ol className="mt-3 space-y-2.5">
          {[
            t("settings.affiliate_info_step_commission", {
              percent: my_affiliate_status.commission_percent,
            }),
            t("settings.affiliate_info_step_cap", {
              value: format_price(AFFILIATE_MONTHLY_CAP_CENTS),
            }),
            t("settings.affiliate_info_step_payout"),
            t("settings.affiliate_info_step_disclosure"),
            t("settings.affiliate_info_step_tax"),
            null,
            t("settings.affiliate_info_step_account_binding"),
          ].map((step, index) => (
            <li key={index} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-edge-secondary text-[11px] font-semibold text-txt-secondary">
                {index + 1}
              </span>
              <span className="text-[14px] leading-5 text-txt-secondary">
                {step ?? (
                  <>
                    {t("settings.affiliate_info_step_tax_reporting")}{" "}
                    <button
                      className="whitespace-nowrap font-medium hover:underline"
                      style={{ color: "var(--accent-color)" }}
                      type="button"
                      onClick={() => set_is_irs_confirm_open(true)}
                    >
                      {t("common.learn_more")}
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[12.5px] text-txt-muted">
          {t("settings.affiliate_info_footer_note")}
        </p>
      </div>
    </IslandSection>
  ) : null;

  if (!referral_info && info_load_failed) {
    return (
      <IslandSections>
        {affiliate_section}
        {my_discount_section}
        <LoadFailedNotice on_retry={() => void load_data()} />
      </IslandSections>
    );
  }

  if (!referral_info || !referral_info.referral_code) {
    return (
      <IslandSections>
        {affiliate_section}
        {my_discount_section}
        <IslandEmpty
          description={t("settings.referral_not_eligible_description")}
          icon={<UserGroupIcon />}
          title={t("settings.referral_not_eligible")}
        />
      </IslandSections>
    );
  }

  const total_earned_cents =
    (referral_info.credits_earned_cents || 0) +
    (referral_info.commission_earned_cents || 0);

  const invite_url = build_referral_invite_url(referral_info.referral_code);
  const storage_bonus = has_storage_bonus(
    referral_info.bonus_bytes_per_referral,
  );
  const bonus_amount = format_bytes(referral_info.bonus_bytes_per_referral);
  const bonus_max = format_bytes(referral_info.bonus_bytes_max);
  const bonus_earned = format_bytes(referral_info.bonus_bytes_earned);
  const commission_percent = referral_info.commission_percent || 10;
  const bonus_percent =
    referral_info.bonus_bytes_max > 0
      ? Math.min(
          100,
          (referral_info.bonus_bytes_earned / referral_info.bonus_bytes_max) *
            100,
        )
      : 0;

  const handle_share = async () => {
    set_is_sharing(true);

    try {
      const outcome = await share_invite(
        t("settings.referral_share_title"),
        storage_bonus
          ? t("settings.referral_share_message", { amount: bonus_amount })
          : t("settings.referral_share_message_plain"),
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
    <IslandSection
      description={t("settings.referral_claim_description", {
        amount: bonus_amount,
        date: my_referral_status.claim_window_ends_at
          ? format_date(my_referral_status.claim_window_ends_at)
          : "",
      })}
      padding="md"
      title={t("settings.referral_claim_title")}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label={t("settings.referral_claim_placeholder")}
          className="min-w-0 flex-1 font-mono uppercase"
          disabled={is_claiming}
          maxLength={16}
          placeholder={t("settings.referral_claim_placeholder")}
          size="md"
          value={claim_input}
          onChange={(e) => set_claim_input(e.target.value.toUpperCase())}
        />
        <PillButton
          className="flex-shrink-0"
          disabled={is_claiming || !claim_input.trim()}
          leading={is_claiming ? <Spinner size="sm" /> : undefined}
          size="md"
          type="button"
          variant="filled"
          onClick={handle_claim}
        >
          {t("settings.referral_claim_button")}
        </PillButton>
      </div>
    </IslandSection>
  ) : null;

  const how_it_works_steps = [
    t("settings.referral_step_share"),
    t("settings.referral_step_signup"),
    storage_bonus
      ? t("settings.referral_step_earn", {
          amount: bonus_amount,
          max: bonus_max,
        })
      : t("settings.referral_step_earn_commission", {
          percent: commission_percent,
        }),
  ];

  return (
    <IslandSections>
      {affiliate_section}

      {!my_affiliate_status?.is_affiliate && (
        <IslandSection
          icon={<GiftIcon />}
          padding="none"
          title={t("settings.referral_program")}
        >
          <div
            className="relative m-2 mb-0 overflow-hidden rounded-[var(--aster-radius-field)] px-5 pb-5 pt-5 sm:min-h-[140px] sm:pe-[42%]"
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
            <h4
              className="relative z-10 text-[18px] font-bold leading-6 tracking-tight text-white"
              style={{ textShadow: "0 1px 3px rgba(0, 0, 0, 0.15)" }}
            >
              {storage_bonus
                ? t("settings.referral_storage_headline", {
                    amount: bonus_amount,
                  })
                : t("settings.referral_commission_headline", {
                    percent: commission_percent,
                  })}
            </h4>
            <p
              className="relative z-10 mt-1 text-[14px] leading-5 text-white/75"
              style={{ textShadow: "0 1px 2px rgba(0, 0, 0, 0.1)" }}
            >
              {storage_bonus
                ? t("settings.referral_storage_subhead", {
                    amount: bonus_amount,
                    max: bonus_max,
                  })
                : t("settings.referral_commission_subhead")}
            </p>
            {referral_info.bonus_bytes_earned > 0 && (
              <p className="relative z-10 mt-3 inline-flex rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-white">
                {t("settings.referral_storage_earned_badge", {
                  amount: bonus_earned,
                })}
              </p>
            )}
          </div>
          <div className="px-5 pb-5 pt-4">
            <p className="mb-2 text-[13px] font-medium text-txt-secondary">
              {t("settings.your_referral_link")}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                readOnly
                aria-label={t("settings.your_referral_link")}
                className="min-w-0 flex-1 font-mono text-[13px]"
                size="md"
                value={invite_url}
                onFocus={(e) => e.currentTarget.select()}
              />
              <PillButton
                className="flex-shrink-0"
                leading={<ClipboardDocumentIcon className="h-4 w-4" />}
                size="md"
                type="button"
                variant="filled"
                onClick={() => copy_invite_to_clipboard(invite_url)}
              >
                {t("settings.copy_link")}
              </PillButton>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <PillButton
                disabled={is_sharing}
                leading={
                  is_sharing ? (
                    <Spinner size="sm" />
                  ) : (
                    <ShareIcon className="h-4 w-4" />
                  )
                }
                size="md"
                type="button"
                variant="neutral"
                onClick={handle_share}
              >
                {t("settings.referral_share_button")}
              </PillButton>
              <PillButton
                aria-pressed={is_qr_visible}
                leading={<QrCodeIcon className="h-4 w-4" />}
                size="md"
                type="button"
                variant="neutral"
                onClick={() => set_is_qr_visible((visible) => !visible)}
              >
                {is_qr_visible
                  ? t("settings.referral_hide_qr")
                  : t("settings.referral_show_qr")}
              </PillButton>
            </div>

            {is_qr_visible && (
              <div className="mt-5 flex flex-col items-center gap-2">
                <RoundedQrCode
                  aria_label={t("settings.referral_qr_alt")}
                  quiet_zone={12}
                  size={204}
                  value={invite_url}
                />
                <p className="text-center text-[12.5px] text-txt-muted">
                  {t("settings.referral_qr_hint")}
                </p>
              </div>
            )}
          </div>

          <IslandDivider />

          <div className="py-1">
            <IslandRow
              chevron={!is_sending_referral}
              description={t("settings.referral_email_all_contacts_hint")}
              disabled={is_sending_referral}
              icon={<EnvelopeIcon className="h-[22px] w-[22px]" />}
              label={t("settings.send_referral_to_contacts")}
              on_press={handle_send_referral}
              trailing={is_sending_referral ? <Spinner size="sm" /> : undefined}
            />
          </div>
        </IslandSection>
      )}

      {claim_section}

      {my_discount_section}

      <IslandSection padding="md">
        <div className="grid grid-cols-3 gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12.5px] text-txt-muted">
              <UserGroupIcon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{t("settings.total_referrals")}</span>
            </p>
            <p className="mt-1 text-[22px] font-semibold leading-7 tabular-nums text-txt-primary">
              {referral_info.total_referrals}
            </p>
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12.5px] text-txt-muted">
              <ClockIcon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">
                {t("settings.pending_referrals")}
              </span>
            </p>
            <p className="mt-1 text-[22px] font-semibold leading-7 tabular-nums text-txt-primary">
              {Math.max(
                0,
                referral_info.total_referrals -
                  referral_info.activated_referrals,
              )}
            </p>
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12.5px] text-txt-muted">
              <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">
                {t("settings.referral_active_referrals")}
              </span>
            </p>
            <p className="mt-1 text-[22px] font-semibold leading-7 tabular-nums text-txt-primary">
              {referral_info.activated_referrals}
            </p>
          </div>
        </div>
      </IslandSection>

      <IslandSection padding="md" title={t("settings.referral_how_it_works")}>
        <ol className="space-y-2.5">
          {how_it_works_steps.map((step, index) => (
            <li key={index} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-edge-secondary text-[11px] font-semibold text-txt-secondary">
                {index + 1}
              </span>
              <span className="text-[14px] leading-5 text-txt-secondary">
                {step}
              </span>
            </li>
          ))}
        </ol>
      </IslandSection>

      {!my_affiliate_status?.is_affiliate && (
        <IslandSection padding="md" title={t("settings.referral_rewards")}>
          <div className="space-y-2">
            {storage_bonus && (
              <p className="text-[14px] leading-5 text-txt-secondary">
                {t("settings.referral_reward_info", {
                  amount: bonus_amount,
                  max: bonus_max,
                })}
              </p>
            )}
            <p className="text-[14px] leading-5 text-txt-secondary">
              {t("settings.referral_commission_info", {
                percent: commission_percent,
              })}
            </p>
          </div>
          {storage_bonus && referral_info.bonus_bytes_max > 0 && (
            <div className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-medium text-txt-secondary">
                  {t("settings.referral_bonus_gauge_label")}{" "}
                  <span className="tabular-nums text-txt-primary">
                    {bonus_earned}
                  </span>
                </p>
                <p className="text-[12.5px] text-txt-muted">
                  {t("settings.referral_bonus_max", { value: bonus_max })}
                </p>
              </div>
              <div
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={Math.round(bonus_percent)}
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
                role="progressbar"
                style={{ backgroundColor: "var(--storage-track)" }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${bonus_percent}%`,
                    backgroundColor: "var(--accent-color)",
                  }}
                />
              </div>
              {total_earned_cents > 0 && (
                <p className="mt-2 text-[12.5px] text-txt-muted">
                  {t("settings.referral_gauge_earned_label")}{" "}
                  <span className="tabular-nums text-txt-primary">
                    {format_price(total_earned_cents)}
                  </span>
                </p>
              )}
            </div>
          )}
        </IslandSection>
      )}

      <IslandSection
        bare={referral_history.length === 0}
        padding="none"
        title={t("settings.referral_history")}
      >
        {referral_history.length > 0 ? (
          <div className="aster_island_divided py-1">
            {referral_history.map((ref_item) => {
              const is_active =
                !!ref_item.activated_at || ref_item.status === "completed";

              return (
                <IslandRow
                  key={ref_item.id}
                  description={format_date(ref_item.created_at)}
                  label={ref_item.referee_email_masked}
                  value={
                    <span className="flex flex-col items-end">
                      <span
                        className="text-[13px] font-medium"
                        style={{
                          color: is_active
                            ? "var(--color-success)"
                            : "var(--color-warning)",
                        }}
                      >
                        {ref_item.activated_at
                          ? t("settings.referral_status_active")
                          : ref_item.status === "completed"
                            ? t("settings.referral_status_completed")
                            : t("settings.referral_status_pending")}
                      </span>
                      {(ref_item.bonus_bytes > 0 ||
                        ref_item.referrer_credit_cents > 0) && (
                        <span className="text-[12px] tabular-nums text-txt-muted">
                          {ref_item.bonus_bytes > 0 &&
                            `+${format_bytes(ref_item.bonus_bytes)}`}
                          {ref_item.bonus_bytes > 0 &&
                            ref_item.referrer_credit_cents > 0 &&
                            " "}
                          {ref_item.referrer_credit_cents > 0 &&
                            `+${format_price(ref_item.referrer_credit_cents)}`}
                        </span>
                      )}
                    </span>
                  }
                />
              );
            })}
          </div>
        ) : history_load_failed ? (
          <LoadFailedNotice on_retry={() => void load_data()} />
        ) : (
          <IslandEmpty
            icon={<UserGroupIcon />}
            title={t("settings.no_referrals_yet")}
          />
        )}
      </IslandSection>

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
    </IslandSections>
  );
}
