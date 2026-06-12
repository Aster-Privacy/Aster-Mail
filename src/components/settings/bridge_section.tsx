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
import { useState, useEffect } from "react";
import { ArrowDownTrayIcon, ArrowsRightLeftIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { get_subscription } from "@/services/api/billing";
import { UpgradeGate } from "@/components/common/upgrade_gate";

const BRIDGE_EXE = "https://github.com/Aster-Privacy/Aster-Bridge/releases/latest/download/Aster-Bridge-x64-setup.exe";
const BRIDGE_MSI = "https://github.com/Aster-Privacy/Aster-Bridge/releases/latest/download/Aster-Bridge-x64.msi";

export function BridgeSection() {
  const { t } = use_i18n();
  const [is_locked, set_is_locked] = useState(true);
  const [loaded, set_loaded] = useState(false);

  useEffect(() => {
    get_subscription().then((res) => {
      const code = res.data?.plan?.code?.toLowerCase() ?? "free";
      set_is_locked(code === "free");
      set_loaded(true);
    }).catch(() => {
      set_loaded(true);
    });
  }, []);

  if (!loaded) return null;

  return (
    <UpgradeGate
      feature_name={t("settings.desktop_bridge_upgrade_title")}
      description={t("settings.desktop_bridge_upgrade_description")}
      min_plan="Star"
      is_locked={is_locked}
      variant="centered"
    >
      <div className="space-y-4">
        <div>
          <div className="mb-4">
            <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
              <ArrowsRightLeftIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
              {t("settings.desktop_bridge_title")}
            </h3>
            <div className="mt-2 h-px bg-edge-secondary" />
          </div>
          <p className="text-sm mb-4 text-txt-muted">
            {t("settings.desktop_bridge_description")}
          </p>
        </div>

        <div className="rounded-xl border border-edge-secondary p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-5 h-5 text-txt-secondary flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
            </svg>
            <p className="text-sm font-medium text-txt-primary">Windows</p>
          </div>
          <a
            href={BRIDGE_EXE}
            className="aster_btn aster_btn_depth aster_btn_md flex items-center gap-2 w-full justify-center"
          >
            <ArrowDownTrayIcon className="w-4 h-4 flex-shrink-0" />
            {t("settings.bridge_download_windows")}
          </a>
          <div className="text-center">
            <a href={BRIDGE_MSI} className="text-xs text-txt-muted hover:text-txt-secondary underline-offset-2 hover:underline">
              {t("settings.bridge_download_msi")}
            </a>
          </div>
        </div>

        <p className="text-xs text-txt-muted">{t("settings.desktop_bridge_install_hint")}</p>
      </div>
    </UpgradeGate>
  );
}
