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
import { ComposeSection } from "@/components/settings/compose_section";
import { SignatureSection } from "@/components/settings/signature_section";
import { TemplatesSection } from "@/components/settings/templates_section";

type ComposeTab = "compose" | "signature" | "templates";

const TAB_KEYS: readonly ComposeTab[] = ["compose", "signature", "templates"];

export function ComposeGroupSection() {
  const { t } = use_i18n();
  const { active_tab, handle_tab_change, render_tab } = use_settings_tabs(
    TAB_KEYS,
    "compose",
  );

  return (
    <div className="space-y-6">
      <SettingsTabBar
        active={active_tab}
        layout_id="compose-group"
        on_change={handle_tab_change}
        tabs={[
          { key: "compose", label: t("settings.compose") },
          { key: "signature", label: t("settings.signature") },
          { key: "templates", label: t("settings.templates") },
        ]}
      />

      {render_tab("compose", <ComposeSection />)}
      {render_tab("signature", <SignatureSection />)}
      {render_tab("templates", <TemplatesSection />)}
    </div>
  );
}
