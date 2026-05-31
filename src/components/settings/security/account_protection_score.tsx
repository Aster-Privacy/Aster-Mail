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
  LockClosedIcon,
  KeyIcon,
  FingerPrintIcon,
} from "@heroicons/react/24/outline";

import { Modal, ModalHeader, ModalTitle, ModalBody } from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";

interface AccountProtectionScoreProps {
  totp_enabled: boolean;
  recovery_email_verified: boolean;
  login_alerts_enabled: boolean;
  block_external_content: boolean;
  block_tracking_pixels: boolean;
  block_remote_images: boolean;
  block_remote_fonts: boolean;
  block_remote_css: boolean;
  strip_exif_on_compose: boolean;
  forward_secrecy_enabled: boolean;
  on_criterion_click?: Array<(() => void) | undefined>;
}

const WEIGHTS = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] as const;
const MAX_SCORE = 10;

type Status = "weak" | "fair" | "partial" | "strong";

function get_status(score: number): Status {
  if (score >= 9) return "strong";
  if (score >= 7) return "partial";
  if (score >= 4) return "fair";

  return "weak";
}

const BG_COLOR: Record<Status, string> = {
  weak:    "#7f1d1d",
  fair:    "#78350f",
  partial: "#1e3a8a",
  strong:  "#14532d",
};


export function AccountProtectionScore({
  totp_enabled,
  recovery_email_verified,
  login_alerts_enabled,
  block_external_content,
  block_tracking_pixels,
  block_remote_images,
  block_remote_fonts,
  block_remote_css,
  strip_exif_on_compose,
  forward_secrecy_enabled,
  on_criterion_click,
}: AccountProtectionScoreProps) {
  const { t } = use_i18n();
  const [popover_open, set_popover_open] = useState(false);

  const criteria_met = [
    totp_enabled,
    recovery_email_verified,
    login_alerts_enabled,
    block_external_content,
    block_tracking_pixels,
    block_remote_images,
    block_remote_fonts,
    block_remote_css,
    strip_exif_on_compose,
    forward_secrecy_enabled,
  ];

  const criteria_labels = [
    t("settings.criterion_two_factor"),
    t("settings.criterion_recovery_email"),
    t("settings.criterion_login_alerts"),
    t("settings.tracking_protection_enabled"),
    t("settings.block_spy_pixels"),
    t("settings.block_remote_images_label"),
    t("settings.block_remote_fonts_label"),
    t("settings.block_remote_css_label"),
    t("settings.strip_exif_on_compose_label"),
    t("settings.criterion_forward_secrecy"),
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
    <div
      className="relative overflow-hidden rounded-2xl p-5"
      style={{ backgroundColor: BG_COLOR[status] }}
    >
      <div
        className="absolute right-4 top-1/2 -translate-y-1/2 flex items-end gap-2 pointer-events-none select-none"
        aria-hidden
      >
        <KeyIcon
          className="w-8 h-8 text-white/15"
          style={{ transform: "translateY(-20px) rotate(-15deg)" }}
        />
        <ShieldIcon className="w-20 h-20 text-white/20" />
        <FingerPrintIcon
          className="w-10 h-10 text-white/12"
          style={{ transform: "translateY(-24px) rotate(12deg)" }}
        />
        <LockClosedIcon
          className="w-7 h-7 text-white/10"
          style={{ transform: "translateY(-4px) rotate(-8deg)" }}
        />
      </div>

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] leading-none font-medium bg-white/20 text-white border border-white/30">
            {status_label}
          </span>
          <span className="text-xs font-semibold text-white/60 tabular-nums">
            {score}
            <span className="font-normal">/{MAX_SCORE}</span>
          </span>
        </div>

        <h3
          className="text-base font-bold text-white mb-1 tracking-tight"
          style={{ textShadow: "0 1px 3px rgba(0,0,0,0.2)" }}
        >
          {t("settings.account_protection_title")}
        </h3>

        <p className="text-sm text-white/65 mb-4 max-w-xs">{hint}</p>

        <div className="mb-4 h-1.5 rounded-full bg-white/20 overflow-hidden">
          <div
            className="h-full rounded-full bg-white/70 transition-all duration-500"
            style={{ width: `${bar_pct}%` }}
          />
        </div>

        <button
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[14px] text-sm font-semibold bg-white transition-opacity hover:opacity-90"
          style={{
            color: BG_COLOR[status],
            boxShadow: "0 2px 8px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.9) inset",
          }}
          type="button"
          onClick={() => set_popover_open(true)}
        >
          {t("settings.protection_breakdown_title")}
          <ArrowRightIcon className="w-4 h-4" />
        </button>

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

                return (
                  <li key={label}>
                    <button
                      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors text-left ${is_clickable ? "hover:bg-edge-secondary/60 cursor-pointer" : "cursor-default"}`}
                      disabled={!is_clickable}
                      type="button"
                      onClick={() => {
                        if (!click_handler) return;
                        set_popover_open(false);
                        requestAnimationFrame(click_handler);
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
    </div>
  );
}
