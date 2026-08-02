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
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  QrCodeIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

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

type LoadState = "loading" | "ready" | "not_found" | "unavailable";

const POLL_INTERVAL_MS = 6_000;
const MAX_POLL_INTERVAL_MS = 60_000;
const MAX_CONSECUTIVE_FAILURES = 5;
const TERMINAL_STATUSES = new Set([
  "paid",
  "expired",
  "cancelled",
  "manual_review",
]);
const DEFINITIVE_ERROR_CODES = new Set(["NOT_FOUND", "FORBIDDEN"]);
const ALLOWED_WALLET_SCHEMES = new Set(["bitcoin:", "ethereum:", "monero:"]);
const CANCEL_HAS_PAYMENT_MARKER = "payment has already been received";
const BILLING_ROUTE = "/settings/billing";
const WARNING_BG = "var(--color-warning)";
const WARNING_FG = "#1c1400";

function pretty_chain(chain: string): string {
  const known: Record<string, string> = {
    bitcoin: "Bitcoin",
    base: "Base",
    ethereum: "Ethereum",
    polygon: "Polygon",
    arbitrum: "Arbitrum",
    optimism: "Optimism",
    monero: "Monero",
  };

  return known[chain] ?? chain.charAt(0).toUpperCase() + chain.slice(1);
}

function format_countdown(ms: number): string {
  if (!Number.isFinite(ms)) return "--:--";
  if (ms <= 0) return "0:00";

  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;

  return `${minutes}:${pad(seconds)}`;
}

function outstanding_atomic(
  expected_atomic: string,
  received_atomic: string,
): bigint | null {
  try {
    const remaining = BigInt(expected_atomic) - BigInt(received_atomic);

    return remaining > 0n ? remaining : 0n;
  } catch {
    return null;
  }
}

function measure_clock_skew(server_time?: string): number {
  if (!server_time) return 0;

  const server_ms = Date.parse(server_time);

  if (!Number.isFinite(server_ms)) return 0;

  return Date.now() - server_ms;
}

function safe_wallet_uri(candidate: string | null | undefined): string | null {
  if (typeof candidate !== "string" || candidate.length === 0) return null;

  try {
    const parsed = new URL(candidate);

    if (!ALLOWED_WALLET_SCHEMES.has(parsed.protocol.toLowerCase())) return null;

    return parsed.href;
  } catch {
    return null;
  }
}

function received_atomic_of(received: string): bigint | null {
  try {
    return BigInt(received);
  } catch {
    return null;
  }
}

