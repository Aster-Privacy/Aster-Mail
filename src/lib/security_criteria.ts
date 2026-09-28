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
import type { TranslationKey } from "@/lib/i18n/types";
import type { SettingsTarget } from "@/lib/settings_links";

import { SETTINGS_ANCHORS } from "@/lib/settings_links";

export type SecurityCriterionId =
  | "two_factor"
  | "passkey"
  | "recovery_codes"
  | "recovery_email"
  | "login_alerts"
  | "tracking_pixels"
  | "remote_images"
  | "strip_exif";

export interface SecurityCriterionSource {
  totp_enabled: boolean;
  passkey_registered: boolean;
  recovery_codes_saved: boolean;
  recovery_email_verified: boolean;
  login_alerts_enabled: boolean;
  block_tracking_pixels: boolean;
  block_remote_images: boolean;
  strip_exif_on_compose: boolean;
}

export interface SecurityCriterion {
  id: SecurityCriterionId;
  label_key: TranslationKey;
  met: boolean;
  target: SettingsTarget;
}

export const SECURITY_CRITERION_IDS: readonly SecurityCriterionId[] = [
  "two_factor",
  "passkey",
  "recovery_codes",
  "recovery_email",
  "login_alerts",
  "tracking_pixels",
  "remote_images",
  "strip_exif",
];

export const SECURITY_CRITERION_TARGETS: Record<
  SecurityCriterionId,
  SettingsTarget
> = {
  two_factor: { section: "security", anchor: SETTINGS_ANCHORS.two_factor },
  passkey: { section: "security", anchor: SETTINGS_ANCHORS.passkeys },
  recovery_codes: {
    section: "security",
    anchor: SETTINGS_ANCHORS.account_recovery,
  },
  recovery_email: {
    section: "account",
    anchor: SETTINGS_ANCHORS.recovery_email,
  },
  login_alerts: { section: "security", anchor: SETTINGS_ANCHORS.login_alerts },
  tracking_pixels: { section: "security", anchor: SETTINGS_ANCHORS.tracking },
  remote_images: { section: "security", anchor: SETTINGS_ANCHORS.images },
  strip_exif: { section: "security", anchor: SETTINGS_ANCHORS.images },
};

const CRITERION_LABELS: Record<SecurityCriterionId, TranslationKey> = {
  two_factor: "settings.criterion_two_factor",
  passkey: "settings.criterion_passkey",
  recovery_codes: "settings.criterion_recovery_codes",
  recovery_email: "settings.criterion_recovery_email",
  login_alerts: "settings.criterion_login_alerts",
  tracking_pixels: "settings.block_spy_pixels",
  remote_images: "settings.block_remote_images_label",
  strip_exif: "settings.strip_exif_on_compose_label",
};

export function build_security_criteria(
  source: SecurityCriterionSource,
): SecurityCriterion[] {
  const met: Record<SecurityCriterionId, boolean> = {
    two_factor: source.totp_enabled,
    passkey: source.passkey_registered,
    recovery_codes: source.recovery_codes_saved,
    recovery_email: source.recovery_email_verified,
    login_alerts: source.login_alerts_enabled,
    tracking_pixels: source.block_tracking_pixels,
    remote_images: source.block_remote_images,
    strip_exif: source.strip_exif_on_compose,
  };

  return SECURITY_CRITERION_IDS.map((id) => ({
    id,
    label_key: CRITERION_LABELS[id],
    met: met[id],
    target: SECURITY_CRITERION_TARGETS[id],
  }));
}

export function security_percent(criteria: SecurityCriterion[]): number {
  if (criteria.length === 0) return 0;

  const met = criteria.reduce((sum, item) => sum + (item.met ? 1 : 0), 0);

  return Math.round((met / criteria.length) * 100);
}
