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
import type { SettingsSection } from "@/components/settings/settings_content";

import { memo, useMemo } from "react";
import { AccountSwitcherView } from "@aster/ui";

import {
  StorageMeter,
  scroll_to_storage_addons,
} from "@/components/layout/storage_meter";
import { use_i18n } from "@/lib/i18n/context";

interface SidebarAccountSwitcherProps {
  is_collapsed: boolean;
  storage_percentage: number;
  storage_used_bytes: number;
  storage_total_bytes: number;
  on_settings_click: (section?: SettingsSection) => void;
  on_modal_open?: () => void;
  on_toggle_collapse?: () => void;
}

export const SidebarAccountSwitcher = memo(function SidebarAccountSwitcher({
  is_collapsed,
  storage_percentage,
  storage_used_bytes,
  storage_total_bytes,
  on_settings_click,
  on_modal_open,
  on_toggle_collapse,
}: SidebarAccountSwitcherProps) {
  const { t } = use_i18n();
  const labels = useMemo(
    () => ({
      invite: t("settings.invite_friends"),
      expand_sidebar: t("common.expand_sidebar"),
      collapse_sidebar: t("common.collapse_sidebar"),
    }),
    [t],
  );

  return (
    <AccountSwitcherView
      is_collapsed={is_collapsed}
      labels={labels}
      storage={
        <StorageMeter
          className="mb-3"
          on_buy_more={() => {
            on_settings_click("storage");
            scroll_to_storage_addons();
          }}
          on_open={() => on_settings_click("storage")}
          storage_percentage={storage_percentage}
          storage_total_bytes={storage_total_bytes}
          storage_used_bytes={storage_used_bytes}
        />
      }
      on_invite={() => {
        on_modal_open?.();
        on_settings_click("referral");
      }}
      on_toggle_collapse={on_toggle_collapse}
    />
  );
});
