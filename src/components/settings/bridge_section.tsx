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
  ArrowsRightLeftIcon,
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
  available: boolean;
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
    <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 0 0-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.105-.188-.15.037-.527.076-1.267.137-1.752.075-.968.082-2.01-.07-2.87-.074-.663-.364-1.206-.853-1.515-2.312-1.373-2.727-4.06-2.564-6.142l.003-.003c.077-1.349.108-2.692-.236-3.78C15.823.596 14.248.001 12.504 0z" />
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
      available: true,
      sub_links: [
        { label_key: "settings.bridge_download_msi", platform: "windows-msi" },
      ],
      icon: windows_icon,
    },
    {
      id: "linux",
      name_key: "settings.bridge_linux_name",
      desc_key: "settings.bridge_linux_desc",
      cta_key: "settings.bridge_coming_soon",
      platform: "linux-appimage",
      available: false,
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
      cta_key: "settings.bridge_coming_soon",
      platform: "macos-dmg",
      available: false,
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
              <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
                <ArrowsRightLeftIcon className="w-[18px] h-[18px] flex-shrink-0" />
                {t("settings.desktop_bridge_title")}
              </h3>
              <a
                href="https://astermail.org/bridge"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-txt-muted hover:text-txt-secondary transition-colors"
                title={t("settings.bridge_info_link")}
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
              className={`rounded-xl border p-4 flex flex-col gap-3 ${
                card.available
                  ? "border-edge-secondary bg-surf-primary"
                  : "border-edge-primary bg-surf-secondary opacity-60"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-txt-secondary">{card.icon}</span>
                <span className="text-sm font-semibold text-txt-primary">{t(card.name_key)}</span>
              </div>
              <p className="text-xs text-txt-muted leading-relaxed flex-1">{t(card.desc_key)}</p>
              <div className="flex flex-col gap-1.5">
                {card.available ? (
                  <a
                    href={`${DL}/${card.platform}`}
                    className="aster_btn aster_btn_depth aster_btn_sm flex items-center justify-center gap-1.5 w-full"
                  >
                    <ArrowDownTrayIcon className="w-3.5 h-3.5 flex-shrink-0" />
                    {t(card.cta_key)}
                  </a>
                ) : (
                  <span className="aster_btn aster_btn_outline aster_btn_sm flex items-center justify-center w-full opacity-50 cursor-default pointer-events-none">
                    {t(card.cta_key)}
                  </span>
                )}
                {card.sub_links && card.available && (
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
