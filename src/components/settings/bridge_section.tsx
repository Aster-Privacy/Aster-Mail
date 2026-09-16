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
import type { TranslationKey } from "@/lib/i18n";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ArrowDownTrayIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  ComputerDesktopIcon,
  QuestionMarkCircleIcon,
  LinkSlashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { copy_text_or_throw } from "@/utils/copy_text";
import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  list_devices,
  revoke_device,
  type Device,
} from "@/services/api/devices";
import { InfoPopover } from "@/components/ui/info_popover";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { ButtonSpinner } from "@/components/ui/spinner";
import { show_toast } from "@/components/toast/simple_toast";
import { SmtpTokensSection } from "@/components/settings/smtp_tokens_section";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { app_locale, get_display_time_zone } from "@/utils/date_format";
import { detect_platform } from "@/lib/utils";

const DL = "/api/bridge/v1/download";

const CLI_DOCS_URL = "https://astermail.org/bridge/docs/command-line";

type DesktopPlatform = "windows" | "macos" | "linux";

interface FormatLink {
  label_key: TranslationKey;
  desc_key?: TranslationKey;
  platform: string;
}

interface FormatGroup {
  id: string;
  label_key?: TranslationKey;
  links: FormatLink[];
}

interface PlatformCard {
  id: DesktopPlatform;
  name_key: TranslationKey;
  desc_key: TranslationKey;
  cta_key: TranslationKey;
  platform: string;
  format_groups?: FormatGroup[];
  icon: React.ReactNode;
}

const windows_icon = (
  <svg
    className="w-5 h-5 flex-shrink-0"
    fill="currentColor"
    viewBox="0 0 24 24"
  >
    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
  </svg>
);

const linux_icon = (
  <svg
    className="w-5 h-5 flex-shrink-0"
    fill="currentColor"
    viewBox="0 0 24 24"
  >
    <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.043c-.06-.003-.12 0-.18 0h-.016c.151-.467-.182-.825-1.065-1.224-.915-.4-1.646-.336-1.77.465-.008.043-.013.066-.018.135-.068.023-.139.053-.209.064-.43.268-.662.669-.793 1.187-.13.533-.17 1.156-.205 1.869v.003c-.02.334-.17.838-.319 1.35-1.5 1.072-3.58 1.538-5.348.334a2.645 2.645 0 00-.402-.533 1.45 1.45 0 00-.275-.333c.182 0 .338-.03.465-.067a.615.615 0 00.314-.334c.108-.267 0-.697-.345-1.163-.345-.467-.931-.995-1.788-1.521-.63-.4-.986-.87-1.15-1.396-.165-.534-.143-1.085-.015-1.645.245-1.07.873-2.11 1.274-2.763.107-.065.037.135-.408.974-.396.751-1.14 2.497-.122 3.854a8.123 8.123 0 01.647-2.876c.564-1.278 1.743-3.504 1.836-5.268.048.036.217.135.289.202.218.133.38.333.59.465.21.201.477.335.876.335.039.003.075.006.11.006.412 0 .73-.134.997-.268.29-.134.52-.334.74-.4h.005c.467-.135.835-.402 1.044-.7z" />
  </svg>
);

const terminal_icon = (
  <svg
    className="w-5 h-5 flex-shrink-0"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.9}
    viewBox="0 0 24 24"
  >
    <path d="M4 6.5L9.5 12 4 17.5" />
    <path d="M12.5 17.5H20" />
  </svg>
);

