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
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@aster/ui";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

interface PurchaseSuccessModalProps {
  is_open: boolean;
  plan: string;
  billing: string;
  on_close: () => void;
  on_view_billing: () => void;
}

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  star: "Star",
  nova: "Nova",
  supernova: "Supernova",
};

export function PurchaseSuccessModal({
  is_open,
  plan,
  billing,
  on_close,
  on_view_billing,
}: PurchaseSuccessModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();

  const plan_name = PLAN_DISPLAY_NAMES[plan] || plan;
  const billing_label =
    billing === "year"
      ? t("settings.billing_yearly")
      : t("settings.billing_monthly");

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          exit={{ opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
          onClick={on_close}
        >
          <div
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "var(--modal-overlay)" }}
          />
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-sm rounded-xl border overflow-hidden bg-modal-bg border-edge-primary"
            exit={{ opacity: 0, scale: 0.96 }}
            initial={reduce_motion ? false : { opacity: 0, scale: 0.96 }}
            style={{
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)",
            }}
            transition={{ duration: reduce_motion ? 0 : 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-8 pb-6 flex flex-col items-center text-center">
              <img
                alt="Aster Mail"
                className="w-14 h-14 rounded-2xl mb-5 select-none"
                draggable={false}
                src="/mail_logo.webp"
              />

              <h2 className="text-lg font-semibold text-txt-primary mb-2">
                {t("common.welcome_to_aster")}
              </h2>

              <p className="text-sm text-txt-secondary leading-relaxed mb-1">
                {t("common.purchase_thank_you")}
              </p>

              <div
                className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{
                  backgroundColor: "var(--surf-tertiary)",
                  color: "var(--text-primary)",
                }}
              >
                <span>{plan_name}</span>
                <span
                  className="w-1 h-1 rounded-full"
                  style={{ backgroundColor: "var(--text-muted)" }}
                />
                <span className="text-txt-secondary">{billing_label}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 px-6 pb-6">
              <Button
                className="w-full"
                size="xl"
                variant="depth"
                onClick={() => {
                  on_close();
                  on_view_billing();
                }}
              >
                {t("common.view_billing_settings")}
              </Button>
              <Button
                className="w-full"
                size="xl"
                variant="secondary"
                onClick={on_close}
              >
                {t("common.get_started")}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
