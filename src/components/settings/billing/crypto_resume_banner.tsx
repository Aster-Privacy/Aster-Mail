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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { XMarkIcon } from "@heroicons/react/24/outline";

import { ConfirmModal } from "@/components/email/inbox/inbox_confirmation_dialog";
import { CoinIcon } from "@/components/ui/coin_icon";
import { use_i18n } from "@/lib/i18n/context";
import {
  cancel_crypto_native_invoice,
  format_price,
  list_pending_crypto_invoices,
  type CryptoNativePendingInvoice,
} from "@/services/api/billing";

import {
  CRYPTO_INVOICE_CHANGED_EVENT,
  notify_crypto_invoice_changed,
} from "./billing_constants";

const DISMISSED_STORAGE_KEY = "aster_crypto_banner_dismissed";
const REFRESH_INTERVAL_MS = 60_000;

function parse_dismissed(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.length > 0,
      );
    }

    if (typeof parsed === "string") return parsed ? [parsed] : [];

    return [];
  } catch {
    return [raw];
  }
}

function read_dismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);

    if (!raw) return [];

    return parse_dismissed(raw);
  } catch {
    return [];
  }
}

function store_dismissed(invoice_ids: string[]): void {
  try {
    localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(invoice_ids));
  } catch {
    return;
  }
}

function invoice_key(invoice: CryptoNativePendingInvoice): string {
  return `${invoice.id}|${invoice.created_at}`;
}

const RESUMABLE_STATUSES = new Set([
  "pending",
  "detected",
  "confirming",
  "underpaid",
]);

function is_resumable(invoice: CryptoNativePendingInvoice): boolean {
  return RESUMABLE_STATUSES.has(invoice.status);
}

function format_countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;

  return `${minutes}:${pad(seconds)}`;
}

interface CryptoResumeBannerProps {
  class_name?: string;
}

