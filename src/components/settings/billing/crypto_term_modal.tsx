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

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  create_crypto_checkout_session,
  create_crypto_native_invoice,
  format_price,
  get_crypto_native_coins,
  type CryptoNativeCoin,
} from "@/services/api/billing";
import { payment_url_or_throw } from "@/lib/payment_url";
import { Spinner } from "@/components/ui/spinner";
import { CoinIcon } from "@/components/ui/coin_icon";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import {
  PLAN_TIERS,
  notify_crypto_invoice_changed,
  remember_crypto_selection,
} from "@/components/settings/billing/billing_constants";

type TermMonths = 1 | 3 | 6 | 12 | 24;
type Step = "term" | "method";
type CoinsStatus = "loading" | "ready" | "disabled" | "failed";

interface CryptoTermModalProps {
  is_open: boolean;
  on_close: () => void;
  on_checkout_opened?: () => void;
  plan_code: string;
  plan_name: string;
  monthly_price_cents: number;
  yearly_price_cents: number;
  preferred_currency: string;
  enable_native?: boolean;
  initial_term_months?: number;
  initial_coin_key?: string;
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

export function crypto_term_modal({
  is_open,
  on_close,
  on_checkout_opened,
  plan_code,
  plan_name,
  monthly_price_cents,
  yearly_price_cents,
  enable_native = true,
  initial_term_months,
  initial_coin_key,
}: CryptoTermModalProps) {
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
  const term_button_refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!is_open) return;

    const restored_term = TERM_OPTIONS.find(
      (term) => term === initial_term_months,
    );

    set_step(initial_coin_key ? "method" : "term");
    set_creating_key(null);

