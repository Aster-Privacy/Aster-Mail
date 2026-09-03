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
import type { ReactNode } from "react";

import { CheckCircleIcon } from "@heroicons/react/24/solid";

import { PlanComparisonTable } from "@/components/settings/billing/plan_comparison_table";
import {
  Modal,
  ModalBody,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";

interface plan_features_modal_props {
  is_open: boolean;
  on_close: () => void;
  highlight_plan_code?: string | null;
  plan_name?: string;
  feature_lines?: { label: ReactNode }[];
  z_index?: number;
}

export function PlanFeaturesModal({
  is_open,
  on_close,
  highlight_plan_code,
  plan_name,
  feature_lines,
  z_index,
}: plan_features_modal_props) {
  const { t } = use_i18n();
  const use_list = !!feature_lines && feature_lines.length > 0;

  return (
    <Modal
      show_close_button
      is_open={is_open}
      on_close={on_close}
      size={use_list ? "lg" : "2xl"}
      z_index={z_index}
    >
      <ModalHeader className="pb-3">
        <ModalTitle className="text-lg">
          {use_list && plan_name
            ? plan_name
            : t("settings.checkout_full_features_title")}
        </ModalTitle>
      </ModalHeader>
      <ModalBody>
        {use_list ? (
          <ul className="space-y-2.5">
            {feature_lines.map((feature, index) => (
              <li
                key={index}
                className="flex items-start gap-2.5 text-[13px] leading-snug text-txt-primary"
              >
                <CheckCircleIcon
                  aria-hidden="true"
                  className="mt-[1px] h-[18px] w-[18px] flex-shrink-0"
                  style={{ color: "var(--accent-blue)" }}
                />
                <span className="min-w-0">{feature.label}</span>
              </li>
            ))}
          </ul>
        ) : (
          <PlanComparisonTable highlight_plan_code={highlight_plan_code} />
        )}
      </ModalBody>
    </Modal>
  );
}
