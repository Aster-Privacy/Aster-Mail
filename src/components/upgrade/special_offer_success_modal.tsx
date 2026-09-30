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
import type { TranslationKey } from "@/lib/i18n/types";

import { motion } from "framer-motion";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Modal, ModalTitle } from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";

const SPECIAL_OFFER_FEATURE_KEYS: [TranslationKey, TranslationKey][] = [
  [
    "settings.special_offer_feature_aliases",
    "settings.special_offer_feature_aliases_body",
  ],
  [
    "settings.special_offer_feature_storage",
    "settings.special_offer_feature_storage_body",
  ],
  [
    "settings.special_offer_feature_domains",
    "settings.special_offer_feature_domains_body",
  ],
  [
    "settings.special_offer_feature_vanguard",
    "settings.special_offer_feature_vanguard_body",
  ],
];

export function SpecialOfferFeatureList() {
  const { t } = use_i18n();

  return (
    <ul className="special_offer_features">
      {SPECIAL_OFFER_FEATURE_KEYS.map(([title_key, body_key]) => (
        <li key={title_key} className="special_offer_feature">
          <CheckCircleIcon
            aria-hidden="true"
            className="special_offer_check h-[18px] w-[18px]"
            strokeWidth={2}
          />
          <div className="min-w-0">
            <p className="special_offer_feature_title">{t(title_key)}</p>
            <p className="special_offer_feature_body">{t(body_key)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface SpecialOfferSuccessModalProps {
  is_open: boolean;
  on_close: () => void;
}

export function SpecialOfferSuccessModal({
  is_open,
  on_close,
}: SpecialOfferSuccessModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();

  return (
    <Modal
      is_open={is_open}
      on_close={on_close}
      overlay_class_name="special_offer_overlay"
      panel_class_name="special_offer_panel"
      show_close_button={false}
      size="sm"
    >
      <div className="flex flex-col items-center px-6 pb-6 pt-9 text-center">
        <motion.div
          animate={{ scale: 1, opacity: 1 }}
          className="mb-4"
          initial={reduce_motion ? false : { scale: 0.6, opacity: 0 }}
          transition={
            reduce_motion
              ? { duration: 0 }
              : { type: "spring", stiffness: 320, damping: 16 }
          }
        >
          <CheckCircleIcon
            aria-hidden="true"
            className="h-12 w-12 text-[var(--color-success)]"
            strokeWidth={1.75}
          />
        </motion.div>
        <ModalTitle className="text-[22px] font-semibold leading-[1.2] tracking-[-0.015em] text-txt-primary">
          {t("settings.special_offer_success_title")}
        </ModalTitle>
        <p className="mt-2 text-[14px] leading-relaxed text-txt-secondary">
          {t("settings.special_offer_success_body")}
        </p>
      </div>
      <div className="px-6 pb-6 text-start">
        <SpecialOfferFeatureList />
        <Button
          className="mt-6 w-full !h-11 !text-[15px] !font-semibold"
          variant="depth"
          onClick={on_close}
        >
          {t("common.done")}
        </Button>
      </div>
    </Modal>
  );
}