export function CryptoResumeBanner({ class_name = "" }: CryptoResumeBannerProps) {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const [invoices, set_invoices] = useState<CryptoNativePendingInvoice[]>([]);
  const [dismissed_ids, set_dismissed_ids] = useState<string[]>(() =>
    read_dismissed(),
  );
  const [now, set_now] = useState(() => Date.now());
  const [confirm_open, set_confirm_open] = useState(false);
  const [is_cancelling, set_is_cancelling] = useState(false);
  const [cancel_failed, set_cancel_failed] = useState(false);
  const mounted_ref = useRef(true);
  const cancelling_ref = useRef(false);
  const request_ref = useRef(0);

  const refresh = useCallback(async () => {
    const request_id = request_ref.current + 1;

    request_ref.current = request_id;

    const response = await list_pending_crypto_invoices().catch(() => null);
    const next = response?.data?.invoices;

    if (!mounted_ref.current || request_id !== request_ref.current) return;
    if (!Array.isArray(next)) return;

    const live_keys = new Set(next.map(invoice_key));

    set_dismissed_ids((current) => {
      const pruned = current.filter((key) => live_keys.has(key));

      if (pruned.length === current.length) return current;

      store_dismissed(pruned);

      return pruned;
    });
    set_invoices(next);
    set_now(Date.now());
  }, []);

  useEffect(() => {
    mounted_ref.current = true;

    void refresh();

    const on_changed = () => void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);

    window.addEventListener(CRYPTO_INVOICE_CHANGED_EVENT, on_changed);
    window.addEventListener("focus", on_changed);

    return () => {
      mounted_ref.current = false;
      clearInterval(timer);
      window.removeEventListener(CRYPTO_INVOICE_CHANGED_EVENT, on_changed);
      window.removeEventListener("focus", on_changed);
    };
  }, [refresh]);

  const visible = useMemo(
    () =>
      invoices.filter(
        (entry) =>
          !dismissed_ids.includes(invoice_key(entry)) && is_resumable(entry),
      ),
    [dismissed_ids, invoices],
  );

  const invoice = visible[0] ?? null;
  const pending_count = visible.length;

  const countdown_key =
    invoice &&
    invoice.status === "pending" &&
    Number.isFinite(Date.parse(invoice.expires_at))
      ? `${invoice_key(invoice)}|${invoice.expires_at}`
      : "";

  useEffect(() => {
    if (!countdown_key) return;

    const timer = setInterval(() => set_now(Date.now()), 1_000);

    return () => clearInterval(timer);
  }, [countdown_key]);

  const handle_dismiss = useCallback(() => {
    if (!invoice) return;

    const key = invoice_key(invoice);
    const next = dismissed_ids.includes(key)
      ? dismissed_ids
      : [...dismissed_ids, key];

    store_dismissed(next);
    set_dismissed_ids(next);
  }, [dismissed_ids, invoice]);

  const handle_cancel_request = useCallback(() => {
    set_cancel_failed(false);
    set_confirm_open(true);
  }, []);

  const handle_cancel_dismiss = useCallback(() => {
    if (cancelling_ref.current) return;

    set_confirm_open(false);
  }, []);

  const handle_cancel_confirm = useCallback(() => {
    if (!invoice || cancelling_ref.current) return;

    cancelling_ref.current = true;
    set_is_cancelling(true);
    set_cancel_failed(false);

    void (async () => {
      const response = await cancel_crypto_native_invoice(invoice.id).catch(
        () => null,
      );

      cancelling_ref.current = false;

      if (!mounted_ref.current) return;

      set_is_cancelling(false);

      if (!response?.data) {
        set_cancel_failed(true);

        return;
      }

      set_confirm_open(false);
      notify_crypto_invoice_changed();
    })();
  }, [invoice]);

  if (!invoice) return null;

  const show_countdown = countdown_key !== "";
  const expires_ms = Date.parse(invoice.expires_at) - now;
  const is_pending = invoice.status === "pending";

  return (
    <div
      className={`rounded-xl bg-surf-secondary border border-edge-secondary px-4 py-3.5 ${class_name}`}
    >
      <div className="flex items-center gap-3">
        <CoinIcon
          chain={invoice.chain}
          currency={invoice.currency}
          size={32}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-txt-primary">
            {pending_count > 1
              ? t("settings.crypto_native_pending_banner_multi", {
                  count: String(pending_count),
                })
              : t("settings.crypto_native_pending_banner")}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-txt-muted">
            {invoice.amount_decimal && (
              <>
                <span className="font-mono tabular-nums">
                  {invoice.amount_decimal} {invoice.currency}
                </span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>{format_price(invoice.usd_cents, "usd")}</span>
            {show_countdown && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {format_countdown(expires_ms)}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-brand hover:bg-brand-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:opacity-50"
            disabled={is_cancelling}
            style={{ color: "var(--accent-fg, #ffffff)" }}
            type="button"
            onClick={() => navigate(`/crypto-invoice/${invoice.id}`)}
          >
            {t("settings.crypto_native_pending_banner_action")}
          </button>
          {is_pending && (
            <button
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-txt-secondary hover:text-txt-primary hover:bg-surf-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:opacity-50"
              disabled={is_cancelling}
              type="button"
              onClick={handle_cancel_request}
            >
              {t("common.cancel")}
            </button>
          )}
          <button
            aria-label={t("common.dismiss")}
            className="p-1.5 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-surf-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
            type="button"
            onClick={handle_dismiss}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      {cancel_failed && (
        <p className="mt-2 text-xs text-aster-danger">
          {t("settings.crypto_native_cancel_failed")}
        </p>
      )}
      <ConfirmModal
        confirm_text={t("settings.crypto_native_cancel_invoice")}
        confirm_variant="destructive"
        description={t("settings.crypto_native_cancel_confirm_body")}
        dont_ask={false}
        hide_dont_ask
        on_cancel={handle_cancel_dismiss}
        on_confirm={handle_cancel_confirm}
        on_dont_ask_change={() => undefined}
        show={confirm_open}
        title={t("settings.crypto_native_cancel_confirm_title")}
      />
    </div>
  );
}
