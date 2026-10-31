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
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BanknotesIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { checkout_error_text } from "./checkout_error_text";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import {
  create_crypto_native_credit_invoice,
  get_crypto_native_coins,
  format_price,
  type CreditPackageItem,
  type CryptoNativeCoin,
} from "@/services/api/billing";
import { Spinner } from "@/components/ui/spinner";
import { CoinIcon } from "@/components/ui/coin_icon";
import {
  show_toast,
  TOAST_DURATION_BILLING_MS,
} from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { prefetch_crypto_invoice_page } from "@/pages/crypto_invoice/prefetch";
import { TicketDivider } from "@/pages/crypto_invoice/ui";
import { coin_title, pretty_chain } from "@/pages/crypto_invoice/format";
import { notify_crypto_invoice_changed } from "@/components/settings/billing/billing_constants";

type CoinsStatus = "loading" | "ready" | "failed";

interface CryptoCreditModalProps {
  is_open: boolean;
  on_close: () => void;
  on_invoice_created: () => void;
  on_stablecoin: () => void;
  stablecoin_busy: boolean;
  credit_package: CreditPackageItem | null;
}

const CHARGE_CURRENCY = "usd";

const coin_row_class =
  "w-full flex items-center justify-between gap-3 rounded-[var(--aster-radius-control)] bg-surf-secondary px-3.5 py-3 text-start transition-colors hover:bg-surf-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] disabled:cursor-not-allowed";

export function crypto_credit_modal({
  is_open,
  on_close,
  on_invoice_created,
  on_stablecoin,
  stablecoin_busy,
  credit_package,
}: CryptoCreditModalProps) {
  const { t } = use_i18n();
  const navigate = useNavigate();
  const [creating_key, set_creating_key] = useState<string | null>(null);
  const [coins, set_coins] = useState<CryptoNativeCoin[]>([]);
  const [coins_status, set_coins_status] = useState<CoinsStatus>("loading");
  const [coins_reload_token, set_coins_reload_token] = useState(0);
  const [show_energy, set_show_energy] = useState(false);

  useEffect(() => {
    if (!is_open) return;

    prefetch_crypto_invoice_page();
    set_creating_key(null);

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
        set_coins_status(response.data ? "ready" : "failed");
      } catch {
        if (cancelled) return;

        set_coins([]);
        set_coins_status("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [is_open, coins_reload_token]);

  const sorted_coins = useMemo(() => {
    return [...coins].sort((a, b) => {
      if (a.recommended === b.recommended) return 0;

      return a.recommended ? -1 : 1;
    });
  }, [coins]);

  const handle_native = async (coin: CryptoNativeCoin) => {
    if (!credit_package) return;

    const key = `${coin.currency}:${coin.chain}`;

    set_creating_key(key);
    try {
      const response = await create_crypto_native_credit_invoice(
        credit_package.id,
        coin.currency,
        coin.chain,
      );

      if (response.data?.id) {
        notify_crypto_invoice_changed();
        on_invoice_created();
        navigate(`/crypto-invoice/${response.data.id}`);

        return;
      }
      if (response.code === "RATE_LIMIT_EXCEEDED" && response.resets_at) {
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

  const busy = stablecoin_busy || creating_key !== null;

  return (
    <>
      <Modal
        show_close_button
        close_on_escape={!busy}
        close_on_overlay={false}
        is_open={is_open}
        on_close={on_close}
        size="md"
        z_index={90}
      >
        <ModalHeader>
          <ModalTitle>{t("settings.crypto_native_choose_method")}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          {credit_package && (
            <div className="relative mb-4 rounded-xl bg-surf-secondary">
              <dl className="space-y-2 p-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs text-txt-muted">
                    {t("settings.credits")}
                  </dt>
                  <dd className="text-sm font-medium text-txt-primary">
                    {format_price(
                      credit_package.amount_cents +
                        Math.max(credit_package.bonus_cents, 0),
                      CHARGE_CURRENCY,
                    )}
                  </dd>
                </div>
              </dl>
              <TicketDivider notch_color="var(--modal-bg)" />
              <dl className="flex items-baseline justify-between gap-3 p-3.5">
                <dt className="text-xs text-txt-muted">{t("common.total")}</dt>
                <dd className="text-base font-semibold text-txt-primary">
                  {format_price(credit_package.price_cents, CHARGE_CURRENCY)}
                </dd>
              </dl>
            </div>
          )}
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
                  className="flex flex-col gap-3 rounded-xl bg-surf-secondary p-3.5"
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
                      onClick={() => set_coins_reload_token((n) => n + 1)}
                    >
                      {t("common.retry")}
                    </Button>
                  </div>
                </div>
              )}

              {sorted_coins.length > 0 && (
                <p className="pb-1 text-xs leading-relaxed text-txt-muted">
                  {t("settings.crypto_native_commit_notice")}
                </p>
              )}

              {sorted_coins.map((coin) => {
                const key = `${coin.currency}:${coin.chain}`;
                const is_creating = creating_key === key;

                return (
                  <button
                    key={key}
                    aria-busy={is_creating}
                    className={coin_row_class}
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
                        <span className="plan_galaxy_badge inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                          {t("settings.crypto_native_recommended")}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}

              <button
                aria-busy={stablecoin_busy}
                className={coin_row_class}
                disabled={busy}
                type="button"
                onClick={on_stablecoin}
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
                  {stablecoin_busy ? (
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
          <Button disabled={busy} variant="outline" onClick={on_close}>
            {t("common.back")}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        show_close_button
        is_open={show_energy}
        on_close={() => set_show_energy(false)}
        size="sm"
        z_index={95}
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

export { crypto_credit_modal as CryptoCreditModal };
