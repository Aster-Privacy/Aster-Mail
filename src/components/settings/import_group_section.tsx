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
import { ImportSection } from "@/components/settings/import_section";
import { ExternalAccountsSection } from "@/components/settings/external_accounts_section";
import { ExportSection } from "@/components/settings/export_section";

type ImportTab = "import" | "external_accounts" | "export";

const TAB_KEYS: readonly ImportTab[] = [
  "import",
  "external_accounts",
  "export",
];

export function ImportGroupSection() {
  const { t } = use_i18n();
  const { active_tab, handle_tab_change, render_tab } = use_settings_tabs(
    TAB_KEYS,
    "import",
  );

  return (
    <div className="space-y-6">
      <SettingsTabBar
        active={active_tab}
        layout_id="import-group"
        on_change={handle_tab_change}
        tabs={[
          { key: "import", label: t("common.import") },
          {
            key: "external_accounts",
            label: t("settings.external_accounts_tab"),
          },
          { key: "export", label: t("settings.export_title") },
        ]}
      />

      {render_tab("import", <ImportSection />)}
      {render_tab("external_accounts", <ExternalAccountsSection />)}
      {render_tab("export", <ExportSection />)}
    </div>
  );
}
