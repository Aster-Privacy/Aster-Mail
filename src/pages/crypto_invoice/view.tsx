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
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  QrCodeIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { measure_clock_skew, write_to_clipboard } from "./clipboard";
import {
  BILLING_ROUTE,
  CANCEL_HAS_PAYMENT_MARKER,
  DEFINITIVE_ERROR_CODES,
  EXPIRING_SOON_MS,
  KNOWN_STATUSES,
  LoadState,
  MAX_CONSECUTIVE_FAILURES,
  MAX_POLL_INTERVAL_MS,
  POLL_INTERVAL_MS,
  TERMINAL_STATUSES,
  WARNING_BG,
  WARNING_FG,
  WARNING_TEXT,
} from "./constants";
import {
  coin_title,
  elapsed_fraction,
  format_clock_time,
  format_countdown,
  format_locked_rate,
  outstanding_atomic,
  pretty_chain,
  received_atomic_of,
  truncate_middle,
} from "./format";
import { normalize_invoice } from "./normalize";
import {
  CopyField,
  DetailRow,
  InvoiceSkeleton,
  LiveStatus,
  Meter,
  PageShell,
  ResultCard,
  StatusStep,
  StepList,
} from "./ui";
import { safe_wallet_uri } from "./wallet";

import { CoinIcon } from "@/components/ui/coin_icon";
import { RoundedQrCode } from "@/components/ui/rounded_qr_code";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmModal } from "@/components/email/inbox/inbox_confirmation_dialog";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { request_cache } from "@/services/api/request_cache";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import {
  cancel_crypto_native_invoice,
  format_price,
  get_crypto_native_invoice,
  type CryptoNativeInvoiceStatus,
} from "@/services/api/billing";
import {
  forget_crypto_selection,
  notify_crypto_invoice_changed,
  request_crypto_resume,
} from "@/components/settings/billing/billing_constants";

type Translate = ReturnType<typeof use_i18n>["t"];

function status_steps(t: Translate, is_addon: boolean): StatusStep[] {
  return [
    {
      key: "pending",
      label: t("settings.crypto_native_status_awaiting"),
      hint: t("settings.crypto_native_hint_awaiting"),
    },
    {
      key: "detected",
      label: t("settings.crypto_native_status_detected"),
      hint: t("settings.crypto_native_hint_detected"),
    },
    {
      key: "confirming",
      label: t("settings.crypto_native_status_confirming_short"),
      hint: is_addon
        ? t("settings.crypto_native_hint_confirming_addon")
        : t("settings.crypto_native_hint_confirming"),
    },
    {
      key: "paid",
      label: t("settings.crypto_native_status_credited"),
      hint: is_addon
        ? t("settings.crypto_native_hint_credited_addon")
        : t("settings.crypto_native_hint_credited"),
    },
  ];
}

function status_index(status: string): number {
  switch (status) {
    case "detected":
      return 1;
    case "confirming":
      return 2;
    case "paid":
      return 3;
    case "underpaid":
      return 1;
    default:
      return 0;
  }
}

function status_text(t: Translate, invoice: CryptoNativeInvoiceStatus): string {
  if (!KNOWN_STATUSES.has(invoice.status)) {
    return t("settings.crypto_native_status_processing");
  }

  switch (invoice.status) {
    case "underpaid":
      return t("settings.crypto_native_status_underpaid");
    case "manual_review":
      return t("settings.crypto_native_manual_review");
    case "confirming":
      return invoice.min_confirmations > 0
        ? t("settings.crypto_native_status_confirming", {
            current: invoice.confirmations,
            required: invoice.min_confirmations,
          })
        : t("settings.crypto_native_status_confirming_short");
    default:
      return status_steps(t, false)[status_index(invoice.status)].label;
  }
}

export default function CryptoInvoicePage() {
  const { id } = useParams<{ id: string }>();

  return <CryptoInvoiceView key={id ?? "missing"} id={id} />;
}