function truncate_middle(value: string, head = 10, tail = 8): string {
  if (value.length <= head + tail + 1) return value;

  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function elapsed_fraction(created_at: string, expires_at: string, now: number): number {
  const start = Date.parse(created_at);
  const end = Date.parse(expires_at);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;

  const fraction = (now - start) / (end - start);

  return Math.min(1, Math.max(0, fraction));
}

interface StatusStep {
  key: string;
  label: string;
  hint: string;
}

interface PageShellProps {
  children: ReactNode;
  on_back: () => void;
  back_label: string;
}

function page_shell({ children, on_back, back_label }: PageShellProps) {
  return (
    <div
      className="h-screen w-full overflow-y-auto overflow-x-hidden bg-surf-primary text-txt-primary"
      style={{ height: "100dvh" }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center gap-6 px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex shrink-0 flex-col gap-5">
          <img
            alt="Aster"
            className="mx-auto h-7 w-auto select-none sm:h-8"
            decoding="async"
            draggable={false}
            src="/text_logo.png"
            style={{ filter: "var(--accent-brand-filter, none)" }}
          />
          <button
            className="inline-flex w-fit items-center gap-2 rounded-full bg-surf-secondary px-3.5 py-2 text-sm font-medium text-txt-secondary transition-colors hover:bg-surf-hover hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
            type="button"
            onClick={on_back}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            {back_label}
          </button>
        </header>

        <main className="flex shrink-0 flex-col">{children}</main>
      </div>
    </div>
  );
}

const PageShell = page_shell;

interface ResultCardProps {
  children?: ReactNode;
  body: string;
  icon: ReactNode;
  title: string;
  tone: "accent" | "muted";
}

function result_card({ body, children, icon, title, tone }: ResultCardProps) {
  const tone_style =
    tone === "accent"
      ? {
          backgroundColor: "var(--accent-color)",
          color: "var(--accent-fg, #ffffff)",
        }
      : undefined;

  return (
    <div className="mx-auto w-full max-w-md rounded-3xl border border-edge-secondary bg-surf-secondary p-8 text-center">
      <div
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${
          tone_style ? "" : "bg-surf-tertiary text-txt-muted"
        }`}
        style={tone_style}
      >
        {icon}
      </div>
      <h1 className="mt-5 text-xl font-semibold text-txt-primary">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-txt-secondary">{body}</p>
      {children}
    </div>
  );
}

const ResultCard = result_card;

interface CopyFieldProps {
  label: string;
  value: string;
  copy_value?: string;
  value_class?: string;
  on_copy: (value: string) => void;
}

function copy_field({
  label,
  value,
  copy_value,
  value_class = "text-sm",
  on_copy,
}: CopyFieldProps) {
  return (
    <button
      className="group w-full rounded-2xl border border-edge-secondary bg-surf-tertiary px-4 py-3 text-left transition-colors hover:border-edge-primary hover:bg-surf-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
      type="button"
      onClick={() => on_copy(copy_value ?? value)}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-txt-muted">
          {label}
        </span>
        <ClipboardDocumentIcon className="w-4 h-4 shrink-0 text-txt-muted transition-colors group-hover:text-txt-primary" />

      </span>
      <span
        className={`mt-1.5 block break-all font-mono font-semibold leading-snug text-txt-primary ${value_class}`}
      >
        {value}
      </span>
    </button>
  );
}

const CopyField = copy_field;

interface DetailRowProps {
  label: string;
  children: ReactNode;
}

function detail_row({ children, label }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-xs font-medium text-txt-muted">{label}</span>
      <span className="text-right text-sm font-medium text-txt-primary">{children}</span>
    </div>
  );
}

const DetailRow = detail_row;

interface LiveStatusProps {
  hint: string;
  is_live: boolean;
  label: string;
}

function live_status({ hint, is_live, label }: LiveStatusProps) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Spinner
        className={`h-10 w-10 text-[var(--accent-color)] ${is_live ? "" : "opacity-40"}`}
        size="lg"
      />
      <span className="text-sm font-semibold text-txt-primary">{label}</span>
      <p className="max-w-xs text-xs leading-relaxed text-txt-secondary">{hint}</p>
    </div>
  );
}

const LiveStatus = live_status;

interface StepListProps {
  active_index: number;
  steps: StatusStep[];
  title: string;
}

function step_list({ active_index, steps, title }: StepListProps) {
  return (
    <div className="rounded-2xl bg-surf-tertiary p-4">
      <span className="text-[11px] font-medium uppercase tracking-wide text-txt-muted">
        {title}
      </span>
      <ol className="mt-3 flex flex-col gap-3">
        {steps.map((step, index) => {
          const done = index < active_index;
          const current = index === active_index;
          const reached = done || current;

          return (
            <li key={step.key} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                  reached ? "" : "bg-surf-secondary text-txt-muted"
                }`}
                style={
                  reached
                    ? {
                        backgroundColor: "var(--accent-color)",
                        color: "var(--accent-fg, #ffffff)",
                      }
                    : undefined
                }
              >
                {done ? <CheckIcon className="w-3 h-3" /> : index + 1}
              </span>
              <span className="flex min-w-0 flex-col">
                <span
                  className="text-xs leading-tight"
                  style={{
                    color: reached ? "var(--text-primary)" : "var(--text-muted)",
                    fontWeight: current ? 600 : 500,
                  }}
                >
                  {step.label}
                </span>
                <span className="mt-0.5 text-[11px] leading-relaxed text-txt-muted">
                  {step.hint}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const StepList = step_list;

interface MeterProps {
  fraction: number;
  label: string;
  value_max: number;
  value_now: number;
}

function meter({ fraction, label, value_max, value_now }: MeterProps) {
  const percent = Math.max(0, Math.min(100, Math.round(fraction * 100)));

  return (
    <div
      aria-label={label}
      aria-valuemax={value_max}
      aria-valuemin={0}
      aria-valuenow={value_now}
      className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-surf-tertiary"
      role="progressbar"
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-linear"
        style={{
          backgroundColor: "var(--accent-color)",
          width: `${percent}%`,
        }}
      />
    </div>
  );
}

const Meter = meter;

export default function CryptoInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { t } = use_i18n();
  const navigate = useNavigate();

  const [invoice, set_invoice] = useState<CryptoNativeInvoiceStatus | null>(null);
  const [load_state, set_load_state] = useState<LoadState>("loading");
  const [connection_lost, set_connection_lost] = useState(false);
  const [now, set_now] = useState(() => Date.now());
  const [clock_skew_ms, set_clock_skew_ms] = useState(0);
  const [is_cancelling, set_is_cancelling] = useState(false);
  const [confirm_cancel_open, set_confirm_cancel_open] = useState(false);
  const [copied_value, set_copied_value] = useState<string | null>(null);
  const credited_notified = useRef(false);
  const cancel_notified = useRef(false);
  const consecutive_failures = useRef(0);
  const poll_interval_ref = useRef(POLL_INTERVAL_MS);
  const has_loaded_ref = useRef(false);
  const load_state_ref = useRef<LoadState>("loading");
  const copied_timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go_to_billing = useCallback(() => {
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

  const fetch_invoice = useCallback(async () => {
    if (!id) {
      apply_load_state("not_found");

      return;
    }

    const response = await get_crypto_native_invoice(id).catch(() => null);

    if (response?.data) {
      consecutive_failures.current = 0;
      poll_interval_ref.current = POLL_INTERVAL_MS;
      has_loaded_ref.current = true;
      set_connection_lost(false);
      set_clock_skew_ms(measure_clock_skew(response.data.server_time));
      set_invoice(response.data);
      apply_load_state("ready");

      return;
    }

    if (response?.code && DEFINITIVE_ERROR_CODES.has(response.code)) {
      apply_load_state("not_found");

      return;
    }

    consecutive_failures.current += 1;
    poll_interval_ref.current = Math.min(
      poll_interval_ref.current * 2,
      MAX_POLL_INTERVAL_MS,
    );

    if (!has_loaded_ref.current) {
      apply_load_state("unavailable");

      return;
    }

    if (consecutive_failures.current >= MAX_CONSECUTIVE_FAILURES) {
      set_connection_lost(true);
    }
  }, [apply_load_state, id]);

  const handle_retry = useCallback(() => {
    consecutive_failures.current = 0;
    poll_interval_ref.current = POLL_INTERVAL_MS;
    void fetch_invoice();
  }, [fetch_invoice]);

  useEffect(() => {
    void fetch_invoice();
  }, [fetch_invoice]);

  useEffect(() => {
    const status = invoice?.status;

    if (!status || TERMINAL_STATUSES.has(status)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const should_stop = () => cancelled || load_state_ref.current === "not_found";

    const tick = async () => {
      if (should_stop()) return;

      await fetch_invoice();

      if (should_stop()) return;

      timer = setTimeout(() => void tick(), poll_interval_ref.current);
    };

    timer = setTimeout(() => void tick(), poll_interval_ref.current);

    return () => {
      cancelled = true;

      if (timer) clearTimeout(timer);
    };
  }, [invoice?.status, fetch_invoice]);

  useEffect(() => {
    const timer = setInterval(() => set_now(Date.now()), 1_000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (copied_timer.current) clearTimeout(copied_timer.current);
    };
  }, []);

  useEffect(() => {
    if (invoice?.status !== "cancelled" || cancel_notified.current) return;

    cancel_notified.current = true;
    forget_crypto_selection();
    show_toast(t("settings.crypto_native_cancelled_title"), "success");
    navigate(BILLING_ROUTE, { replace: true });
  }, [invoice?.status, navigate, t]);

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
      try {
        await navigator.clipboard.writeText(value);
        set_copied_value(value);

        if (copied_timer.current) clearTimeout(copied_timer.current);

        copied_timer.current = setTimeout(() => set_copied_value(null), 2_000);
        show_toast(t("settings.crypto_native_copied"), "success");
      } catch {
        show_toast(t("common.failed_to_copy"), "error");
      }
    },
    [t],
  );

  const handle_cancel = useCallback(async () => {
    if (!id) return;

    set_confirm_cancel_open(false);
    set_is_cancelling(true);

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
          (response.error ?? "").toLowerCase().includes(CANCEL_HAS_PAYMENT_MARKER);

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
      <PageShell back_label={t("settings.crypto_native_view_billing")} on_back={go_to_billing}>
        <div className="flex flex-col items-center gap-4">
          <span className="relative flex h-12 w-12 items-center justify-center">
            <span
              className="absolute inset-0 animate-ping rounded-full bg-brand opacity-30"
            />
            <span
              className="relative h-12 w-12 animate-spin rounded-full border-2 border-transparent"
              style={{
                borderTopColor: "var(--accent-color)",
                borderRightColor: "var(--accent-color)",
              }}
            />
          </span>
          <p className="text-sm text-txt-secondary">{t("common.loading")}</p>
        </div>
      </PageShell>
    );
  }

  if (load_state === "unavailable" && !invoice) {
    return (
      <PageShell back_label={t("settings.crypto_native_view_billing")} on_back={go_to_billing}>
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
      <PageShell back_label={t("settings.crypto_native_view_billing")} on_back={go_to_billing}>
        <ResultCard
          body={t("settings.crypto_native_back_hint")}
          icon={<ExclamationTriangleIcon className="w-7 h-7" />}
          title={t("settings.crypto_native_not_found")}
          tone="muted"
        >
          <div className="mt-6">
            <Button className="w-full" variant="primary" onClick={go_to_billing}>
              {t("settings.crypto_native_view_billing")}
            </Button>
          </div>
        </ResultCard>
      </PageShell>
    );
  }

  const coin_label = invoice.display_name;
  const chain_label = pretty_chain(invoice.chain);
  const expires_raw = new Date(invoice.expires_at).getTime() - (now - clock_skew_ms);
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
  const is_awaiting_funds = is_pending || is_detected || is_underpaid;

  const due_atomic = outstanding_atomic(
    invoice.amount_atomic,
    invoice.amount_received_atomic,
  );
  const received_atomic = received_atomic_of(invoice.amount_received_atomic);
  const has_received_funds = received_atomic !== null && received_atomic > 0n;
  const amount_due_decimal = invoice.amount_due_decimal;
  const wallet_uri = safe_wallet_uri(invoice.payment_uri);
  const quote_lapsed = is_awaiting_funds && expires_ms <= 0;
  const quote_lapsed_unfunded = quote_lapsed && !has_received_funds;
  const has_outstanding_balance =
    is_awaiting_funds && !quote_lapsed && (due_atomic === null || due_atomic > 0n);
  const is_active_payment = is_awaiting_funds && !quote_lapsed;

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
              body={t("settings.crypto_native_paid_body")}
              icon={<CheckCircleIcon className="w-8 h-8" />}
              title={t("settings.crypto_native_paid_title")}
              tone="accent"
            >
              <div className="mt-6 flex flex-col gap-2">
                <Button className="w-full" variant="primary" onClick={() => navigate("/")}>
                  {t("settings.crypto_native_go_to_inbox")}
                </Button>
                <Button className="w-full" variant="outline" onClick={go_to_billing}>
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
    return (
      <PageShell back_label={back_label} on_back={go_to_billing}>
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-10 w-10 text-[var(--accent-color)]" size="lg" />
          <p className="text-sm text-txt-secondary">{t("common.loading")}</p>
        </div>
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
            className="mt-5 flex items-start gap-3 rounded-2xl p-4 text-left"
            role="alert"
            style={{ backgroundColor: WARNING_BG, color: WARNING_FG }}
          >
            <ExclamationTriangleIcon className="mt-0.5 w-5 h-5 shrink-0" />
            <p className="text-xs font-medium leading-relaxed">
              {t("settings.crypto_native_expired_do_not_send")}
            </p>
          </div>
          <div className="mt-5">
            <Button className="w-full" variant="primary" onClick={go_to_billing}>
              {back_label}
            </Button>
          </div>
        </ResultCard>
      </PageShell>
    );
  }

  const steps: StatusStep[] = [
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
      hint: t("settings.crypto_native_hint_confirming"),
    },
    {
      key: "paid",
      label: t("settings.crypto_native_status_credited"),
      hint: t("settings.crypto_native_hint_credited"),
    },
  ];

  const active_index = (() => {
    switch (invoice.status) {
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
  })();

  const status_hint = (() => {
    switch (invoice.status) {
      case "underpaid":
        return t("settings.crypto_native_hint_underpaid");
      case "manual_review":
        return t("settings.crypto_native_hint_manual_review");
      default:
        return steps[active_index].hint;
    }
  })();
  const status_label = (() => {
    switch (invoice.status) {
      case "underpaid":
        return t("settings.crypto_native_status_underpaid");
      case "manual_review":
        return t("settings.crypto_native_manual_review");
      default:
        return steps[active_index].label;
    }
  })();
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
                    ? t("settings.crypto_native_invoice_title", { coin: coin_label })
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
              {has_outstanding_balance && wallet_uri && (
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-3xl border border-edge-secondary bg-surf-tertiary p-4">
                    <RoundedQrCode size={192} value={wallet_uri} />
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-txt-muted">
                    <QrCodeIcon className="w-3.5 h-3.5" />
                    {t("settings.crypto_native_scan_hint")}
                  </span>
                </div>
              )}

              <div className="w-full space-y-2.5">
                {has_outstanding_balance && (
                  <CopyField
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
                    label={t("settings.crypto_native_to_address")}
                    on_copy={handle_copy}
                    value={invoice.address}
                    value_class="text-[13px] sm:text-sm"
                  />
                )}

                {has_outstanding_balance && wallet_uri && (
                  <a
                    className="aster_btn aster_btn_secondary aster_btn_md flex w-full items-center justify-center gap-2"
                    href={wallet_uri}
                  >
                    <WalletIcon className="w-4 h-4" />
                    {t("settings.crypto_native_open_wallet")}
                  </a>
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

              <div className="mt-5">
                <StepList
                  active_index={active_index}
                  steps={steps}
                  title={t("settings.crypto_native_what_happens")}
                />
              </div>

              {invoice.status === "confirming" && invoice.min_confirmations > 0 && (
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
                <DetailRow label={t("settings.crypto_native_paying_with_label")}>
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
                <DetailRow label={t("settings.crypto_native_invoice_ref_label")}>
                  <span className="font-mono text-xs">{truncate_middle(invoice.id, 8, 6)}</span>
                </DetailRow>
              </div>

              {invoice.txids.length > 0 && (
                <div className="pb-4 pt-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-txt-muted">
                    {t("settings.crypto_native_transaction")}
                  </span>
                  <button
                    aria-label={t("settings.crypto_native_copy_tx_hash")}
                    className="group mt-1.5 flex w-full items-center justify-between gap-3 rounded-2xl border border-edge-secondary bg-surf-tertiary px-4 py-2.5 text-left transition-colors hover:border-edge-primary hover:bg-surf-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                    type="button"
                    onClick={() => handle_copy(invoice.txids[0])}
                  >
                    <span className="font-mono text-xs text-txt-primary">
                      {truncate_middle(invoice.txids[0])}
                    </span>
                    {copied_value === invoice.txids[0] ? (
                      <CheckIcon className="w-4 h-4 shrink-0 text-aster-success" />
                    ) : (
                      <ClipboardDocumentIcon className="w-4 h-4 shrink-0 text-txt-muted transition-colors group-hover:text-txt-primary" />
                    )}
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
                    <span className="font-mono text-sm font-semibold tabular-nums text-txt-primary">
                      {format_countdown(expires_ms)}
                    </span>
                  </div>
                  <Meter
                    fraction={1 - expiry_fraction}
                    label={t("settings.crypto_native_expiry_progress")}
                    value_max={100}
                    value_now={Math.round((1 - expiry_fraction) * 100)}
                  />
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
                  variant="outline"
                  onClick={() => set_confirm_cancel_open(true)}
                >
                  {is_cancelling
                    ? t("settings.cancelling")
                    : t("settings.crypto_native_cancel_invoice")}
                </Button>
              )}
            </div>
          </section>
        </motion.div>
      </AnimatePresence>

      <ConfirmModal
        confirm_text={t("settings.crypto_native_cancel_invoice")}
        confirm_variant="destructive"
        description={t("settings.crypto_native_cancel_confirm_body")}
        dont_ask={false}
        hide_dont_ask
        show={confirm_cancel_open}
        title={t("settings.crypto_native_cancel_confirm_title")}
        on_cancel={() => set_confirm_cancel_open(false)}
        on_confirm={handle_cancel}
        on_dont_ask_change={() => undefined}
      />
    </PageShell>
  );
}
