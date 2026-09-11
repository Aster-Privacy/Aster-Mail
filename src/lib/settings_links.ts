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
import type { SettingsSection } from "@/components/settings/settings_content_helpers";

export const SETTINGS_ANCHORS = {
  two_factor: "sec-2fa",
  passkeys: "sec-passkeys",
  sessions: "sec-sessions",
  trusted_devices: "sec-devices",
  login_alerts: "sec-login-alerts",
  account_recovery: "sec-recovery",
  tracking: "sec-tracking",
  images: "sec-images",
  vanguard: "sec-vanguard",
  recovery_email: "acct-recovery-email",
} as const;

export type SettingsAnchor =
  (typeof SETTINGS_ANCHORS)[keyof typeof SETTINGS_ANCHORS];

export interface SettingsTarget {
  section: SettingsSection;
  anchor?: SettingsAnchor;
}

export interface SettingsNavigation {
  section?: string;
  anchor?: string;
}

export type SecurityCenterLinkId =
  | "overview"
  | "sessions"
  | "trusted_devices"
  | "aliases"
  | "lockdown"
  | "vanguard"
  | "encryption";

export const SECURITY_CENTER_TARGETS: Record<
  SecurityCenterLinkId,
  SettingsTarget
> = {
  overview: { section: "security" },
  sessions: { section: "security", anchor: SETTINGS_ANCHORS.sessions },
  trusted_devices: {
    section: "security",
    anchor: SETTINGS_ANCHORS.trusted_devices,
  },
  aliases: { section: "aliases" },
  lockdown: { section: "security", anchor: SETTINGS_ANCHORS.vanguard },
  vanguard: { section: "security", anchor: SETTINGS_ANCHORS.vanguard },
  encryption: { section: "encryption" },
};

export function read_settings_navigation(detail: unknown): SettingsNavigation {
  if (typeof detail === "string") {
    return detail ? { section: detail } : {};
  }

  if (!detail || typeof detail !== "object") return {};

  const { section, anchor } = detail as Record<string, unknown>;

  return {
    section: typeof section === "string" && section ? section : undefined,
    anchor: typeof anchor === "string" && anchor ? anchor : undefined,
  };
}

export function open_settings_target(target: SettingsTarget) {
  window.dispatchEvent(
    new CustomEvent("navigate-settings", {
      detail: target.anchor
        ? { section: target.section, anchor: target.anchor }
        : target.section,
    }),
  );
}
