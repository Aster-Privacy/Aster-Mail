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

import { SettingsHeader, chip_selected_style } from "./shared";
import { BlockedSendersTab } from "./blocked_senders_tab";
import { AllowlistTab } from "./allowlist_tab";
import { AutoForwardTab } from "./auto_forward_tab";
import { VacationReplyTab } from "./vacation_reply_tab";

import { use_i18n } from "@/lib/i18n/context";

type MailManagementTab =
  | "blocked"
  | "allowlist"
  | "auto_forward"
  | "vacation_reply";

export function SenderFiltersSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const [active_tab, set_active_tab] = useState<MailManagementTab>("blocked");

  const tabs: { key: MailManagementTab; label: string }[] = [
    { key: "blocked", label: t("settings.blocked") },
    { key: "allowlist", label: t("settings.allowlist_title") },
    { key: "auto_forward", label: t("settings.auto_forward_title") },
    { key: "vacation_reply", label: t("settings.vacation_reply_title") },
  ];

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.mail_management")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="px-4 pt-4">
          <div className="flex overflow-x-auto gap-2 no-scrollbar">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                className={`shrink-0 rounded-[14px] px-4 py-2.5 text-[13px] font-medium transition-colors ${active_tab === tab.key ? "text-white" : "bg-[var(--mobile-bg-card)] text-[var(--mobile-text-primary)]"}`}
                style={active_tab === tab.key ? chip_selected_style : undefined}
                type="button"
                onClick={() => set_active_tab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {active_tab === "blocked" && <BlockedSendersTab />}
        {active_tab === "allowlist" && <AllowlistTab />}
        {active_tab === "auto_forward" && <AutoForwardTab />}
        {active_tab === "vacation_reply" && <VacationReplyTab />}
      </div>
    </div>
  );
}
