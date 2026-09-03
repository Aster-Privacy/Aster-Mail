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
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { BanknotesIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { checkout_error_text } from "./checkout_error_text";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  create_crypto_native_addon_invoice,
  get_crypto_native_coins,
  purchase_storage_addon_crypto,
  format_price,
  type CryptoNativeCoin,
} from "@/services/api/billing";
import { addon_return_url } from "@/lib/addon_return_url";
import { payment_url_or_throw } from "@/lib/payment_url";
import { mark_payment_navigation } from "@/lib/payment_navigation";
import { Spinner } from "@/components/ui/spinner";
import { CoinIcon } from "@/components/ui/coin_icon";
import {
  show_toast,
  TOAST_DURATION_BILLING_MS,
} from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { prefetch_crypto_invoice_page } from "@/pages/crypto_invoice/prefetch";
import { notify_crypto_invoice_changed } from "@/components/settings/billing/billing_constants";

type TermMonths = 1 | 3 | 6 | 12 | 24;
type Step = "term" | "method";
type CoinsStatus = "loading" | "ready" | "disabled" | "failed";

interface CryptoAddonTermModalProps {
  is_open: boolean;
  on_close: () => void;
  on_checkout_opened?: () => void;
  addon_id: string;
  addon_name: string;
  price_cents: number;
  preferred_currency: string;
  enable_native?: boolean;
}

const TERM_OPTIONS: TermMonths[] = [1, 3, 6, 12, 24];
const CHARGE_CURRENCY = "usd";

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

function coin_title(display_name: string, chain: string): string {
  const suffix = ` (${pretty_chain(chain)})`;

  return display_name.toLowerCase().endsWith(suffix.toLowerCase())
    ? display_name.slice(0, display_name.length - suffix.length).trim()
    : display_name;
}

