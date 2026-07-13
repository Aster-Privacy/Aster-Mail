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
import {
  ShieldCheckIcon,
  ShieldExclamationIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowRightIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@aster/ui";
import { Modal, ModalHeader, ModalTitle, ModalBody } from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";

interface AccountProtectionScoreProps {
  totp_enabled: boolean;
  passkey_registered: boolean;
  recovery_email_verified: boolean;
  login_alerts_enabled: boolean;
  block_tracking_pixels: boolean;
  block_remote_images: boolean;
  strip_exif_on_compose: boolean;
  read_receipts_off: boolean;
  security_loaded?: boolean;
  on_criterion_click?: Array<(() => void) | undefined>;
}

const WEIGHTS = [1, 1, 1, 1, 1, 1, 1, 1] as const;
const MAX_SCORE = 8;

type Status = "weak" | "fair" | "partial" | "strong";

function get_status(score: number): Status {
  if (score >= MAX_SCORE) return "strong";
  if (score >= 6) return "partial";
  if (score >= 3) return "fair";

  return "weak";
}

const PANEL_CLASS: Record<Status, string> = {
  weak:    "bg-red-500/10 border-red-500/20",
  fair:    "bg-amber-500/10 border-amber-500/20",
  partial: "bg-blue-500/10 border-blue-500/20",
  strong:  "bg-green-500/10 border-green-500/20",
};

const BADGE_CLASS: Record<Status, string> = {
  weak:    "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400",
  fair:    "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
  partial: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
  strong:  "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400",
};

const SCORE_TEXT_CLASS: Record<Status, string> = {
  weak:    "text-red-600 dark:text-red-400",
  fair:    "text-amber-600 dark:text-amber-400",
  partial: "text-blue-600 dark:text-blue-400",
  strong:  "text-green-600 dark:text-green-400",
};

const TRACK_CLASS: Record<Status, string> = {
  weak:    "bg-red-500/15",
  fair:    "bg-amber-500/15",
  partial: "bg-blue-500/15",
  strong:  "bg-green-500/15",
};

const FILL_CLASS: Record<Status, string> = {
  weak:    "bg-red-500",
  fair:    "bg-amber-500",
  partial: "bg-blue-500",
  strong:  "bg-green-500",
};


export function AccountProtectionScore({
  totp_enabled,
  passkey_registered,
  recovery_email_verified,
  login_alerts_enabled,
  block_tracking_pixels,
  block_remote_images,
  strip_exif_on_compose,
  read_receipts_off,
  security_loaded = true,
  on_criterion_click,
}: AccountProtectionScoreProps) {
  const { t } = use_i18n();
  const [popover_open, set_popover_open] = useState(false);

  const criteria_met = [
    totp_enabled,
    passkey_registered,
    recovery_email_verified,
    login_alerts_enabled,
    block_tracking_pixels,
    block_remote_images,
    strip_exif_on_compose,
    read_receipts_off,
  ];

  const criteria_labels = [
    t("settings.criterion_two_factor"),
    t("settings.criterion_passkey"),
    t("settings.criterion_recovery_email"),
    t("settings.criterion_login_alerts"),
    t("settings.block_spy_pixels"),
    t("settings.block_remote_images_label"),
    t("settings.strip_exif_on_compose_label"),
    t("settings.criterion_read_receipts_off"),
  ];

  const score = criteria_met.reduce(
    (sum, met, i) => sum + (met ? WEIGHTS[i] : 0),
    0,
  );

  const status = get_status(score);
  const ShieldIcon =
    status === "weak" || status === "fair"
      ? ShieldExclamationIcon
      : ShieldCheckIcon;

  const status_label = {
    weak:    t("settings.account_protection_weak"),
    fair:    t("settings.account_protection_fair"),
    partial: t("settings.account_protection_partial"),
    strong:  t("settings.account_protection_strong"),
  }[status];

  const hint = {
    weak:    t("settings.account_protection_hint_weak"),
    fair:    t("settings.account_protection_hint_fair"),
    partial: t("settings.account_protection_hint_partial"),
    strong:  t("settings.account_protection_hint_strong"),
  }[status];

  const bar_pct = Math.round((score / MAX_SCORE) * 100);

  return (
    <div className={`rounded-lg p-4 border ${PANEL_CLASS[status]}`}>
      <div className="flex items-center justify-between mb-3">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${BADGE_CLASS[status]}`}
        >
          <ShieldIcon className="w-3.5 h-3.5" />
          {status_label}
        </span>
        <span className={`text-xs font-semibold tabular-nums ${SCORE_TEXT_CLASS[status]}`}>
          {score}
          <span className="font-normal text-txt-muted">/{MAX_SCORE}</span>
        </span>
      </div>

      <h3 className="text-base font-bold text-txt-primary mb-1 tracking-tight">
        {t("settings.account_protection_title")}
      </h3>

      <p className="text-sm text-txt-muted mb-4 max-w-xs">{hint}</p>

      <div className={`mb-4 h-1.5 rounded-full overflow-hidden ${TRACK_CLASS[status]}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${FILL_CLASS[status]}`}
          style={{ width: `${bar_pct}%` }}
        />
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => set_popover_open(true)}
      >
        {t("settings.protection_breakdown_title")}
        <ArrowRightIcon className="w-4 h-4" />
      </Button>

      <Modal
        is_open={popover_open}
          size="sm"
          on_close={() => set_popover_open(false)}
        >
          <ModalHeader>
            <ModalTitle>{t("settings.protection_breakdown_title")}</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <ul className="space-y-0.5">
              {criteria_labels.map((label, i) => {
                const click_handler = on_criterion_click?.[i];
                const is_clickable = !!click_handler;
                const is_async_row = i < 4;
                const show_skeleton = is_async_row && !security_loaded;

                if (show_skeleton) {
                  return (
                    <li key={label}>
                      <div className="w-full flex items-center gap-2.5 px-2 py-1.5">
                        <div className="w-4 h-4 rounded-full bg-edge-secondary animate-pulse flex-shrink-0" />
                        <div className="h-3.5 rounded bg-edge-secondary animate-pulse flex-1" />
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={label}>
                    <button
                      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors text-left ${is_clickable ? "hover:bg-edge-secondary/60 cursor-pointer" : "cursor-default"}`}
                      disabled={!is_clickable}
                      type="button"
                      onClick={() => {
                        if (!click_handler) return;
                        set_popover_open(false);
                        click_handler();
                      }}
                    >
                      {criteria_met[i] ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircleIcon className="w-4 h-4 text-red-400 flex-shrink-0" />
                      )}
                      <span className={`text-sm flex-1 ${criteria_met[i] ? "text-txt-primary" : "text-txt-muted"}`}>
                        {label}
                      </span>
                      {!criteria_met[i] && (
                        <span className="text-xs font-semibold text-txt-muted tabular-nums">
                          +{WEIGHTS[i]}
                        </span>
                      )}
                      {is_clickable && (
                        <ChevronRightIcon className="w-3.5 h-3.5 text-txt-muted flex-shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </ModalBody>
        </Modal>
    </div>
  );
}
