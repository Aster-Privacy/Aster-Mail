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
import { useRef, useState } from "react";
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
  purchase_storage_addon_crypto,
  format_price,
} from "@/services/api/billing";
import { payment_url_or_throw } from "@/lib/payment_url";
import { server_error_text } from "@/components/settings/billing/server_error_text";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";

type TermMonths = 1 | 3 | 6 | 12 | 24;

interface CryptoAddonTermModalProps {
  is_open: boolean;
  on_close: () => void;
  on_checkout_opened?: () => void;
  addon_id: string;
  addon_name: string;
  price_cents: number;
  preferred_currency: string;
}

const TERM_OPTIONS: TermMonths[] = [1, 3, 6, 12, 24];
const CHARGE_CURRENCY = "usd";

export function crypto_addon_term_modal({
  is_open,
  on_close,
  on_checkout_opened,
  addon_id,
  addon_name,
  price_cents,
}: CryptoAddonTermModalProps) {
  const { t } = use_i18n();
  const [selected_term, set_selected_term] = useState<TermMonths>(12);
  const [is_loading, set_is_loading] = useState(false);
  const term_button_refs = useRef<(HTMLButtonElement | null)[]>([]);

  const compute_price_cents = (term: TermMonths): number => price_cents * term;

  const term_label = (term: TermMonths): string => {
    if (term === 1) return t("settings.crypto_term_1mo");
    if (term === 3) return t("settings.crypto_term_3mo");
    if (term === 6) return t("settings.crypto_term_6mo");
    if (term === 12) return t("settings.crypto_term_12mo");

    return t("settings.crypto_term_24mo");
  };

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

  const handle_confirm = async () => {
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
        `${origin}/?addon_purchase=success`,
        `${origin}/?addon_purchase=cancelled`,
      );

      if (response.data?.url) {
        if (is_tauri) {
          const safe_url = payment_url_or_throw(response.data.url);
          const core = await import("@tauri-apps/api/core");

          await core.invoke("open_external_url", { url: safe_url });
          on_checkout_opened?.();
          on_close();
        } else {
          window.location.href = payment_url_or_throw(response.data.url);
        }

        return;
      }
      show_toast(
        server_error_text(response.error, t("settings.failed_checkout")),
        "error",
      );
      set_is_loading(false);
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("settings.failed_checkout"), "error");
      set_is_loading(false);
    }
  };

  return (
    <Modal show_close_button is_open={is_open} on_close={on_close} size="md">
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
          {t("settings.crypto_charged_in_usd")}
        </p>
        <div
          className="mt-3 rounded-[14px] border border-edge-secondary bg-surf-tertiary p-3.5 text-xs leading-relaxed text-txt-secondary"
          role="note"
        >
          {t("settings.crypto_exchange_warning")}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button disabled={is_loading} variant="outline" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={is_loading}
          variant="primary"
          onClick={handle_confirm}
        >
          {t("settings.crypto_modal_confirm")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export { crypto_addon_term_modal as CryptoAddonTermModal };
