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

import { use_i18n } from "@/lib/i18n/context";
import { SettingsTabBar } from "@/components/settings/settings_tab_bar";
import { BlockedSection } from "@/components/settings/blocked_section";
import { AllowlistSection } from "@/components/settings/allowlist_section";
import { AutoForwardSection } from "@/components/settings/auto_forward_section";
import { ExternalAccountsSection } from "@/components/settings/external_accounts_section";
import { VacationReplySection } from "@/components/settings/vacation_reply_section";
import { ExportSection } from "@/components/settings/export_section";

type FilterTab =
  | "external_accounts"
  | "blocked"
  | "allowlist"
  | "auto_forward"
  | "vacation_reply"
  | "export";

export function MailManagementSection() {
  const { t } = use_i18n();
  const [active_tab, set_active_tab] = useState<FilterTab>("external_accounts");
  const [visited_tabs, set_visited_tabs] = useState<Set<FilterTab>>(
    () => new Set<FilterTab>(["external_accounts"]),
  );

  const handle_tab_change = (tab: FilterTab) => {
    set_active_tab(tab);
    set_visited_tabs((previous) => {
      if (previous.has(tab)) return previous;
      const next = new Set(previous);

      next.add(tab);

      return next;
    });
  };

  const render_tab = (tab: FilterTab, content: React.ReactNode) => {
    if (!visited_tabs.has(tab)) return null;

    return (
      <div style={{ display: active_tab === tab ? "block" : "none" }}>
        {content}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <SettingsTabBar
        active={active_tab}
        layout_id="mail-management"
        on_change={handle_tab_change}
        tabs={[
          {
            key: "external_accounts",
            label: t("settings.external_accounts_tab"),
          },
          { key: "blocked", label: t("settings.blocked_tab") },
          { key: "allowlist", label: t("settings.allowlist_tab") },
          { key: "auto_forward", label: t("settings.auto_forward_tab_label") },
          {
            key: "vacation_reply",
            label: t("settings.vacation_reply_tab_label"),
          },
          { key: "export", label: t("settings.export_title") },
        ]}
      />

      {render_tab("external_accounts", <ExternalAccountsSection />)}
      {render_tab("blocked", <BlockedSection />)}
      {render_tab("allowlist", <AllowlistSection />)}
      {render_tab("auto_forward", <AutoForwardSection />)}
      {render_tab("vacation_reply", <VacationReplySection />)}
      {render_tab("export", <ExportSection />)}
    </div>
  );
}
