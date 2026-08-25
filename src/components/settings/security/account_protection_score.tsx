// SPDX-FileCopyrightText: 2026 Aster Communications Inc.
// SPDX-License-Identifier: AGPL-3.0-or-later
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
import { ChevronRightIcon } from "@heroicons/react/24/outline";

import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
} from "@/components/ui/modal";
import {
  SecurityLockIcon,
  type SecurityStatus,
} from "@/components/settings/security/security_lock_icon";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";

function get_status(bar_pct: number): SecurityStatus {
  if (bar_pct < 35) return "weak";
  if (bar_pct < 60) return "fair";
  if (bar_pct < 90) return "partial";

  return "strong";
}

const STATUS_BUTTON_STYLES: Record<SecurityStatus, string> = {
  weak: "bg-red-600 hover:bg-red-700 text-white",
  fair: "bg-orange-500 hover:bg-orange-600 text-white",
  partial: "bg-blue-600 hover:bg-blue-700 text-white",
  strong: "bg-green-600 hover:bg-green-700 text-white",
};

interface AccountProtectionScoreProps {
  totp_enabled: boolean;
  passkey_registered: boolean;
  recovery_email_verified: boolean;
  login_alerts_enabled: boolean;
  block_tracking_pixels: boolean;
  block_remote_images: boolean;
  strip_exif_on_compose: boolean;
  security_loaded?: boolean;
  on_criterion_click?: Array<(() => void) | undefined>;
}

const WEIGHTS = [1, 1, 1, 1, 1, 1, 1] as const;
const MAX_SCORE = 7;

export function AccountProtectionScore({
  totp_enabled,
  passkey_registered,
  recovery_email_verified,
  login_alerts_enabled,
  block_tracking_pixels,
  block_remote_images,
  strip_exif_on_compose,
  security_loaded = true,
  on_criterion_click,
}: AccountProtectionScoreProps) {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const [popover_open, set_popover_open] = useState(false);
  const [dismissed, set_dismissed] = useState(false);

  const criteria_met = [
    totp_enabled,
    passkey_registered,
    recovery_email_verified,
    login_alerts_enabled,
    block_tracking_pixels,
    block_remote_images,
    strip_exif_on_compose,
  ];

  const criteria_labels = [
    t("settings.criterion_two_factor"),
    t("settings.criterion_passkey"),
    t("settings.criterion_recovery_email"),
    t("settings.criterion_login_alerts"),
    t("settings.block_spy_pixels"),
    t("settings.block_remote_images_label"),
    t("settings.strip_exif_on_compose_label"),
  ];

  const score = criteria_met.reduce(
    (sum, met, i) => sum + (met ? WEIGHTS[i] : 0),
    0,
  );

  const bar_pct = Math.round((score / MAX_SCORE) * 100);
  const status = get_status(bar_pct);

  if (!security_loaded) {
    return (
      <div className="rounded-xl bg-surf-secondary border border-edge-secondary px-4 py-3.5 animate-pulse">
        <div className="flex items-start gap-2.5">
          <div className="h-5 w-5 rounded-full bg-surf-tertiary flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="h-4 w-56 rounded bg-surf-tertiary mb-2" />
            <div className="h-3.5 w-72 rounded bg-surf-tertiary" />
          </div>
        </div>
      </div>
    );
  }

  if (dismissed || preferences.account_security_banner_dismissed) return null;

  return (
    <div className="rounded-xl bg-surf-secondary border border-edge-secondary px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <SecurityLockIcon
              className="h-5 w-5 flex-shrink-0"
              status={status}
            />
            <p className="text-sm font-semibold text-txt-primary">
              {t("settings.account_security_percent_title", {
                percent: bar_pct,
              })}
            </p>
          </div>
          <p className="text-sm text-txt-muted mt-1 ms-7">
            {t("settings.account_security_review_subtitle")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-txt-primary bg-surf-primary border border-edge-secondary hover:bg-surf-tertiary transition-colors"
              type="button"
              onClick={() => set_dismissed(true)}
            >
              {t("settings.account_security_dismiss")}
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${STATUS_BUTTON_STYLES[status]}`}
              type="button"
              onClick={() => set_popover_open(true)}
            >
              {t("settings.account_security_review_cta")}
            </button>
          </div>
          <button
            className="text-xs text-txt-muted hover:text-txt-primary transition-colors"
            type="button"
            onClick={() =>
              update_preference("account_security_banner_dismissed", true, true)
            }
          >
            {t("settings.account_security_dont_show_again")}
          </button>
        </div>
      </div>

      <div className="relative z-10">
        <Modal
          is_open={popover_open}
          on_close={() => set_popover_open(false)}
          size="sm"
        >
          <ModalHeader>
            <ModalTitle>{t("settings.protection_breakdown_title")}</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <ul className="space-y-0.5">
              {criteria_labels.map((label, i) => {
                const click_handler = on_criterion_click?.[i];
                const is_clickable = !!click_handler;

                return (
                  <li key={label}>
                    <button
                      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors text-start ${is_clickable ? "hover:bg-edge-secondary/60 cursor-pointer" : "cursor-default"}`}
                      disabled={!is_clickable}
                      type="button"
                      onClick={() => {
                        if (!click_handler) return;
                        set_popover_open(false);
                        click_handler();
                      }}
                    >
                      <SecurityLockIcon
                        className="w-4 h-4 flex-shrink-0"
                        status={criteria_met[i] ? "strong" : "weak"}
                      />
                      <span
                        className={`text-sm flex-1 ${criteria_met[i] ? "text-txt-primary" : "text-txt-muted"}`}
                      >
                        {label}
                      </span>
                      {!criteria_met[i] && (
                        <span className="text-xs font-semibold text-txt-muted tabular-nums">
                          +{WEIGHTS[i]}
                        </span>
                      )}
                      {is_clickable && (
                        <ChevronRightIcon className="w-3.5 h-3.5 text-txt-muted flex-shrink-0 rtl:-scale-x-100" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </ModalBody>
        </Modal>
      </div>
    </div>
  );
}
