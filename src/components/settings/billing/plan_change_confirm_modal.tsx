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
import { useState, useEffect, useRef } from "react";
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
  preview_plan_change,
  format_price,
  type PlanChangePreviewResponse,
} from "@/services/api/billing";
import { use_i18n } from "@/lib/i18n/context";

interface plan_change_confirm_modal_props {
  open: boolean;
  plan_name: string;
  plan_code: string;
  billing_interval: string;
  is_confirming: boolean;
  on_close: () => void;
  on_confirm: (promo_code?: string) => void;
}

export function PlanChangeConfirmModal({
  open,
  plan_name,
  plan_code,
  billing_interval,
  is_confirming,
  on_close,
  on_confirm,
}: plan_change_confirm_modal_props) {
  const { t } = use_i18n();
  const [preview, set_preview] = useState<PlanChangePreviewResponse | null>(
    null,
  );
  const [loading, set_loading] = useState(false);
  const [preview_failed, set_preview_failed] = useState(false);
  const [retry_tick, set_retry_tick] = useState(0);
  const [promo_input, set_promo_input] = useState("");
  const [applied_promo_code, set_applied_promo_code] = useState("");
  const [promo_error, set_promo_error] = useState("");
  const fetch_gen = useRef(0);

  useEffect(() => {
    if (open) {
      const gen = ++fetch_gen.current;

      set_loading(true);
      set_preview(null);
      set_preview_failed(false);
      preview_plan_change(plan_code, billing_interval, applied_promo_code).then(
        (res) => {
          if (fetch_gen.current !== gen) return;
          if (res.data) {
            set_preview(res.data);
            if (applied_promo_code && !res.data.promo_code_applied) {
              set_promo_error(t("settings.promo_invalid"));
              set_applied_promo_code("");
            }
          } else if (applied_promo_code) {
            set_promo_error(res.error || t("settings.promo_invalid"));
            set_applied_promo_code("");
          } else {
            set_preview_failed(true);
          }
          set_loading(false);
        },
      );
    } else {
      fetch_gen.current++;
      set_preview(null);
      set_preview_failed(false);
      set_loading(false);
      set_promo_input("");
      set_applied_promo_code("");
      set_promo_error("");
    }
  }, [open, plan_code, billing_interval, retry_tick, applied_promo_code, t]);

  const apply_promo = () => {
    const code = promo_input.trim();

    if (!code || loading) return;
    set_promo_error("");
    set_applied_promo_code(code);
  };

  const currency = preview?.currency ?? "usd";

  return (
    <Modal
      close_on_overlay={!is_confirming}
      is_open={open}
      on_close={is_confirming ? () => {} : on_close}
      show_close_button={!is_confirming}
      size="sm"
    >
      <ModalHeader>
        <ModalTitle>{t("settings.plan_change_confirm_title")}</ModalTitle>
        <ModalDescription>
          {t("settings.plan_change_confirm_description", { plan: plan_name })}
        </ModalDescription>
      </ModalHeader>
      <ModalBody>
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 rounded-full animate-spin border-2 border-edge-secondary border-t-txt-muted" />
          </div>
        ) : preview_failed ? (
          <div className="flex flex-col items-start gap-3 py-2">
            <p className="text-sm text-txt-secondary">
              {t("settings.plan_change_preview_failed")}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => set_retry_tick((n) => n + 1)}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {preview && preview.credit_cents > 0 && (
              <div className="flex items-center justify-between text-sm py-2 px-3 rounded-lg bg-surface-secondary">
                <span className="text-txt-secondary">
                  {t("settings.plan_change_credit")}
                </span>
                <span className="font-medium text-txt-primary">
                  -{format_price(preview.credit_cents, currency)}
                </span>
              </div>
            )}
            {preview && (preview.discount_cents ?? 0) > 0 && (
              <div className="flex items-center justify-between text-sm py-2 px-3 rounded-lg bg-surface-secondary">
                <span className="text-txt-secondary">
                  {preview.discount_description || t("common.discount")}
                </span>
                <span className="font-medium text-txt-primary">
                  -{format_price(preview.discount_cents ?? 0, currency)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm py-2 px-3 rounded-lg bg-surface-secondary">
              <span className="font-semibold text-txt-primary">
                {t("settings.plan_change_due_today")}
              </span>
              <span className="font-semibold text-txt-primary">
                {preview
                  ? format_price(preview.amount_due_cents, currency)
                  : "-"}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <label
                className="text-xs font-medium text-txt-secondary"
                htmlFor="plan_change_promo_code"
              >
                {t("settings.promo_code")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  autoComplete="off"
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-surface-secondary border border-edge-secondary text-txt-primary placeholder:text-txt-muted"
                  disabled={is_confirming}
                  id="plan_change_promo_code"
                  placeholder={t("settings.promo_code_placeholder")}
                  value={promo_input}
                  onChange={(event) => set_promo_input(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      apply_promo();
                    }
                  }}
                />
                <Button
                  disabled={
                    is_confirming || loading || promo_input.trim().length === 0
                  }
                  size="sm"
                  variant="outline"
                  onClick={apply_promo}
                >
                  {t("settings.promo_apply")}
                </Button>
              </div>
              {promo_error && (
                <p className="text-xs text-red-500">{promo_error}</p>
              )}
              {preview?.promo_code_applied && (
                <p className="text-xs text-txt-secondary">
                  {t("settings.promo_applied")}
                </p>
              )}
            </div>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button disabled={is_confirming} variant="outline" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={loading || is_confirming || !preview}
          variant="primary"
          onClick={() => on_confirm(applied_promo_code || undefined)}
        >
          {is_confirming
            ? t("settings.plan_change_confirming")
            : t("settings.plan_change_confirm_button")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
