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
import {
  ArrowDownTrayIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { get_subscription } from "@/services/api/billing";
import { UpgradeGate } from "@/components/common/upgrade_gate";

const DL = "/api/bridge/v1/download";

interface PlatformCard {
  id: string;
  name_key: string;
  desc_key: string;
  cta_key: string;
  platform: string;
  sub_links?: { label_key: string; platform: string }[];
  icon: React.ReactNode;
}

const windows_icon = (
  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
  </svg>
);

const linux_icon = (
  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.682 14.908c-.186-.309-.55-.607-.955-.852l.016-.014-1.988-2.355c-.316-1.29-.572-2.59-.562-3.898C16.213 4.373 14.205 2 11.945 2c-2.252 0-4.267 2.384-4.25 5.8.01 1.305-.248 2.604-.566 3.891L5.14 14.047l.012.01c-.405.245-.766.543-.952.852C3.2 16.64 4.11 19.5 7.68 20.09c1.06.175 2.157.25 3.236.261.188.002.374.002.56 0 1.076-.011 2.174-.086 3.237-.262 3.566-.588 4.48-3.45 2.969-5.181zm-11.9-2.375c.156-.624.333-1.244.485-1.869.28-1.138.504-2.29.499-3.473-.015-2.81 1.463-4.629 3.18-4.629s3.19 1.82 3.178 4.625c-.005 1.183.218 2.336.498 3.473.152.625.33 1.245.485 1.87H7.782v.003zm4.162 6.42c-.37.003-.742.003-1.112 0-1.005-.011-2.03-.082-3.018-.245-2.568-.424-3.162-2.21-2.28-3.285.406-.5 1.268-.958 2.136-1.096.122-.02.247-.033.373-.04h7.693c.127.007.252.02.374.04.868.138 1.73.596 2.137 1.096.882 1.075.287 2.86-2.28 3.285-.99.163-2.015.233-3.023.245z" />
  </svg>
);

const apple_icon = (
  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
);

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

  const platform_cards: PlatformCard[] = [
    {
      id: "windows",
      name_key: "settings.bridge_windows_name",
      desc_key: "settings.bridge_windows_desc",
      cta_key: "settings.bridge_download_windows",
      platform: "windows-exe",
      sub_links: [
        { label_key: "settings.bridge_download_msi", platform: "windows-msi" },
      ],
      icon: windows_icon,
    },
    {
      id: "linux",
      name_key: "settings.bridge_linux_name",
      desc_key: "settings.bridge_linux_desc",
      cta_key: "settings.bridge_linux_cta",
      platform: "linux-appimage",
      sub_links: [
        { label_key: "settings.bridge_linux_deb_link", platform: "linux-deb" },
        { label_key: "settings.bridge_linux_rpm_link", platform: "linux-rpm" },
      ],
      icon: linux_icon,
    },
    {
      id: "macos",
      name_key: "settings.bridge_macos_name",
      desc_key: "settings.bridge_macos_desc",
      cta_key: "settings.bridge_macos_cta",
      platform: "macos-dmg",
      icon: apple_icon,
    },
  ];

  if (!loaded) return null;

  return (
    <UpgradeGate
      feature_name={t("settings.desktop_bridge_upgrade_title")}
      description={t("settings.desktop_bridge_upgrade_description")}
      min_plan="Star"
      is_locked={is_locked}
      variant="centered"
    >
      <div className="space-y-5">
        <div>
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-txt-primary">
                {t("settings.bridge_app_name")}
              </h3>
              <a
                href="https://astermail.org/bridge"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-txt-muted hover:text-txt-secondary transition-colors"
              >
                <InformationCircleIcon className="w-4 h-4" />
                <span>{t("settings.bridge_info_link")}</span>
              </a>
            </div>
            <div className="mt-2 h-px bg-edge-secondary" />
          </div>
          <p className="text-sm text-txt-muted">
            {t("settings.desktop_bridge_description")}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {platform_cards.map((card) => (
            <div
              key={card.id}
              className="rounded-xl border border-edge-secondary bg-surf-primary p-4 flex flex-col gap-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-txt-secondary">{card.icon}</span>
                <span className="text-sm font-semibold text-txt-primary">{t(card.name_key)}</span>
              </div>
              <p className="text-xs text-txt-muted leading-relaxed flex-1">{t(card.desc_key)}</p>
              <div className="flex flex-col gap-1.5">
                <a
                  href={`${DL}/${card.platform}`}
                  className="aster_btn aster_btn_depth aster_btn_sm flex items-center justify-center gap-1.5 w-full"
                >
                  <ArrowDownTrayIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  {t(card.cta_key)}
                </a>
                {card.sub_links && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 justify-center">
                    {card.sub_links.map((link) => (
                      <a
                        key={link.platform}
                        href={`${DL}/${link.platform}`}
                        className="text-xs text-txt-muted hover:text-txt-secondary transition-colors hover:underline underline-offset-2"
                      >
                        {t(link.label_key)}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-txt-muted">{t("settings.desktop_bridge_install_hint")}</p>
      </div>
    </UpgradeGate>
  );
}
