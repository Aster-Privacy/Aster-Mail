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
import { use_i18n } from "@/lib/i18n/context";
import { SettingsTabBar } from "@/components/settings/settings_tab_bar";
import { use_settings_tabs } from "@/components/settings/use_settings_tabs";
import { MailRulesSection } from "@/components/settings/mail_rules_section";
import { BlockedSection } from "@/components/settings/blocked_section";
import { AllowlistSection } from "@/components/settings/allowlist_section";
import { AutoForwardSection } from "@/components/settings/auto_forward_section";
import { VacationReplySection } from "@/components/settings/vacation_reply_section";

type RulesTab =
  | "rules"
  | "blocked"
  | "allowlist"
  | "auto_forward"
  | "vacation_reply";

const TAB_KEYS: readonly RulesTab[] = [
  "rules",
  "blocked",
  "allowlist",
  "auto_forward",
  "vacation_reply",
];

export function RulesGroupSection() {
  const { t } = use_i18n();
  const { active_tab, handle_tab_change, render_tab } = use_settings_tabs(
    TAB_KEYS,
    "rules",
  );

  return (
    <div className="space-y-6">
      <SettingsTabBar
        active={active_tab}
        layout_id="rules-group"
        on_change={handle_tab_change}
        tabs={[
          { key: "rules", label: t("mail_rules.title") },
          { key: "blocked", label: t("settings.blocked_tab") },
          { key: "allowlist", label: t("settings.allowlist_tab") },
          { key: "auto_forward", label: t("settings.auto_forward_tab_label") },
          {
            key: "vacation_reply",
            label: t("settings.vacation_reply_tab_label"),
          },
        ]}
      />

      {render_tab("rules", <MailRulesSection />)}
      {render_tab("blocked", <BlockedSection />)}
      {render_tab("allowlist", <AllowlistSection />)}
      {render_tab("auto_forward", <AutoForwardSection />)}
      {render_tab("vacation_reply", <VacationReplySection />)}
    </div>
  );
}
