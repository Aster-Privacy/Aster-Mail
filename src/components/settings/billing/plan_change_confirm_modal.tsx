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
  on_confirm: () => void;
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
  const [preview, set_preview] = useState<PlanChangePreviewResponse | null>(null);
  const [loading, set_loading] = useState(false);
  const fetch_gen = useRef(0);

  useEffect(() => {
    if (open) {
      const gen = ++fetch_gen.current;
      set_loading(true);
      set_preview(null);
      preview_plan_change(plan_code, billing_interval).then((res) => {
        if (fetch_gen.current !== gen) return;
        if (res.data) set_preview(res.data);
        set_loading(false);
      });
    } else {
      fetch_gen.current++;
      set_preview(null);
      set_loading(false);
    }
  }, [open, plan_code, billing_interval]);

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
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          disabled={is_confirming}
          variant="outline"
          onClick={on_close}
        >
          {t("common.cancel")}
        </Button>
        <Button
          disabled={loading || is_confirming}
          variant="primary"
          onClick={on_confirm}
        >
          {is_confirming
            ? t("settings.plan_change_confirming")
            : t("settings.plan_change_confirm_button")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
