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
import { useState, type MouseEvent } from "react";
import { Tooltip } from "@aster/ui";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { use_i18n } from "@/lib/i18n/context";
import mail_icon from "@/assets/app_icons/mail.png?inline";
import { DatedCalendarImage } from "@/components/icons/dated_calendar_image";
import { CALENDAR_WEB_ORIGIN } from "@/lib/session_handoff/session_handoff_protocol";
import { open_external } from "@/utils/open_link";
import { has_tauri_runtime } from "@/lib/tauri_runtime";
import { sibling_app_launch_url } from "@/contexts/auth/sibling_session_handoff";

function is_desktop_shell(): boolean {
  return has_tauri_runtime();
}

function launch_sibling_app(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
) {
  const launch_url = sibling_app_launch_url(href);

  if (launch_url === href) return;
  event.preventDefault();
  window.open(launch_url, "_blank", "noopener,noreferrer");
}

function AppTilesIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth={1.6}
      viewBox="0 0 20 20"
    >
      <rect height={6} rx={1.75} width={6} x={3} y={3} />
      <rect height={6} rx={3} width={6} x={11} y={3} />
      <rect height={6} rx={3} width={6} x={3} y={11} />
      <rect height={6} rx={1.75} width={6} x={11} y={11} />
    </svg>
  );
}

interface AppEntry {
  id: string;
  label: string;
  description: string;
  icon: string | null;
  href: string | null;
}

function ExternalIcon() {
  return (
    <svg
      aria-hidden="true"
      className="app_switcher_external h-3.5 w-3.5 flex-shrink-0 text-[var(--icon-secondary)]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      viewBox="0 0 16 16"
    >
      <path d="M5.5 10.5 10.5 5.5M6 5.5h4.5V10" />
    </svg>
  );
}

export function AppSwitcher() {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);

  const apps: AppEntry[] = [
    {
      id: "mail",
      label: t("common.app_name_mail"),
      description: t("common.app_description_mail"),
      icon: mail_icon,
      href: null,
    },
    {
      id: "calendar",
      label: t("common.app_name_calendar"),
      description: t("common.app_description_calendar"),
      icon: null,
      href: CALENDAR_WEB_ORIGIN,
    },
  ];

  const desktop_shell = is_desktop_shell();
  const row_class =
    "app_switcher_row group flex cursor-pointer items-center gap-3 rounded-[10px] px-2 py-2 outline-none data-[highlighted]:bg-[var(--aster-hover)] focus-visible:bg-[var(--aster-hover)]";

  const render_row = (app: AppEntry) => (
    <>
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center">
        {app.icon ? (
          <img
            alt=""
            className="h-9 w-9 select-none object-contain"
            draggable={false}
            height={36}
            src={app.icon}
            width={36}
          />
        ) : (
          <DatedCalendarImage className="h-9 w-9" kind="app" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-medium leading-5 text-txt-primary">
          {app.label}
        </span>
        <span className="truncate text-[12px] leading-4 text-txt-secondary">
          {app.description}
        </span>
      </span>
      {app.href ? (
        <ExternalIcon />
      ) : (
        <span className="flex-shrink-0 text-[12px] leading-4 text-txt-muted">
          {t("common.app_you_are_here")}
        </span>
      )}
    </>
  );

  return (
    <div className="relative">
      <DropdownMenu modal={false} open={is_open} onOpenChange={set_is_open}>
        <Tooltip tip={t("common.aster_apps")}>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={t("common.aster_apps")}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] aria-expanded:bg-[var(--bg-hover)]"
              data-app-switcher=""
              type="button"
            >
              <AppTilesIcon />
            </button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent
          align="end"
          aria-label={t("common.aster_apps")}
          className="app_switcher_panel w-[304px] p-1.5"
          collisionPadding={8}
        >
          <div
            aria-hidden="true"
            className="px-2 pb-1.5 pt-1 text-[12px] font-medium leading-4 text-txt-muted"
          >
            {t("common.aster_apps")}
          </div>
          <div className="flex flex-col gap-0.5">
            {apps.map((app) => {
              const href = app.href;

              if (href && desktop_shell) {
                return (
                  <DropdownMenuItem
                    key={app.id}
                    className={row_class}
                    data-app-switcher-item={app.id}
                    onSelect={() => {
                      open_external(sibling_app_launch_url(href));
                    }}
                  >
                    {render_row(app)}
                  </DropdownMenuItem>
                );
              }

              return href ? (
                <DropdownMenuItem
                  key={app.id}
                  asChild
                  className={row_class}
                  data-app-switcher-item={app.id}
                >
                  <a
                    href={href}
                    rel="noopener noreferrer"
                    target="_blank"
                    onClick={(event) => launch_sibling_app(event, href)}
                  >
                    {render_row(app)}
                  </a>
                </DropdownMenuItem>
              ) : (
                <div
                  key={app.id}
                  aria-current="page"
                  className="flex cursor-default items-center gap-3 rounded-[10px] px-2 py-2"
                  data-app-switcher-item={app.id}
                >
                  {render_row(app)}
                </div>
              );
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