const apple_icon = (
  <svg
    className="w-5 h-5 flex-shrink-0"
    fill="currentColor"
    viewBox="0 0 24 24"
  >
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

const PLATFORM_CARDS: PlatformCard[] = [
  {
    id: "windows",
    name_key: "settings.bridge_windows_name",
    desc_key: "settings.bridge_windows_desc",
    cta_key: "settings.bridge_download_windows",
    platform: "windows-exe",
    format_groups: [
      {
        id: "windows_formats",
        links: [
          {
            label_key: "settings.bridge_download_msi",
            desc_key: "settings.bridge_format_msi_desc",
            platform: "windows-msi",
          },
        ],
      },
    ],
    icon: windows_icon,
  },
  {
    id: "macos",
    name_key: "settings.bridge_macos_name",
    desc_key: "settings.bridge_macos_desc",
    cta_key: "settings.bridge_macos_cta",
    platform: "macos-dmg",
    icon: apple_icon,
  },
  {
    id: "linux",
    name_key: "settings.bridge_linux_name",
    desc_key: "settings.bridge_linux_desc",
    cta_key: "settings.bridge_linux_cta",
    platform: "linux-appimage",
    format_groups: [
      {
        id: "linux_x64",
        label_key: "settings.bridge_arch_x64",
        links: [
          {
            label_key: "settings.bridge_linux_deb_link",
            desc_key: "settings.bridge_format_deb_desc",
            platform: "linux-deb",
          },
          {
            label_key: "settings.bridge_linux_rpm_link",
            desc_key: "settings.bridge_format_rpm_desc",
            platform: "linux-rpm",
          },
          {
            label_key: "settings.bridge_linux_pacman_link",
            desc_key: "settings.bridge_format_pacman_desc",
            platform: "linux-pacman",
          },
        ],
      },
      {
        id: "linux_arm64",
        label_key: "settings.bridge_arch_arm64",
        links: [
          {
            label_key: "settings.bridge_linux_appimage_arm64_link",
            desc_key: "settings.bridge_format_appimage_desc",
            platform: "linux-appimage-arm64",
          },
          {
            label_key: "settings.bridge_linux_deb_arm64_link",
            desc_key: "settings.bridge_format_deb_desc",
            platform: "linux-deb-arm64",
          },
          {
            label_key: "settings.bridge_linux_rpm_arm64_link",
            desc_key: "settings.bridge_format_rpm_desc",
            platform: "linux-rpm-arm64",
          },
        ],
      },
    ],
    icon: linux_icon,
  },
];

interface CliVariant {
  id: DesktopPlatform;
  name_key: TranslationKey;
  hint_key: TranslationKey;
  download_platform: string;
  commands: string;
  arch_link?: FormatLink;
}

const CLI_VARIANTS: CliVariant[] = [
  {
    id: "windows",
    name_key: "settings.bridge_cli_windows_link",
    hint_key: "settings.bridge_cli_install_hint_windows",
    download_platform: "cli-windows",
    commands: [
      "Expand-Archive aster-bridge-cli-*.zip -DestinationPath $HOME\\aster-bridge",
      "Move-Item $HOME\\aster-bridge\\aster-bridge-cli-*\\aster-bridge.exe $HOME\\aster-bridge",
      `setx PATH "$([Environment]::GetEnvironmentVariable('PATH','User'));$HOME\\aster-bridge"`,
    ].join("\n"),
  },
  {
    id: "macos",
    name_key: "settings.bridge_cli_macos_link",
    hint_key: "settings.bridge_cli_install_hint",
    download_platform: "cli-macos",
    commands: [
      "tar -xzf aster-bridge-cli-*.tar.gz",
      "sudo install -m 755 aster-bridge-cli-*/aster-bridge /usr/local/bin/",
    ].join("\n"),
  },
  {
    id: "linux",
    name_key: "settings.bridge_cli_linux_link",
    hint_key: "settings.bridge_cli_install_hint",
    download_platform: "cli-linux-x64",
    commands: [
      "tar -xzf aster-bridge-cli-*.tar.gz",
      "install -m 755 aster-bridge-cli-*/aster-bridge ~/.local/bin/",
    ].join("\n"),
    arch_link: {
      label_key: "settings.bridge_cli_linux_arm64_link",
      platform: "cli-linux-arm64",
    },
  },
];

function current_desktop_platform(): DesktopPlatform {
  const detected = detect_platform();

  if (detected === "mac") return "macos";
  if (detected === "linux") return "linux";

  return "windows";
}

async function start_bridge_download(
  platform: string,
  is_locked: boolean,
  t: Translate,
  event?: React.MouseEvent,
) {
  event?.preventDefault();

  if (is_locked) return;

  const url = `${DL}/${platform}`;

  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual" });

    if (res.type !== "opaqueredirect" && !res.ok) {
      throw new Error(String(res.status));
    }
  } catch {
    show_toast(t("settings.bridge_download_failed"), "error");

    return;
  }

  show_toast(t("settings.bridge_download_started"), "success");
  window.location.href = url;
}