export function CryptoInvoiceView({ id }: { id?: string }) {
  const { t } = use_i18n();
  const navigate = useNavigate();

  const [invoice, set_invoice] = useState<CryptoNativeInvoiceStatus | null>(
    null,
  );
  const [load_state, set_load_state] = useState<LoadState>("loading");
  const [connection_lost, set_connection_lost] = useState(false);
  const [now, set_now] = useState(() => Date.now());
  const [clock_skew_ms, set_clock_skew_ms] = useState(0);
  const [has_server_clock, set_has_server_clock] = useState(false);
  const [is_cancelling, set_is_cancelling] = useState(false);
  const [is_checking_now, set_is_checking_now] = useState(false);
  const [confirm_cancel_open, set_confirm_cancel_open] = useState(false);
  const [last_checked_at, set_last_checked_at] = useState<number | null>(null);
  const latest_invoice = useRef<CryptoNativeInvoiceStatus | null>(null);
  const credited_notified = useRef(false);
  const cancel_notified = useRef(false);
  const cancel_requested = useRef(false);
  const consecutive_failures = useRef(0);
  const poll_interval_ref = useRef(POLL_INTERVAL_MS);
  const has_loaded_ref = useRef(false);
  const load_state_ref = useRef<LoadState>("loading");
  const wallet_timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go_to_billing = useCallback(() => {
    navigate(BILLING_ROUTE);
  }, [navigate]);

  const start_new_payment = useCallback(() => {
    forget_crypto_selection();
    navigate(BILLING_ROUTE);
  }, [navigate]);

  const handle_back = useCallback(() => {
    if (id) request_crypto_resume(id);

    navigate(BILLING_ROUTE);
  }, [id, navigate]);

  const apply_load_state = useCallback((next: LoadState) => {
    load_state_ref.current = next;
    set_load_state(next);
  }, []);

  const fetch_invoice = useCallback(async (): Promise<boolean> => {
    if (!id) {
      apply_load_state("not_found");

      return false;
    }

    const response = await get_crypto_native_invoice(id).catch(() => null);

    const normalized = normalize_invoice(response?.data);

    if (normalized) {
      consecutive_failures.current = 0;
      poll_interval_ref.current = POLL_INTERVAL_MS;
      has_loaded_ref.current = true;
      set_connection_lost(false);
      set_clock_skew_ms(measure_clock_skew(normalized.server_time));
      set_has_server_clock(
        Number.isFinite(Date.parse(normalized.server_time ?? "")),
      );
      latest_invoice.current = normalized;
      set_invoice(normalized);
      set_last_checked_at(Date.now());
      apply_load_state("ready");

      return true;
    }

    if (response?.code && DEFINITIVE_ERROR_CODES.has(response.code)) {
      apply_load_state("not_found");

      return false;
    }

    consecutive_failures.current += 1;
    poll_interval_ref.current = Math.min(
      poll_interval_ref.current * 2,
      MAX_POLL_INTERVAL_MS,
    );

    if (!has_loaded_ref.current) {
      apply_load_state("unavailable");

      return false;
    }

    if (consecutive_failures.current >= MAX_CONSECUTIVE_FAILURES) {
      set_connection_lost(true);
    }

    return false;
  }, [apply_load_state, id]);

  const handle_retry = useCallback(() => {
    consecutive_failures.current = 0;
    poll_interval_ref.current = POLL_INTERVAL_MS;
    apply_load_state("loading");
    void fetch_invoice();
  }, [apply_load_state, fetch_invoice]);

  const handle_check_now = useCallback(async () => {
    if (is_checking_now) return;

    set_is_checking_now(true);
    consecutive_failures.current = 0;
    poll_interval_ref.current = POLL_INTERVAL_MS;

    const status_before = invoice?.status;
    const received_before = invoice?.amount_received_atomic ?? "0";

    try {
      const fresh = await fetch_invoice();

      if (!fresh) {
        if (load_state_ref.current !== "not_found") {
          show_toast(t("settings.crypto_native_check_failed"), "error");
        }

        return;
      }

      const next = latest_invoice.current;

      if (!next) return;
      if (next.status === "paid") return;

      if (
        next.status !== status_before ||
        next.amount_received_atomic !== received_before
      ) {
        show_toast(
          t("settings.crypto_native_check_updated", {
            status: status_text(t, next),
          }),
          "success",
        );

        return;
      }

      show_toast(t("settings.crypto_native_check_no_change"), "info");
    } finally {
      set_is_checking_now(false);
    }
  }, [fetch_invoice, invoice, is_checking_now, t]);

  useEffect(() => {
    void fetch_invoice();
  }, [fetch_invoice]);

  useEffect(() => {
    const status = invoice?.status;

    if (!status || TERMINAL_STATUSES.has(status)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const should_stop = () =>
      cancelled || load_state_ref.current === "not_found";
    const is_hidden = () =>
      typeof document !== "undefined" && document.visibilityState === "hidden";

    const schedule = (delay: number) => {
      if (timer) clearTimeout(timer);

      timer = setTimeout(() => void tick(), delay);
    };

    const tick = async () => {
      if (should_stop()) return;

      if (is_hidden()) {
        schedule(poll_interval_ref.current);

        return;
      }

      await fetch_invoice();

      if (should_stop()) return;

      schedule(poll_interval_ref.current);
    };

    const handle_visibility = () => {
      if (should_stop() || is_hidden()) return;

      consecutive_failures.current = 0;
      poll_interval_ref.current = POLL_INTERVAL_MS;
      schedule(0);
    };

    schedule(poll_interval_ref.current);
    document.addEventListener("visibilitychange", handle_visibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handle_visibility);

      if (timer) clearTimeout(timer);
    };
  }, [invoice?.status, fetch_invoice]);

  useEffect(() => {
    const status = invoice?.status;

    if (!status || TERMINAL_STATUSES.has(status)) return;

    const timer = setInterval(() => set_now(Date.now()), 1_000);

    return () => clearInterval(timer);
  }, [invoice?.status]);

  useEffect(() => {
    return () => {
      if (wallet_timer.current) clearTimeout(wallet_timer.current);
    };
  }, []);

  useEffect(() => {
    if (invoice?.status !== "cancelled" || cancel_notified.current) return;

    cancel_notified.current = true;
    forget_crypto_selection(id);

    if (!cancel_requested.current) return;

    show_toast(t("settings.crypto_native_invoice_cancelled"), "success");
    navigate(BILLING_ROUTE, { replace: true });
  }, [id, invoice?.status, navigate, t]);

  useEffect(() => {
    if (invoice?.status === "paid" && !credited_notified.current) {
      credited_notified.current = true;
      request_cache.invalidate("/payments/v1");
      request_cache.invalidate("/sync/v1");
      invalidate_mail_stats();
      window.dispatchEvent(new CustomEvent("aster:plan-changed"));
      notify_crypto_invoice_changed();
      show_toast(t("settings.crypto_native_paid_title"), "success");
    }
  }, [invoice?.status, t]);

  const handle_copy = useCallback(
    async (value: string) => {
      if (!(await write_to_clipboard(value))) {
        show_toast(t("common.failed_to_copy"), "error");

        return;
      }

      show_toast(t("settings.crypto_native_copied"), "success");
    },
    [t],
  );

  const handle_open_wallet = useCallback(() => {
    if (wallet_timer.current) clearTimeout(wallet_timer.current);

    wallet_timer.current = setTimeout(() => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        show_toast(
          t("settings.crypto_native_no_wallet_handler"),
          "info",
          5_000,
        );
      }
    }, 1_800);
  }, [t]);

  const handle_cancel = useCallback(async () => {
    if (!id) return;

    set_confirm_cancel_open(false);
    set_is_cancelling(true);
    cancel_requested.current = true;

    try {
      const response = await cancel_crypto_native_invoice(id);

      if (response.data) {
        request_cache.invalidate("/payments/v1");
        notify_crypto_invoice_changed();
        set_invoice((prev) =>
          prev ? { ...prev, status: response.data!.status } : prev,
        );
      } else {
        const already_paid =
          response.code === "CONFLICT" &&
          (response.error ?? "")
            .toLowerCase()
            .includes(CANCEL_HAS_PAYMENT_MARKER);

        cancel_requested.current = false;
        show_toast(
          already_paid
            ? t("settings.crypto_native_cancel_has_payment")
            : t("settings.crypto_native_cancel_failed"),
          "error",
        );
        void fetch_invoice();
      }
    } finally {
      set_is_cancelling(false);
    }
  }, [fetch_invoice, id, t]);

  if (load_state === "loading") {
    return (
      <PageShell
        back_label={t("settings.crypto_native_view_billing")}
        on_back={go_to_billing}
      >
        <InvoiceSkeleton />
      </PageShell>
    );
  }

  if (load_state === "unavailable" && !invoice) {
    return (
      <PageShell
        back_label={t("settings.crypto_native_view_billing")}
        on_back={go_to_billing}
      >
        <ResultCard
          body={t("settings.crypto_native_unavailable_body")}
          icon={<ExclamationTriangleIcon className="w-7 h-7" />}
          title={t("settings.crypto_native_unavailable")}
          tone="muted"
        >
          <div className="mt-6">
            <Button className="w-full" variant="primary" onClick={handle_retry}>
              {t("common.retry")}
            </Button>
          </div>
        </ResultCard>
      </PageShell>
    );
  }

  if (load_state === "not_found" || !invoice) {
    return (
      <PageShell
        back_label={t("settings.crypto_native_view_billing")}
        on_back={go_to_billing}
      >
        <ResultCard
          body={t("settings.crypto_native_back_hint")}
          icon={<ExclamationTriangleIcon className="w-7 h-7" />}
          title={t("settings.crypto_native_not_found")}
          tone="muted"
        >
          <div className="mt-6">
            <Button
              className="w-full"
              variant="primary"
              onClick={go_to_billing}
            >
              {t("settings.crypto_native_view_billing")}
            </Button>
          </div>
        </ResultCard>
      </PageShell>
    );
  }

  const coin_label = coin_title(invoice.display_name, invoice.chain);
  const chain_label = pretty_chain(invoice.chain);
  const expires_raw =
    new Date(invoice.expires_at).getTime() - (now - clock_skew_ms);
  const expires_ms = Number.isFinite(expires_raw)
    ? expires_raw
    : Number.POSITIVE_INFINITY;
  const is_pending = invoice.status === "pending";
  const is_paid = invoice.status === "paid";
  const is_expired = invoice.status === "expired";
  const is_cancelled = invoice.status === "cancelled";
  const is_detected = invoice.status === "detected";
  const is_underpaid = invoice.status === "underpaid";
  const is_manual_review = invoice.status === "manual_review";
  const is_unknown_status = !KNOWN_STATUSES.has(invoice.status);
  const is_awaiting_funds = is_pending || is_detected || is_underpaid;

  const due_atomic = outstanding_atomic(
    invoice.amount_atomic,
    invoice.amount_received_atomic,
  );
  const received_atomic = received_atomic_of(invoice.amount_received_atomic);
  const has_received_funds = received_atomic !== null && received_atomic > 0n;
  const amount_due_decimal = invoice.amount_due_decimal;
  const locked_rate_label = format_locked_rate(invoice.rate_locked_usd);
  const wallet_uri = safe_wallet_uri(invoice);
  const qr_value = wallet_uri ?? (invoice.address || null);
  const qr_is_address_only = wallet_uri === null && qr_value !== null;
  const quote_lapsed = is_awaiting_funds && has_server_clock && expires_ms <= 0;
  const quote_lapsed_unfunded = quote_lapsed && !has_received_funds;
  const has_outstanding_balance =
    is_awaiting_funds &&
    !quote_lapsed &&
    invoice.address.length > 0 &&
    (due_atomic === null || due_atomic > 0n);
  const is_active_payment = is_awaiting_funds && !quote_lapsed;
  const is_expiring_soon =
    is_active_payment &&
    Number.isFinite(expires_ms) &&
    expires_ms > 0 &&
    expires_ms <= EXPIRING_SOON_MS;

  const back_label = t("settings.crypto_native_view_billing");

  if (is_paid) {
    return (
      <PageShell back_label={back_label} on_back={go_to_billing}>
        <AnimatePresence mode="wait">
          <motion.div
            key="paid"
            animate={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 8 }}
          >
            <ResultCard
              body={
                invoice?.kind === "storage_addon"
                  ? t("settings.crypto_native_paid_body_addon")
                  : t("settings.crypto_native_paid_body")
              }
              icon={<CheckCircleIcon className="w-8 h-8" />}
              title={t("settings.crypto_native_paid_title")}
              tone="accent"
            >
              <div className="mt-6 flex flex-col gap-2">
                <Button
                  className="w-full"
                  variant="primary"
                  onClick={() => navigate("/")}
                >
                  {t("settings.crypto_native_go_to_inbox")}
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={go_to_billing}
                >
                  {back_label}
                </Button>
              </div>
            </ResultCard>
          </motion.div>
        </AnimatePresence>
      </PageShell>
    );
  }

  if (is_cancelled) {
    if (cancel_requested.current) {
      return (
        <PageShell back_label={back_label} on_back={go_to_billing}>
          <div className="flex flex-col items-center gap-4">
            <Spinner
              className="h-10 w-10 text-[var(--accent-color)]"
              size="lg"
            />
            <p className="text-sm text-txt-secondary">{t("common.loading")}</p>
          </div>
        </PageShell>
      );
    }

    return (
      <PageShell back_label={back_label} on_back={go_to_billing}>
        <ResultCard
          body={t("settings.crypto_native_cancelled_body")}
          icon={<ClockIcon className="w-7 h-7" />}
          title={t("settings.crypto_native_invoice_cancelled")}
          tone="muted"
        >
          <div
            className="mt-5 flex items-start gap-3 rounded-2xl p-4 text-start"
            role="alert"
            style={{ backgroundColor: WARNING_BG, color: WARNING_FG }}
          >
            <ExclamationTriangleIcon className="mt-0.5 w-5 h-5 shrink-0" />
            <p className="text-xs font-medium leading-relaxed">
              {t("settings.crypto_native_expired_do_not_send")}
            </p>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <Button
              className="w-full"
              variant="primary"
              onClick={start_new_payment}
            >
              {t("settings.crypto_native_start_new_payment")}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={go_to_billing}
            >
              {back_label}
            </Button>
          </div>
        </ResultCard>
      </PageShell>
    );
  }

  if (is_expired || quote_lapsed_unfunded) {
    return (
      <PageShell back_label={back_label} on_back={go_to_billing}>
        <ResultCard
          body={t("settings.crypto_native_expired_body")}
          icon={<ClockIcon className="w-7 h-7" />}
          title={t("settings.crypto_native_expired_title")}
          tone="muted"
        >
          <div
            className="mt-5 flex items-start gap-3 rounded-2xl p-4 text-start"
            role="alert"
            style={{ backgroundColor: WARNING_BG, color: WARNING_FG }}
          >
            <ExclamationTriangleIcon className="mt-0.5 w-5 h-5 shrink-0" />
            <p className="text-xs font-medium leading-relaxed">
              {t("settings.crypto_native_expired_do_not_send")}
            </p>
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <Button
              className="w-full"
              variant="primary"
              onClick={start_new_payment}
            >
              {t("settings.crypto_native_start_new_payment")}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={go_to_billing}
            >
              {back_label}
            </Button>
          </div>
        </ResultCard>
      </PageShell>
    );
  }

  const steps = status_steps(t, invoice.kind === "storage_addon");
  const active_index = status_index(invoice.status);
  const status_hint = (() => {
    if (is_unknown_status) return t("settings.crypto_native_hint_processing");

    switch (invoice.status) {
      case "underpaid":
        return t("settings.crypto_native_hint_underpaid");
      case "manual_review":
        return t("settings.crypto_native_hint_manual_review");
      default:
        return steps[active_index].hint;
    }
  })();
  const status_label = status_text(t, invoice);
  const expiry_fraction = elapsed_fraction(
    invoice.created_at,
    invoice.expires_at,
    now - clock_skew_ms,
  );
  const confirmation_fraction =
    invoice.min_confirmations > 0
      ? Math.min(1, invoice.confirmations / invoice.min_confirmations)
      : 0;

  return (
    <PageShell back_label={back_label} on_back={handle_back}>
      <AnimatePresence mode="wait">
        <motion.div
          key="active"
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.05fr_1fr]"
          initial={{ opacity: 0 }}
        >
          <section className="rounded-3xl border border-edge-secondary bg-surf-secondary p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <CoinIcon
                chain={invoice.chain}
                class_name="shrink-0"
                currency={invoice.currency}
                size={40}
              />
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold text-txt-primary">
                  {has_outstanding_balance
                    ? t("settings.crypto_native_invoice_title", {
                        coin: coin_label,
                      })
                    : t("settings.crypto_native_received_title")}
                </h1>
                <p className="truncate text-xs text-txt-muted">
                  {t("settings.crypto_native_on_chain", { chain: chain_label })}
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-txt-secondary">
              {has_outstanding_balance
                ? t("settings.crypto_native_awaiting_body")
                : t("settings.crypto_native_received_body")}
            </p>

            <div className="mt-5 flex flex-col items-center gap-4">
              {has_outstanding_balance && qr_value && (
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-[20px] border border-edge-secondary bg-surf-tertiary p-2.5">
                    <RoundedQrCode size={208} value={qr_value} />
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-center text-[11px] text-txt-muted">
                    <QrCodeIcon className="w-3.5 h-3.5 shrink-0" />
                    {qr_is_address_only
                      ? t("settings.crypto_native_scan_hint_address_only", {
                          amount: `${amount_due_decimal} ${invoice.currency}`,
                        })
                      : t("settings.crypto_native_scan_hint")}
                  </span>
                </div>
              )}

              <div className="w-full space-y-2.5">
                {has_outstanding_balance && (
                  <CopyField
                    copy_hint={t("settings.crypto_native_copy_amount")}
                    copy_value={amount_due_decimal}
                    label={
                      is_underpaid
                        ? t("settings.crypto_native_send_remaining")
                        : t("settings.crypto_native_send_exactly")
                    }
                    on_copy={handle_copy}
                    value={`${amount_due_decimal} ${invoice.currency}`}
                    value_class="text-base"
                  />
                )}

                {has_outstanding_balance && (
                  <CopyField
                    copy_hint={t("settings.crypto_native_copy_address")}
                    label={t("settings.crypto_native_to_address")}
                    on_copy={handle_copy}
                    value={invoice.address}
                    value_class="text-[13px] sm:text-sm"
                  />
                )}

                {has_outstanding_balance && wallet_uri && (
                  <a
                    className="aster_btn aster_btn_primary aster_btn_md flex w-full items-center justify-center gap-2"
                    href={wallet_uri}
                    onClick={handle_open_wallet}
                  >
                    <WalletIcon className="w-4 h-4" />
                    {t("settings.crypto_native_open_wallet")}
                  </a>
                )}

                {has_outstanding_balance && (
                  <div className="space-y-1.5 pt-0.5">
                    <p className="text-xs leading-relaxed text-txt-secondary">
                      {t("settings.crypto_native_verify_address")}
                    </p>
                    <p className="text-xs leading-relaxed text-txt-muted">
                      {t("settings.crypto_native_fee_headroom")}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {(has_outstanding_balance || quote_lapsed) && (
              <div
                className="mt-5 flex items-start gap-3 rounded-2xl p-4"
                role="alert"
                style={{ backgroundColor: WARNING_BG, color: WARNING_FG }}
              >
                <ExclamationTriangleIcon className="mt-0.5 w-5 h-5 shrink-0" />
                <p className="text-xs font-medium leading-relaxed">
                  {quote_lapsed
                    ? t("settings.crypto_native_expired_do_not_send")
                    : t("settings.crypto_native_network_warning", {
                        coin: invoice.currency,
                        chain: chain_label,
                      })}
                </p>
              </div>
            )}
          </section>

          <section className="flex flex-col overflow-hidden rounded-3xl border border-edge-secondary bg-surf-secondary">
            <div className="shrink-0 p-6 sm:p-7">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-txt-secondary">
                  {has_received_funds
                    ? t("settings.crypto_native_usd_total_label")
                    : t("settings.crypto_native_usd_value_label")}
                </span>
                <span className="text-2xl font-semibold tracking-tight text-txt-primary">
                  {format_price(invoice.usd_cents, "usd")}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-txt-muted">
                {t("settings.crypto_native_rate_locked")}
              </p>
              {locked_rate_label && (
                <p className="mt-1 text-xs leading-relaxed text-txt-muted">
                  {t("settings.crypto_native_rate_value", {
                    coin: invoice.currency,
                    rate: locked_rate_label,
                  })}
                </p>
              )}
              {last_checked_at !== null && (
                <p
                  aria-live="polite"
                  className="mt-1 text-xs leading-relaxed text-txt-muted"
                >
                  {t("settings.crypto_native_last_checked", {
                    time: format_clock_time(last_checked_at),
                  })}
                </p>
              )}
            </div>

            <div
              aria-live="polite"
              className="flex flex-col border-t border-edge-secondary p-6 sm:p-7"
            >
              {connection_lost && (
                <div className="mb-4 flex items-center gap-2 rounded-2xl border border-edge-secondary bg-surf-tertiary px-4 py-2.5">
                  <ExclamationTriangleIcon className="w-4 h-4 shrink-0 text-txt-muted" />
                  <p className="text-xs leading-relaxed text-txt-secondary">
                    {t("settings.crypto_native_connection_lost")}
                  </p>
                </div>
              )}

              <LiveStatus
                hint={status_hint}
                is_live={is_active_payment}
                label={status_label}
              />

              {(is_active_payment || is_manual_review) && (
                <div className="mt-4">
                  <Button
                    aria-busy={is_checking_now}
                    className="w-full"
                    disabled={is_checking_now}
                    variant="outline"
                    onClick={handle_check_now}
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      {is_checking_now && (
                        <Spinner
                          aria-hidden="true"
                          className="h-4 w-4"
                          size="sm"
                        />
                      )}
                      {is_checking_now
                        ? t("settings.crypto_native_checking")
                        : t("settings.crypto_native_check_now")}
                    </span>
                  </Button>
                </div>
              )}

              <div className="mt-5">
                <StepList
                  active_index={active_index}
                  steps={steps}
                  title={t("settings.crypto_native_what_happens")}
                />
              </div>

              {invoice.status === "confirming" &&
                invoice.min_confirmations > 0 && (
                  <div className="mt-4 rounded-2xl border border-edge-secondary bg-surf-tertiary p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-txt-muted">
                        {t("settings.crypto_native_confirmations_label")}
                      </span>
                      <span className="font-mono text-sm font-semibold tabular-nums text-txt-primary">
                        {t("settings.crypto_native_confirmations_value", {
                          current: invoice.confirmations,
                          required: invoice.min_confirmations,
                        })}
                      </span>
                    </div>
                    <Meter
                      fraction={confirmation_fraction}
                      label={t("settings.crypto_native_confirmations_progress")}
                      value_max={invoice.min_confirmations}
                      value_now={Math.min(
                        invoice.confirmations,
                        invoice.min_confirmations,
                      )}
                    />
                  </div>
                )}

              {is_underpaid && (
                <div
                  className="mt-4 rounded-2xl p-4"
                  style={{ backgroundColor: WARNING_BG, color: WARNING_FG }}
                >
                  <p className="text-xs font-medium leading-relaxed">
                    {t("settings.crypto_native_underpaid_body", {
                      received: invoice.amount_received_decimal,
                      expected: invoice.amount_decimal,
                      remaining: amount_due_decimal,
                      coin: invoice.currency,
                    })}
                  </p>
                </div>
              )}

              {is_unknown_status && (
                <div
                  className="mt-4 rounded-2xl border border-edge-secondary bg-surf-tertiary p-4"
                  role="status"
                >
                  <p className="text-sm font-medium text-txt-primary">
                    {t("settings.crypto_native_status_processing")}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-txt-secondary">
                    {t("settings.crypto_native_hint_processing")}
                  </p>
                </div>
              )}

              {is_manual_review && (
                <div className="mt-4 rounded-2xl border border-edge-secondary bg-surf-tertiary p-4">
                  <p className="text-sm font-medium text-txt-primary">
                    {t("settings.crypto_native_manual_review")}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-txt-secondary">
                    {t("settings.crypto_native_manual_review_body")}
                  </p>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-edge-secondary px-6 py-3 sm:px-7">
              <div className="divide-y divide-edge-secondary">
                <DetailRow
                  label={t("settings.crypto_native_paying_with_label")}
                >
                  <span className="inline-flex items-center gap-2">
                    <CoinIcon
                      chain={invoice.chain}
                      currency={invoice.currency}
                      size={18}
                    />
                    {invoice.currency}
                  </span>
                </DetailRow>
                <DetailRow label={t("settings.crypto_native_network_label")}>
                  {chain_label}
                </DetailRow>
                {has_received_funds && (
                  <DetailRow label={t("settings.crypto_native_received_label")}>
                    <span className="font-mono tabular-nums">
                      {invoice.amount_received_decimal} {invoice.currency}
                    </span>
                  </DetailRow>
                )}
                <DetailRow
                  label={t("settings.crypto_native_invoice_ref_label")}
                >
                  <button
                    aria-label={t("settings.crypto_native_copy_invoice_ref")}
                    className="group inline-flex items-center gap-2 rounded-lg px-1.5 py-0.5 transition-colors hover:bg-surf-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                    type="button"
                    onClick={() => handle_copy(invoice.id)}
                  >
                    <span className="font-mono text-xs">
                      {truncate_middle(invoice.id, 8, 6)}
                    </span>
                    <ClipboardDocumentIcon className="w-3.5 h-3.5 shrink-0 text-txt-muted transition-colors group-hover:text-txt-primary" />
                  </button>
                </DetailRow>
              </div>

              {invoice.txids.length > 0 && (
                <div className="pb-4 pt-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-txt-muted">
                    {t("settings.crypto_native_transaction")}
                  </span>
                  <button
                    aria-label={t("settings.crypto_native_copy_tx_hash")}
                    className="group mt-1.5 flex w-full items-center justify-between gap-3 rounded-2xl border border-edge-secondary bg-surf-tertiary px-4 py-2.5 text-start transition-colors hover:border-edge-primary hover:bg-surf-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                    type="button"
                    onClick={() => handle_copy(invoice.txids[0])}
                  >
                    <span className="font-mono text-xs text-txt-primary">
                      {truncate_middle(invoice.txids[0])}
                    </span>
                    <ClipboardDocumentIcon className="w-4 h-4 shrink-0 text-txt-muted transition-colors group-hover:text-txt-primary" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-4 border-t border-edge-secondary p-6 sm:p-7">
              {is_active_payment && Number.isFinite(expires_ms) && (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-txt-muted">
                      <ClockIcon className="w-3.5 h-3.5" />
                      {t("settings.crypto_native_time_remaining")}
                    </span>
                    <span
                      className="font-mono text-sm font-semibold tabular-nums text-txt-primary"
                      style={{
                        color: is_expiring_soon ? WARNING_TEXT : undefined,
                      }}
                    >
                      {format_countdown(expires_ms)}
                    </span>
                  </div>
                  <Meter
                    fraction={1 - expiry_fraction}
                    label={t("settings.crypto_native_expiry_progress")}
                    value_max={100}
                    value_now={Math.round((1 - expiry_fraction) * 100)}
                  />
                  {is_expiring_soon && (
                    <p
                      className="mt-2 text-xs leading-relaxed text-txt-secondary"
                      role="status"
                    >
                      {t("settings.crypto_native_expiring_soon")}
                    </p>
                  )}
                </div>
              )}

              <p className="text-xs leading-relaxed text-txt-muted">
                {t("settings.crypto_native_refund_notice")}
              </p>

              {is_pending && (
                <Button
                  aria-busy={is_cancelling}
                  className="w-full"
                  disabled={is_cancelling}
                  is_loading={is_cancelling}
                  variant="outline"
                  onClick={() => set_confirm_cancel_open(true)}
                >
                  {t("settings.crypto_native_cancel_invoice")}
                </Button>
              )}
            </div>
          </section>
        </motion.div>
      </AnimatePresence>

      <ConfirmModal
        hide_dont_ask
        confirm_text={t("settings.crypto_native_cancel_invoice")}
        confirm_variant="destructive"
        description={t("settings.crypto_native_cancel_confirm_body")}
        dont_ask={false}
        on_cancel={() => set_confirm_cancel_open(false)}
        on_confirm={handle_cancel}
        on_dont_ask_change={() => undefined}
        show={confirm_cancel_open}
        title={t("settings.crypto_native_cancel_confirm_title")}
      />
    </PageShell>
  );
}