    if (restored_term) set_selected_term(restored_term);
  }, [is_open, initial_coin_key, initial_term_months]);

  useEffect(() => {
    if (!is_open || !native_supported) return;

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

  const biennial_price_cents = useMemo(() => {
    const tier = PLAN_TIERS.find((plan) => plan.id === plan_code);

    return tier?.biennial_cents ?? yearly_price_cents * 2;
  }, [plan_code, yearly_price_cents]);

  const compute_price_cents = (term: TermMonths): number => {
    if (term === 12) return yearly_price_cents;
    if (term === 24) return biennial_price_cents;

    return monthly_price_cents * term;
  };

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
      const is_tauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      const origin = is_tauri ? "https://app.astermail.org" : window.location.origin;
      const response = await create_crypto_checkout_session(
        plan_code,
        selected_term,
        `${origin}/?crypto=success`,
        `${origin}/?crypto=cancelled`,
      );

      if (response.data?.url) {
        if (is_tauri) {
          const core = await import("@tauri-apps/api/core");
          await core.invoke("open_external_url", { url: response.data.url });
          on_checkout_opened?.();
          on_close();
        } else {
          window.location.href = payment_url_or_throw(response.data.url);
        }
        return;
      }
      show_toast(t("settings.failed_checkout"), "error");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("settings.failed_checkout"), "error");
    } finally {
      set_is_loading(false);
    }
  };

  const handle_native = async (coin: CryptoNativeCoin) => {
    const key = `${coin.currency}:${coin.chain}`;

    set_creating_key(key);
    try {
      const response = await create_crypto_native_invoice(
        plan_code,
        selected_term,
        coin.currency,
        coin.chain,
      );

      if (response.data?.id) {
        remember_crypto_selection({
          invoice_id: response.data.id,
          plan_code,
          term_months: selected_term,
          currency: coin.currency,
          chain: coin.chain,
        });
        notify_crypto_invoice_changed();
        on_close();
        navigate(`/crypto-invoice/${response.data.id}`);
        return;
      }
      if (response.code === "CONFLICT") {
        show_toast(t("settings.crypto_native_too_many_open"), "error");
        return;
      }
      if (response.code === "RATE_LIMIT_EXCEEDED") {
        show_toast(t("settings.crypto_native_daily_limit"), "error");
        return;
      }
      show_toast(t("settings.failed_checkout"), "error");
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("settings.failed_checkout"), "error");
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
    <Modal is_open={is_open} on_close={on_close} show_close_button size="md">
      {step === "term" ? (
        <>
          <ModalHeader>
            <ModalTitle>{t("settings.crypto_modal_title")}</ModalTitle>
            <ModalDescription>{plan_name}</ModalDescription>
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
                    className={`w-full flex items-center justify-between gap-3 rounded-[14px] border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:opacity-60 disabled:cursor-not-allowed ${
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
                      style={{ color: is_selected ? "var(--accent-fg, #ffffff)" : "var(--text-primary)" }}
                    >
                      {term_label(term)}
                    </span>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: is_selected ? "var(--accent-fg, #ffffff)" : "var(--text-primary)" }}
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
              {t("settings.crypto_charged_in_usd")}
            </p>
          </ModalBody>
          <ModalFooter>
            <Button disabled={is_loading} variant="outline" onClick={on_close}>
              {t("common.cancel")}
            </Button>
            <Button disabled={is_loading} variant="primary" onClick={advance_to_method}>
              {native_supported
                ? t("settings.crypto_native_continue")
                : t("settings.crypto_modal_confirm")}
            </Button>
          </ModalFooter>
        </>
      ) : (
        <>
          <ModalHeader>
            <ModalTitle>{t("settings.crypto_native_choose_method")}</ModalTitle>
            <ModalDescription>
              {`${plan_name} · ${term_label(selected_term)} · ${selected_price_label}`}
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            {coins_status === "loading" ? (
              <div className="flex items-center justify-center gap-3 py-8 text-txt-secondary">
                <Spinner size="md" />
                <span className="text-sm">{t("settings.crypto_native_loading_coins")}</span>
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

                {sorted_coins.map((coin) => {
                  const key = `${coin.currency}:${coin.chain}`;
                  const is_creating = creating_key === key;
                  const is_restored = initial_coin_key === key;

                  return (
                    <button
                      key={key}
                      className={`w-full flex items-center justify-between gap-3 rounded-[14px] border p-3.5 text-left transition-colors bg-surf-tertiary hover:bg-surf-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:opacity-60 ${
                        is_restored || coin.recommended
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
                            {coin.display_name} ({coin.currency})
                          </span>
                          <span className="text-xs text-txt-muted truncate">
                            {t("settings.crypto_native_on_chain", {
                              chain: pretty_chain(coin.chain),
                            })}
                          </span>
                        </span>
                      </span>
                      {is_creating ? (
                        <Spinner size="sm" />
                      ) : is_restored ? (
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{
                            backgroundColor: "var(--accent-color)",
                            color: "var(--accent-fg, #ffffff)",
                          }}
                        >
                          {t("settings.crypto_native_resume_selected")}
                        </span>
                      ) : coin.recommended ? (
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{
                            backgroundColor: "var(--accent-color)",
                            color: "var(--accent-fg, #ffffff)",
                          }}
                        >
                          {t("settings.crypto_native_recommended")}
                        </span>
                      ) : null}
                    </button>
                  );
                })}

                <button
                  className="w-full flex items-center justify-between gap-3 rounded-[14px] border border-edge-secondary p-3.5 text-left transition-colors bg-surf-tertiary hover:bg-surf-hover hover:border-edge-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:opacity-60"
                  disabled={busy}
                  type="button"
                  onClick={handle_stripe}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <CoinIcon
                      chain="generic"
                      currency="stable"
                      size={32}
                    />
                    <span className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-txt-primary truncate">
                        {t("settings.crypto_native_stripe_option")}
                      </span>
                      <span className="text-xs text-txt-muted line-clamp-2">
                        {t("settings.crypto_native_stripe_desc")}
                      </span>
                    </span>
                  </span>
                  {is_loading ? (
                    <Spinner size="sm" />
                  ) : (
                    <BanknotesIcon className="w-5 h-5 shrink-0 text-txt-muted" />
                  )}
                </button>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button disabled={busy} variant="outline" onClick={() => set_step("term")}>
              {t("common.back")}
            </Button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}

export { crypto_term_modal as CryptoTermModal };