interface BridgeDownloadLinkProps {
  platform: string;
  is_locked: boolean;
  className: string;
  children: React.ReactNode;
}

function BridgeDownloadLink({
  platform,
  is_locked,
  className,
  children,
}: BridgeDownloadLinkProps) {
  const { t } = use_i18n();
  const classes = [
    className,
    is_locked ? "opacity-40 cursor-not-allowed" : "",
  ].join(" ");

  if (is_locked) {
    return (
      <button disabled className={classes} type="button">
        {children}
      </button>
    );
  }

  return (
    <a
      className={classes}
      href={`${DL}/${platform}`}
      onClick={(event) =>
        void start_bridge_download(platform, is_locked, t, event)
      }
    >
      {children}
    </a>
  );
}

interface DownloadFormatMenuProps {
  label: string;
  is_locked: boolean;
  groups: FormatGroup[];
  children?: React.ReactNode;
}

function DownloadFormatMenu({
  label,
  is_locked,
  groups,
  children,
}: DownloadFormatMenuProps) {
  const { t } = use_i18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={is_locked}>
        <button
          className={`aster_btn aster_btn_outline aster_btn_md inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
            is_locked ? "opacity-40 cursor-not-allowed" : ""
          }`}
          type="button"
        >
          {children ?? label}
          <ChevronDownIcon className="w-3.5 h-3.5 flex-shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {groups.map((group, group_index) => (
          <div key={group.id}>
            {group_index > 0 && <DropdownMenuSeparator />}
            {group.label_key && (
              <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-txt-muted">
                {t(group.label_key)}
              </DropdownMenuLabel>
            )}
            {group.links.map((link) => (
              <DropdownMenuItem
                key={link.platform}
                asChild
                className="items-start gap-2.5 py-2"
              >
                <a
                  href={`${DL}/${link.platform}`}
                  onClick={(event) =>
                    void start_bridge_download(
                      link.platform,
                      is_locked,
                      t,
                      event,
                    )
                  }
                >
                  <ArrowDownTrayIcon className="mt-0.5 w-4 h-4 text-txt-muted flex-shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-txt-primary">
                      {t(link.label_key)}
                    </span>
                    {link.desc_key && (
                      <span className="mt-0.5 block text-xs leading-snug text-txt-muted">
                        {t(link.desc_key)}
                      </span>
                    )}
                  </span>
                </a>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface CommandBlockProps {
  commands: string;
  copy_label: string;
}

function CommandBlock({ commands, copy_label }: CommandBlockProps) {
  const { t } = use_i18n();
  const [copied, set_copied] = useState(false);

  const copy_command = useCallback(async () => {
    try {
      await copy_text_or_throw(commands);
      set_copied(true);
      show_toast(t("common.copied"), "success");
    } catch {
      show_toast(t("common.failed_to_copy"), "error");
    }
  }, [commands, t]);

  useEffect(() => {
    if (!copied) return;

    const timer = window.setTimeout(() => set_copied(false), 1800);

    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className="group relative rounded-md bg-surf-secondary">
      <div className="overflow-x-auto px-3.5 py-3 pe-12">
        <pre className="font-mono text-xs leading-6 text-txt-primary">
          {commands}
        </pre>
      </div>
      <button
        aria-label={copy_label}
        className="absolute end-2 top-2 flex h-7 w-7 items-center justify-center rounded-md text-txt-muted transition-colors hover:bg-surf-hover hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
        title={copied ? t("common.copied") : t("common.copy")}
        type="button"
        onClick={copy_command}
      >
        {copied ? (
          <CheckIcon className="w-4 h-4 text-brand" />
        ) : (
          <ClipboardDocumentIcon className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}

interface BridgeUpgradeCardProps {
  on_upgrade: () => void;
}

const UPGRADE_BENEFIT_KEYS: TranslationKey[] = [
  "settings.bridge_upgrade_benefit_clients",
  "settings.bridge_upgrade_benefit_local",
  "settings.bridge_upgrade_benefit_platforms",
  "settings.bridge_upgrade_benefit_cli",
];

function BridgeUpgradeCard({ on_upgrade }: BridgeUpgradeCardProps) {
  const { t } = use_i18n();

  return (
    <div className="rounded-2xl border border-edge-secondary bg-surf-primary p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-txt-primary">
            {t("settings.desktop_bridge_upgrade_title")}
          </h3>
          <p className="mt-1 text-sm text-txt-muted">
            {t("settings.desktop_bridge_upgrade_description")}
          </p>
        </div>
        <button
          className="aster_btn aster_btn_upgrade aster_btn_md inline-flex flex-shrink-0 items-center gap-2"
          type="button"
          onClick={on_upgrade}
        >
          {t("settings.desktop_bridge_upgrade_cta")}
          <ArrowRightIcon className="w-4 h-4 rtl:-scale-x-100" />
        </button>
      </div>
      <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
        {UPGRADE_BENEFIT_KEYS.map((key) => (
          <li
            key={key}
            className="flex items-start gap-2 text-sm text-txt-secondary"
          >
            <CheckIcon className="mt-0.5 w-4 h-4 flex-shrink-0 text-brand" />
            {t(key)}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface PlatformRowProps {
  card: PlatformCard;
  is_locked: boolean;
  is_primary: boolean;
}

function PlatformRow({ card, is_locked, is_primary }: PlatformRowProps) {
  const { t } = use_i18n();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-edge-secondary py-4 last:border-b-0">
      <span className="flex w-6 flex-shrink-0 justify-center text-txt-secondary">
        {card.icon}
      </span>
      <div className="min-w-[10rem] flex-1 pe-4">
        <p className="text-sm font-medium text-txt-primary">
          {t(card.name_key)}
        </p>
        <p className="mt-0.5 text-sm text-txt-muted">{t(card.desc_key)}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1.5">
        <BridgeDownloadLink
          className={`aster_btn ${
            is_primary ? "aster_btn_depth" : "aster_btn_outline"
          } aster_btn_md inline-flex items-center justify-center gap-1.5 whitespace-nowrap`}
          is_locked={is_locked}
          platform={card.platform}
        >
          <ArrowDownTrayIcon className="w-3.5 h-3.5 flex-shrink-0" />
          {t(card.cta_key)}
        </BridgeDownloadLink>
        {card.format_groups && (
          <DownloadFormatMenu
            groups={card.format_groups}
            is_locked={is_locked}
            label={t("settings.bridge_other_formats")}
          />
        )}
      </div>
    </div>
  );
}

interface BridgeCliCardProps {
  is_locked: boolean;
}

function BridgeCliCard({ is_locked }: BridgeCliCardProps) {
  const { t } = use_i18n();
  const [active_id, set_active_id] = useState<DesktopPlatform>(
    current_desktop_platform,
  );

  const variant =
    CLI_VARIANTS.find((item) => item.id === active_id) ?? CLI_VARIANTS[0];

  return (
    <div className="border-b border-edge-secondary py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="flex w-6 flex-shrink-0 justify-center text-txt-secondary">
          {terminal_icon}
        </span>
        <div className="min-w-[10rem] flex-1 pe-4">
          <p className="text-sm font-medium text-txt-primary">
            {t("settings.bridge_cli_name")}
          </p>
          <p className="mt-0.5 text-sm text-txt-muted">
            {t("settings.bridge_cli_desc")}
          </p>
        </div>
        <BridgeDownloadLink
          className="aster_btn aster_btn_outline aster_btn_md inline-flex flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap"
          is_locked={is_locked}
          platform={variant.download_platform}
        >
          <ArrowDownTrayIcon className="w-3.5 h-3.5 flex-shrink-0" />
          {t("settings.bridge_cli_download")}
        </BridgeDownloadLink>
      </div>

      <div className="mt-3 ps-10">
        <div
          aria-label={t("settings.bridge_all_platforms")}
          className="flex items-center gap-5 border-b border-edge-secondary"
          role="tablist"
        >
          {CLI_VARIANTS.map((item) => (
            <button
              key={item.id}
              aria-selected={item.id === active_id}
              className={`-mb-px border-b-2 pb-2 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
                item.id === active_id
                  ? "border-current text-brand"
                  : "border-transparent text-txt-muted hover:text-txt-secondary"
              }`}
              role="tab"
              tabIndex={item.id === active_id ? 0 : -1}
              type="button"
              onClick={() => set_active_id(item.id)}
            >
              {t(item.name_key)}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <CommandBlock
            commands={variant.commands}
            copy_label={t("settings.bridge_cli_copy_command")}
          />
        </div>

        <p className="mt-2.5 text-xs leading-relaxed text-txt-muted">
          {t(variant.hint_key)}{" "}
          {variant.arch_link && !is_locked && (
            <>
              <a
                className="font-medium text-brand hover:underline"
                href={`${DL}/${variant.arch_link.platform}`}
                onClick={(event) =>
                  variant.arch_link &&
                  void start_bridge_download(
                    variant.arch_link.platform,
                    is_locked,
                    t,
                    event,
                  )
                }
              >
                {t(variant.arch_link.label_key)}
              </a>{" "}
            </>
          )}
          <a
            className="font-medium text-brand hover:underline"
            href={CLI_DOCS_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("settings.bridge_cli_docs_link")}
            <ArrowTopRightOnSquareIcon className="ms-1 inline w-3 h-3 align-[-1px]" />
          </a>
        </p>
      </div>
    </div>
  );
}

const help_icon = (
  <svg
    className="w-[18px] h-[18px]"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    viewBox="0 0 24 24"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" strokeLinecap="round" />
    <circle cx="12" cy="17" fill="currentColor" r=".5" />
  </svg>
);

const discord_icon = (
  <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

const reddit_icon = (
  <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
  </svg>
);

const github_icon = (
  <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

const SUPPORT_LINKS: {
  label_key: TranslationKey;
  desc_key: TranslationKey;
  href: string;
  icon: React.ReactNode;
}[] = [
  {
    label_key: "settings.bridge_support_help",
    desc_key: "settings.bridge_support_help_desc",
    href: "https://astermail.org/help",
    icon: help_icon,
  },
  {
    label_key: "settings.bridge_support_discord",
    desc_key: "settings.bridge_support_discord_desc",
    href: "https://discord.gg/EvZGep3Uqh",
    icon: discord_icon,
  },
  {
    label_key: "settings.bridge_support_reddit",
    desc_key: "settings.bridge_support_reddit_desc",
    href: "https://www.reddit.com/r/AsterPrivacy/",
    icon: reddit_icon,
  },
  {
    label_key: "settings.bridge_support_github",
    desc_key: "settings.bridge_support_github_desc",
    href: "https://github.com/Aster-Privacy",
    icon: github_icon,
  },
];

function BridgeSupportLinks() {
  const { t } = use_i18n();

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {SUPPORT_LINKS.map(({ label_key, desc_key, href, icon }) => (
        <a
          key={href}
          className="group flex items-start gap-3 rounded-xl border border-edge-secondary p-4 transition-colors hover:border-edge-primary hover:bg-surf-hover"
          href={href}
          rel="noopener noreferrer"
          target="_blank"
        >
          <span className="mt-0.5 flex-shrink-0 text-txt-secondary transition-colors group-hover:text-brand">
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-medium text-txt-primary">
              {t(label_key)}
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 flex-shrink-0 text-txt-muted" />
            </span>
            <span className="mt-0.5 block text-[13px] leading-snug text-txt-muted">
              {t(desc_key)}
            </span>
          </span>
        </a>
      ))}
    </div>
  );
}

function format_date_short(iso: string): string {
  return new Date(iso).toLocaleDateString(app_locale(), {
    timeZone: get_display_time_zone(),
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Translate = ReturnType<typeof use_i18n>["t"];

function format_last_seen(t: Translate, iso: string | null): string {
  if (!iso) return t("settings.trusted_devices_never");
  const diff_ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff_ms / 60000);

  if (mins < 5) return t("settings.bridge_active_now");
  if (mins < 60) return t("settings.minutes_ago", { count: mins });
  const hours = Math.floor(diff_ms / 3600000);

  if (hours < 24) return t("settings.hours_ago", { count: hours });
  const days = Math.floor(diff_ms / 86400000);

  if (days < 7) return t("settings.days_ago", { count: days });

  return format_date_short(iso);
}

export function BridgeSection() {
  const { t } = use_i18n();
  const {
    limits,
    is_loading: plan_loading,
    load_failed: plan_load_failed,
    refresh: refresh_plan_limits,
  } = use_plan_limits();
  const [devices, set_devices] = useState<Device[]>([]);
  const [devices_loading, set_devices_loading] = useState(true);
  const [devices_load_failed, set_devices_load_failed] = useState(false);
  const [revoking_id, set_revoking_id] = useState<string | null>(null);
  const [revoking_all, set_revoking_all] = useState(false);
  const [confirm_revoke_id, set_confirm_revoke_id] = useState<string | null>(
    null,
  );
  const [confirm_revoke_all, set_confirm_revoke_all] = useState(false);

  const primary_id = useMemo(current_desktop_platform, []);
  const ordered_cards = useMemo(
    () =>
      [...PLATFORM_CARDS].sort((a, b) => {
        if (a.id === primary_id) return -1;
        if (b.id === primary_id) return 1;

        return 0;
      }),
    [primary_id],
  );

  const load_devices = useCallback(async () => {
    set_devices_loading(true);
    try {
      const res = await list_devices();

      set_devices_load_failed(!res.data);
      set_devices(
        (res.data?.devices ?? []).filter((d) => d.device_type === "bridge"),
      );
    } finally {
      set_devices_loading(false);
    }
  }, []);

  useEffect(() => {
    load_devices();
  }, [load_devices]);

  if (plan_loading && !limits) return <SettingsSkeleton variant="list" />;
  const is_locked = !limits || limits.plan_code === "free";

  const handle_revoke = async (id: string) => {
    set_confirm_revoke_id(null);
    set_revoking_id(id);
    try {
      const result = await revoke_device(id);

      if (result.error) {
        show_toast(
          result.error || t("common.something_went_wrong_try_again"),
          "error",
        );

        return;
      }
      load_devices();
    } finally {
      set_revoking_id(null);
    }
  };

  const handle_revoke_all = async () => {
    set_confirm_revoke_all(false);
    set_revoking_all(true);
    try {
      const results = await Promise.all(
        devices.map((d) => revoke_device(d.id)),
      );

      const failure = results.find((result) => result.error);

      if (failure) {
        show_toast(
          failure.error || t("common.something_went_wrong_try_again"),
          "error",
        );
      }
      load_devices();
    } finally {
      set_revoking_all(false);
    }
  };

  const confirm_device = devices.find((d) => d.id === confirm_revoke_id);

  return (
    <div className="space-y-6">
      {plan_load_failed && !limits && (
        <LoadFailedNotice on_retry={() => void refresh_plan_limits(true)} />
      )}
      {is_locked && (
        <BridgeUpgradeCard
          on_upgrade={() =>
            window.dispatchEvent(
              new CustomEvent("navigate-settings", { detail: "billing" }),
            )
          }
        />
      )}

      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
            <ArrowDownTrayIcon className="w-[18px] h-[18px] flex-shrink-0 text-txt-primary" />
            {t("settings.bridge_app_name")}
          </h3>
          <InfoPopover
            description={t("settings.bridge_popover_description")}
            learn_more_label={t("settings.bridge_info_link")}
            learn_more_url="https://astermail.org/bridge"
            title={t("settings.bridge_app_name")}
          />
        </div>
        <p className="text-sm text-txt-muted">
          {t("settings.desktop_bridge_description")}
        </p>

        <div className="mt-2">
          {ordered_cards.map((card) => (
            <PlatformRow
              key={card.id}
              card={card}
              is_locked={is_locked}
              is_primary={card.id === primary_id}
            />
          ))}
          <BridgeCliCard is_locked={is_locked} />
        </div>
      </div>

      <div>
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
              <LinkSlashIcon className="w-[18px] h-[18px] flex-shrink-0 text-txt-primary" />
              {t("settings.bridge_installations")}
            </h3>
            {devices.length > 1 && (
              <Button
                disabled={revoking_all || revoking_id !== null}
                variant="destructive"
                onClick={() => set_confirm_revoke_all(true)}
              >
                {t("settings.trusted_devices_revoke_all")}
                {revoking_all && <ButtonSpinner />}
              </Button>
            )}
          </div>
          <p className="mt-2 text-sm text-txt-muted">
            {t("settings.bridge_installations_description")}
          </p>
        </div>

        {devices_loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <div>
                    <Skeleton className="h-4 w-40 mb-1.5" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
                <Skeleton className="h-8 w-20 rounded-lg" />
              </div>
            ))}
          </div>
        ) : devices_load_failed ? (
          <div className="py-6">
            <LoadFailedNotice on_retry={load_devices} />
          </div>
        ) : devices.length === 0 ? (
          <div className="rounded-2xl border border-edge-secondary px-6 py-8 text-center">
            <ComputerDesktopIcon className="mx-auto mb-2 w-8 h-8 text-txt-muted" />
            <p className="text-sm text-txt-muted">
              {t("settings.bridge_installations_empty")}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center justify-between border-b border-edge-secondary py-3 last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ComputerDesktopIcon className="w-5 h-5 flex-shrink-0 text-txt-muted" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-txt-primary">
                      {device.name}
                    </p>
                    <p className="mt-0.5 text-xs text-txt-muted">
                      {t("settings.trusted_devices_created")}{" "}
                      {format_date_short(device.created_at)}
                      {" · "}
                      {t("settings.trusted_devices_last_seen")}{" "}
                      {format_last_seen(t, device.last_seen_at)}
                    </p>
                  </div>
                </div>
                <Button
                  className="ms-3 flex-shrink-0"
                  disabled={revoking_id === device.id || revoking_all}
                  variant="destructive"
                  onClick={() => set_confirm_revoke_id(device.id)}
                >
                  {t("settings.trusted_devices_revoke")}
                  {revoking_id === device.id && <ButtonSpinner />}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("settings.trusted_devices_revoke")}
        is_open={confirm_revoke_id !== null}
        message={t("settings.bridge_revoke_message").replace(
          "{{ name }}",
          confirm_device?.name ?? "",
        )}
        on_cancel={() => set_confirm_revoke_id(null)}
        on_confirm={() => confirm_revoke_id && handle_revoke(confirm_revoke_id)}
        title={t("settings.bridge_revoke_title")}
        variant="danger"
      />

      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("settings.trusted_devices_revoke_all")}
        is_open={confirm_revoke_all}
        message={t("settings.bridge_revoke_all_message")}
        on_cancel={() => set_confirm_revoke_all(false)}
        on_confirm={handle_revoke_all}
        title={t("settings.bridge_revoke_title")}
        variant="danger"
      />

      {!is_locked && <SmtpTokensSection />}

      <div>
        <div className="mb-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
            <QuestionMarkCircleIcon className="w-[18px] h-[18px] flex-shrink-0 text-txt-primary" />
            {t("settings.bridge_support_title")}
          </h3>
          <p className="mt-1 text-sm text-txt-muted">
            {t("settings.bridge_support_description")}
          </p>
        </div>
        <BridgeSupportLinks />
      </div>
    </div>
  );
}
