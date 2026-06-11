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
import { useState } from "react";
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
  format_price,
} from "@/services/api/billing";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { convert_cents } from "@/components/settings/billing/billing_constants";

type TermMonths = 1 | 3 | 6 | 12 | 24;

interface CryptoTermModalProps {
  is_open: boolean;
  on_close: () => void;
  on_checkout_opened?: () => void;
  plan_code: string;
  plan_name: string;
  monthly_price_cents: number;
  yearly_price_cents: number;
  preferred_currency: string;
}

const TERM_OPTIONS: TermMonths[] = [1, 3, 6, 12, 24];

export function crypto_term_modal({
  is_open,
  on_close,
  on_checkout_opened,
  plan_code,
  plan_name,
  monthly_price_cents,
  yearly_price_cents,
  preferred_currency,
}: CryptoTermModalProps) {
  const { t } = use_i18n();
  const [selected_term, set_selected_term] = useState<TermMonths>(12);
  const [is_loading, set_is_loading] = useState(false);

  const compute_price_cents = (term: TermMonths): number => {
    if (term === 12) return yearly_price_cents;
    if (term === 24) return yearly_price_cents * 2;

    return monthly_price_cents * term;
  };

  const term_label = (term: TermMonths): string => {
    if (term === 1) return t("settings.crypto_term_1mo");
    if (term === 3) return t("settings.crypto_term_3mo");
    if (term === 6) return t("settings.crypto_term_6mo");
    if (term === 12) return t("settings.crypto_term_12mo");

    return t("settings.crypto_term_24mo");
  };

  const handle_confirm = async () => {
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
          window.location.href = response.data.url;
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

  return (
    <Modal is_open={is_open} on_close={on_close} show_close_button size="md">
      <ModalHeader>
        <ModalTitle>{t("settings.crypto_modal_title")}</ModalTitle>
        <ModalDescription>{plan_name}</ModalDescription>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-2">
          {TERM_OPTIONS.map((term) => {
            const is_selected = selected_term === term;
            const price = compute_price_cents(term);

            return (
              <button
                key={term}
                className="w-full flex items-center justify-between rounded-[14px] border p-3.5 text-left transition-colors"
                style={{
                  backgroundColor: is_selected ? "#3b82f6" : "var(--bg-tertiary)",
                  borderColor: is_selected ? "#3b82f6" : "var(--border-secondary)",
                }}
                type="button"
                onClick={() => set_selected_term(term)}
              >
                <span
                  className="text-sm font-medium"
                  style={{ color: is_selected ? "#ffffff" : "var(--text-primary)" }}
                >
                  {term_label(term)}
                </span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: is_selected ? "#ffffff" : "var(--text-primary)" }}
                >
                  {t("settings.crypto_modal_price", {
                    amount: format_price(convert_cents(price, preferred_currency), preferred_currency),
                  })}
                </span>
              </button>
            );
          })}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button
          disabled={is_loading}
          variant="outline"
          onClick={on_close}
        >
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

export { crypto_term_modal as CryptoTermModal };