export function crypto_addon_term_modal({
  is_open,
  on_close,
  on_checkout_opened,
  addon_id,
  addon_name,
  price_cents,
  enable_native = true,
}: CryptoAddonTermModalProps) {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const is_ios = Capacitor.getPlatform() === "ios";
  const native_supported = enable_native && !is_ios;

  const [step, set_step] = useState<Step>("term");
  const [selected_term, set_selected_term] = useState<TermMonths>(12);
  const [is_loading, set_is_loading] = useState(false);
  const [creating_key, set_creating_key] = useState<string | null>(null);
  const [coins, set_coins] = useState<CryptoNativeCoin[]>([]);
  const [coins_status, set_coins_status] = useState<CoinsStatus>("loading");
  const [coins_reload_token, set_coins_reload_token] = useState(0);
  const [show_energy, set_show_energy] = useState(false);
  const term_button_refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!is_open) return;

    prefetch_crypto_invoice_page();

    set_step("term");
    set_creating_key(null);
  }, [is_open]);

  useEffect(() => {
    if (!is_open) return;

    if (!native_supported) {
      set_coins([]);
      set_coins_status("disabled");

      return;
    }

    let cancelled = false;

    set_coins_status("loading");
    (async () => {
      try {
        const response = await get_crypto_native_coins();

        if (cancelled) return;

        if (response.data?.enabled && response.data.coins.length > 0) {
          set_coins(response.data.coins);
          set_coins_status("ready");

          return;
        }

        set_coins([]);
        set_coins_status(response.data ? "disabled" : "failed");
      } catch {
        if (cancelled) return;

        set_coins([]);
        set_coins_status("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [is_open, native_supported, coins_reload_token]);

  const retry_coins = () => {
    set_coins_status("loading");
    set_coins_reload_token((token) => token + 1);
  };

  const sorted_coins = useMemo(() => {
    return [...coins].sort((a, b) => {
      if (a.recommended === b.recommended) return 0;

      return a.recommended ? -1 : 1;
    });
  }, [coins]);

  const compute_price_cents = (term: TermMonths): number => price_cents * term;

  const term_label = (term: TermMonths): string => {
    if (term === 1) return t("settings.crypto_term_1mo");
    if (term === 3) return t("settings.crypto_term_3mo");
    if (term === 6) return t("settings.crypto_term_6mo");
    if (term === 12) return t("settings.crypto_term_12mo");

    return t("settings.crypto_term_24mo");
  };

  const selected_price_label = format_price(
    compute_price_cents(selected_term),
    CHARGE_CURRENCY,
  );

  const move_term_focus = (from_index: number, delta: number) => {
    const next_index =
      (from_index + delta + TERM_OPTIONS.length) % TERM_OPTIONS.length;

    set_selected_term(TERM_OPTIONS[next_index]);
    term_button_refs.current[next_index]?.focus();
  };

  const handle_term_keydown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      move_term_focus(index, 1);

      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      move_term_focus(index, -1);

      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      move_term_focus(0, 0);

      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      move_term_focus(TERM_OPTIONS.length - 1, 0);
    }
  };

  const handle_stripe = async () => {
    set_is_loading(true);
    try {
      const is_tauri =
        typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      const origin = is_tauri
        ? "https://app.astermail.org"
        : window.location.origin;
      const response = await purchase_storage_addon_crypto(
        addon_id,
        selected_term,
        addon_return_url("success") ?? `${origin}/?addon_purchase=success`,
        addon_return_url("cancelled") ?? `${origin}/?addon_purchase=cancelled`,
      );

      if (response.data?.url) {
        if (is_tauri) {
          const safe_url = payment_url_or_throw(response.data.url);
          const core = await import("@tauri-apps/api/core");

          await core.invoke("open_external_url", { url: safe_url });
          on_checkout_opened?.();
          on_close();
        } else {
          mark_payment_navigation();
          window.location.href = payment_url_or_throw(response.data.url);
        }

        return;
      }
      show_toast(
        checkout_error_text(t, response.server_code),
        "error",
        TOAST_DURATION_BILLING_MS,
      );
      set_is_loading(false);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(
        t("settings.failed_checkout"),
        "error",
        TOAST_DURATION_BILLING_MS,
      );
      set_is_loading(false);
    }
  };

  const handle_native = async (coin: CryptoNativeCoin) => {
    const key = `${coin.currency}:${coin.chain}`;

    set_creating_key(key);
    try {
      const response = await create_crypto_native_addon_invoice(
        addon_id,
        selected_term,
        coin.currency,
        coin.chain,
      );

      if (response.data?.id) {
        notify_crypto_invoice_changed();
        on_close();
        navigate(`/crypto-invoice/${response.data.id}`);

        return;
      }
      if (response.code === "CONFLICT") {
        show_toast(
          t("settings.crypto_native_too_many_open"),
          "error",
          TOAST_DURATION_BILLING_MS,
        );

        return;
      }
      if (response.code === "RATE_LIMIT_EXCEEDED") {
        show_toast(
          t("settings.crypto_native_daily_limit"),
          "error",
          TOAST_DURATION_BILLING_MS,
        );

        return;
      }
      show_toast(
        checkout_error_text(t, response.server_code),
        "error",
        TOAST_DURATION_BILLING_MS,
      );
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(
        t("settings.failed_checkout"),
        "error",
        TOAST_DURATION_BILLING_MS,
      );
    } finally {
      set_creating_key(null);
    }
  };

  const advance_to_method = () => {
    if (native_supported) {
      set_step("method");
    } else {
      void handle_stripe();
    }
  };

  const busy = is_loading || creating_key !== null;

  return (
    <>
      <Modal
        show_close_button
        close_on_escape={false}
        close_on_overlay={false}
        is_open={is_open}
        on_close={on_close}
        size="md"
      >
        {step === "term" ? (
          <>
            <ModalHeader>
              <ModalTitle>{t("settings.crypto_modal_title")}</ModalTitle>
              <ModalDescription>{addon_name}</ModalDescription>
            </ModalHeader>
            <ModalBody>
              <div
                aria-label={t("settings.crypto_modal_title")}
                className="space-y-2"
                role="radiogroup"
              >
                {TERM_OPTIONS.map((term, index) => {
                  const is_selected = selected_term === term;
                  const price = compute_price_cents(term);

                  return (
                    <button
                      key={term}
                      ref={(element) => {
                        term_button_refs.current[index] = element;
                      }}
                      aria-checked={is_selected}
                      className={`w-full flex items-center justify-between gap-3 rounded-[14px] border p-3.5 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:opacity-60 disabled:cursor-not-allowed ${
                        is_selected
                          ? "bg-brand border-brand"
                          : "bg-surf-tertiary border-edge-secondary hover:bg-surf-hover hover:border-edge-primary"
                      }`}
                      disabled={is_loading}
                      role="radio"
                      tabIndex={is_selected ? 0 : -1}
                      type="button"
                      onClick={() => set_selected_term(term)}
                      onKeyDown={(event) => handle_term_keydown(event, index)}
                    >
                      <span
                        className="text-sm font-medium"
                        style={{
                          color: is_selected
                            ? "var(--accent-fg, #ffffff)"
                            : "var(--text-primary)",
                        }}
                      >
                        {term_label(term)}
                      </span>
                      <span
                        className="text-sm font-semibold"
                        style={{
                          color: is_selected
                            ? "var(--accent-fg, #ffffff)"
                            : "var(--text-primary)",
                        }}
                      >
                        {t("settings.crypto_modal_price", {
                          amount: format_price(price, CHARGE_CURRENCY),
                        })}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-txt-muted">
                {t("settings.crypto_charged_in_usd")}{" "}
                {t("settings.crypto_no_renew_notice")}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-txt-muted">
                {t("settings.crypto_rate_notice")}
              </p>
              <div
                className="mt-3 rounded-[14px] border border-edge-secondary bg-surf-tertiary p-3.5 text-xs leading-relaxed text-txt-secondary"
                role="note"
              >
                {t("settings.crypto_exchange_warning")}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                disabled={is_loading}
                variant="outline"
                onClick={on_close}
              >
                {t("common.back")}
              </Button>
              <Button
                disabled={is_loading}
                variant="primary"
                onClick={advance_to_method}
              >
                {native_supported
                  ? t("settings.crypto_native_continue")
                  : t("settings.crypto_modal_confirm")}
              </Button>
            </ModalFooter>
          </>
        ) : (
          <>
            <ModalHeader>
              <ModalTitle>
                {t("settings.crypto_native_choose_method")}
              </ModalTitle>
            </ModalHeader>
            <ModalBody>
              <dl className="mb-4 space-y-2 rounded-[14px] border border-edge-secondary bg-surf-tertiary p-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs text-txt-muted">
                    {t("settings.crypto_summary_addon")}
                  </dt>
                  <dd className="text-sm font-medium text-txt-primary">
                    {addon_name}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs text-txt-muted">
                    {t("settings.crypto_summary_length")}
                  </dt>
                  <dd className="text-sm font-medium text-txt-primary">
                    {term_label(selected_term)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-edge-secondary pt-2">
                  <dt className="text-xs text-txt-muted">
                    {t("common.total")}
                  </dt>
                  <dd className="text-base font-semibold text-txt-primary">
                    {selected_price_label}
                  </dd>
                </div>
              </dl>
              {coins_status === "loading" ? (
                <div className="flex items-center justify-center gap-3 py-8 text-txt-secondary">
                  <Spinner size="md" />
                  <span className="text-sm">
                    {t("settings.crypto_native_loading_coins")}
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  {coins_status === "failed" && (
                    <div
                      className="flex flex-col gap-3 rounded-[14px] border border-edge-secondary bg-surf-tertiary p-3.5"
                      role="alert"
                    >
                      <span className="text-sm text-txt-secondary">
                        {t("settings.crypto_native_coins_unavailable")}
                      </span>
                      <div className="flex">
                        <Button
                          disabled={busy}
                          size="sm"
                          variant="outline"
                          onClick={retry_coins}
                        >
                          {t("common.retry")}
                        </Button>
                      </div>
                    </div>
                  )}

                  <p className="pb-1 text-xs leading-relaxed text-txt-muted">
                    {t("settings.crypto_native_commit_notice")}
                  </p>

                  {sorted_coins.map((coin) => {
                    const key = `${coin.currency}:${coin.chain}`;
                    const is_creating = creating_key === key;

                    return (
                      <button
                        key={key}
                        aria-busy={is_creating}
                        className={`w-full flex items-center justify-between gap-3 rounded-[14px] border p-3.5 text-start transition-colors bg-surf-tertiary hover:bg-surf-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:cursor-not-allowed ${
                          coin.recommended
                            ? "border-brand"
                            : "border-edge-secondary hover:border-edge-primary"
                        }`}
                        disabled={busy}
                        type="button"
                        onClick={() => handle_native(coin)}
                      >
                        <span className="flex items-center gap-3 min-w-0">
                          <CoinIcon
                            chain={coin.chain}
                            currency={coin.currency}
                            size={32}
                          />
                          <span className="flex flex-col min-w-0">
                            <span className="text-sm font-medium text-txt-primary truncate">
                              {coin_title(coin.display_name, coin.chain)} (
                              {coin.currency})
                            </span>
                            <span className="text-xs text-txt-muted truncate">
                              {t("settings.crypto_native_on_chain", {
                                chain: pretty_chain(coin.chain),
                              })}
                            </span>
                          </span>
                        </span>
                        <span className="flex h-6 shrink-0 items-center justify-end">
                          {is_creating ? (
                            <Spinner size="sm" />
                          ) : coin.recommended ? (
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                              style={{
                                backgroundColor: "var(--accent-color)",
                                color: "var(--accent-fg, #ffffff)",
                              }}
                            >
                              {t("settings.crypto_native_recommended")}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}

                  <button
                    aria-busy={is_loading}
                    className="w-full flex items-center justify-between gap-3 rounded-[14px] border border-edge-secondary p-3.5 text-start transition-colors bg-surf-tertiary hover:bg-surf-hover hover:border-edge-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:cursor-not-allowed"
                    disabled={busy}
                    type="button"
                    onClick={handle_stripe}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <CoinIcon chain="generic" currency="stable" size={32} />
                      <span className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-txt-primary truncate">
                          {t("settings.crypto_native_stripe_option")}
                        </span>
                        <span className="text-xs text-txt-muted line-clamp-2">
                          {t("settings.crypto_native_stripe_desc")}
                        </span>
                      </span>
                    </span>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                      {is_loading ? (
                        <Spinner size="sm" />
                      ) : (
                        <BanknotesIcon className="w-5 h-5 text-txt-muted" />
                      )}
                    </span>
                  </button>
                </div>
              )}
            </ModalBody>
            <ModalFooter className="justify-between">
              <button
                className="text-xs font-medium text-txt-muted underline underline-offset-2 transition-colors hover:text-txt-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]"
                type="button"
                onClick={() => set_show_energy(true)}
              >
                {t("settings.crypto_energy_toggle")}
              </button>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => set_step("term")}
              >
                {t("common.back")}
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>

      <Modal
        show_close_button
        is_open={show_energy}
        on_close={() => set_show_energy(false)}
        size="sm"
      >
        <ModalHeader>
          <ModalTitle>{t("settings.crypto_energy_toggle")}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <div className="space-y-2 text-sm leading-relaxed text-txt-secondary">
            <p>{t("settings.crypto_energy_btc")}</p>
            <p>{t("settings.crypto_energy_eth")}</p>
            <p>{t("settings.crypto_energy_caveat")}</p>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => set_show_energy(false)}>
            {t("common.close")}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

export { crypto_addon_term_modal as CryptoAddonTermModal };
