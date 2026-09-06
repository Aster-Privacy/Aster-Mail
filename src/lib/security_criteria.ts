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

export type SecurityCriterionId =
  | "two_factor"
  | "passkey"
  | "recovery_email"
  | "login_alerts"
  | "tracking_pixels"
  | "remote_images"
  | "strip_exif";

export interface SecurityCriterionSource {
  totp_enabled: boolean;
  passkey_registered: boolean;
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
  section: "security" | "account";
  anchor?: string;
}

export function build_security_criteria(
  source: SecurityCriterionSource,
): SecurityCriterion[] {
  return [
    {
      id: "two_factor",
      label_key: "settings.criterion_two_factor",
      met: source.totp_enabled,
      section: "security",
      anchor: "sec-2fa",
    },
    {
      id: "passkey",
      label_key: "settings.criterion_passkey",
      met: source.passkey_registered,
      section: "security",
      anchor: "sec-passkeys",
    },
    {
      id: "recovery_email",
      label_key: "settings.criterion_recovery_email",
      met: source.recovery_email_verified,
      section: "account",
    },
    {
      id: "login_alerts",
      label_key: "settings.criterion_login_alerts",
      met: source.login_alerts_enabled,
      section: "security",
      anchor: "sec-2fa",
    },
    {
      id: "tracking_pixels",
      label_key: "settings.block_spy_pixels",
      met: source.block_tracking_pixels,
      section: "security",
      anchor: "sec-tracking",
    },
    {
      id: "remote_images",
      label_key: "settings.block_remote_images_label",
      met: source.block_remote_images,
      section: "security",
      anchor: "sec-images",
    },
    {
      id: "strip_exif",
      label_key: "settings.strip_exif_on_compose_label",
      met: source.strip_exif_on_compose,
      section: "security",
      anchor: "sec-images",
    },
  ];
}

export function security_percent(criteria: SecurityCriterion[]): number {
  if (criteria.length === 0) return 0;

  const met = criteria.reduce((sum, item) => sum + (item.met ? 1 : 0), 0);

  return Math.round((met / criteria.length) * 100);
}
