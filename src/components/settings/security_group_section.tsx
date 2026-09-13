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
import type { Dispatch, SetStateAction } from "react";

import { useMemo } from "react";

import { use_i18n } from "@/lib/i18n/context";
import { SettingsTabBar } from "@/components/settings/settings_tab_bar";
import { use_settings_tabs } from "@/components/settings/use_settings_tabs";
import { SecuritySection } from "@/components/settings/security_section";
import { EncryptionSection } from "@/components/settings/encryption_section";
import { TrustedDevicesPanel } from "@/components/settings/trusted_devices_panel";

type SecurityTab = "security" | "trusted_devices" | "encryption";

interface SecurityGroupSectionProps {
  has_devices: boolean;
  show_inline_totp_setup: boolean;
  set_show_inline_totp_setup: Dispatch<SetStateAction<boolean>>;
  on_account_deleted: () => void;
}

export function SecurityGroupSection({
  has_devices,
  show_inline_totp_setup,
  set_show_inline_totp_setup,
  on_account_deleted,
}: SecurityGroupSectionProps) {
  const { t } = use_i18n();
  const tab_keys = useMemo<readonly SecurityTab[]>(
    () =>
      has_devices
        ? ["security", "trusted_devices", "encryption"]
        : ["security", "encryption"],
    [has_devices],
  );
  const { active_tab, handle_tab_change, render_tab } = use_settings_tabs(
    tab_keys,
    "security",
  );

  return (
    <div className="space-y-6">
      <SettingsTabBar
        active={active_tab}
        layout_id="security-group"
        on_change={handle_tab_change}
        tabs={[
          { key: "security" as SecurityTab, label: t("settings.security") },
          ...(has_devices
            ? [
                {
                  key: "trusted_devices" as SecurityTab,
                  label: t("settings.trusted_devices"),
                },
              ]
            : []),
          { key: "encryption" as SecurityTab, label: t("settings.encryption") },
        ]}
      />

      {render_tab(
        "security",
        <SecuritySection
          on_account_deleted={on_account_deleted}
          set_show_inline_totp_setup={set_show_inline_totp_setup}
          show_inline_totp_setup={show_inline_totp_setup}
        />,
      )}
      {has_devices && render_tab("trusted_devices", <TrustedDevicesPanel />)}
      {render_tab("encryption", <EncryptionSection />)}
    </div>
  );
}
