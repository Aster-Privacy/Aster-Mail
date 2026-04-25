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
import { BlockedSection } from "@/components/settings/blocked_section";
import { AllowlistSection } from "@/components/settings/allowlist_section";
import { AutoForwardSection } from "@/components/settings/auto_forward_section";
import { ExternalAccountsSection } from "@/components/settings/external_accounts_section";
import { VacationReplySection } from "@/components/settings/vacation_reply_section";

type FilterTab =
  | "external_accounts"
  | "blocked"
  | "allowlist"
  | "auto_forward"
  | "vacation_reply";

export function MailManagementSection() {
  const { t } = use_i18n();
  const [active_tab, set_active_tab] = useState<FilterTab>("external_accounts");

  return (
    <div className="space-y-4">
      <div className="inline-flex p-1 rounded-lg bg-surf-secondary">
        <button
          className="relative px-5 py-2 text-sm font-medium rounded-md transition-all duration-200 outline-none"
          style={{
            backgroundColor:
              active_tab === "external_accounts"
                ? "var(--bg-primary)"
                : "transparent",
            color:
              active_tab === "external_accounts"
                ? "var(--text-primary)"
                : "var(--text-muted)",
            boxShadow:
              active_tab === "external_accounts"
                ? "rgba(0, 0, 0, 0.1) 0px 1px 3px, rgba(0, 0, 0, 0.06) 0px 1px 2px"
                : "none",
          }}
          onClick={() => set_active_tab("external_accounts")}
        >
          {t("settings.external_accounts_tab")}
        </button>
        <button
          className="relative px-5 py-2 text-sm font-medium rounded-md transition-all duration-200 outline-none"
          style={{
            backgroundColor:
              active_tab === "blocked" ? "var(--bg-primary)" : "transparent",
            color:
              active_tab === "blocked"
                ? "var(--text-primary)"
                : "var(--text-muted)",
            boxShadow:
              active_tab === "blocked"
                ? "rgba(0, 0, 0, 0.1) 0px 1px 3px, rgba(0, 0, 0, 0.06) 0px 1px 2px"
                : "none",
          }}
          onClick={() => set_active_tab("blocked")}
        >
          {t("settings.blocked_tab")}
        </button>
        <button
          className="relative px-5 py-2 text-sm font-medium rounded-md transition-all duration-200 outline-none"
          style={{
            backgroundColor:
              active_tab === "allowlist" ? "var(--bg-primary)" : "transparent",
            color:
              active_tab === "allowlist"
                ? "var(--text-primary)"
                : "var(--text-muted)",
            boxShadow:
              active_tab === "allowlist"
                ? "rgba(0, 0, 0, 0.1) 0px 1px 3px, rgba(0, 0, 0, 0.06) 0px 1px 2px"
                : "none",
          }}
          onClick={() => set_active_tab("allowlist")}
        >
          {t("settings.allowlist_tab")}
        </button>
        <button
          className="relative px-5 py-2 text-sm font-medium rounded-md transition-all duration-200 outline-none"
          style={{
            backgroundColor:
              active_tab === "auto_forward"
                ? "var(--bg-primary)"
                : "transparent",
            color:
              active_tab === "auto_forward"
                ? "var(--text-primary)"
                : "var(--text-muted)",
            boxShadow:
              active_tab === "auto_forward"
                ? "rgba(0, 0, 0, 0.1) 0px 1px 3px, rgba(0, 0, 0, 0.06) 0px 1px 2px"
                : "none",
          }}
          onClick={() => set_active_tab("auto_forward")}
        >
          {t("settings.auto_forward_tab_label")}
        </button>
        <button
          className="relative px-5 py-2 text-sm font-medium rounded-md transition-all duration-200 outline-none"
          style={{
            backgroundColor:
              active_tab === "vacation_reply"
                ? "var(--bg-primary)"
                : "transparent",
            color:
              active_tab === "vacation_reply"
                ? "var(--text-primary)"
                : "var(--text-muted)",
            boxShadow:
              active_tab === "vacation_reply"
                ? "rgba(0, 0, 0, 0.1) 0px 1px 3px, rgba(0, 0, 0, 0.06) 0px 1px 2px"
                : "none",
          }}
          onClick={() => set_active_tab("vacation_reply")}
        >
          {t("settings.vacation_reply_tab_label")}
        </button>
      </div>

      <div
        style={{
          display: active_tab === "external_accounts" ? "block" : "none",
        }}
      >
        <ExternalAccountsSection />
      </div>
      <div style={{ display: active_tab === "blocked" ? "block" : "none" }}>
        <BlockedSection />
      </div>
      <div style={{ display: active_tab === "allowlist" ? "block" : "none" }}>
        <AllowlistSection />
      </div>
      <div
        style={{
          display: active_tab === "auto_forward" ? "block" : "none",
        }}
      >
        <AutoForwardSection />
      </div>
      <div
        style={{
          display: active_tab === "vacation_reply" ? "block" : "none",
        }}
      >
        <VacationReplySection />
      </div>
    </div>
  );
}
