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

const DOT_POSITIONS = [5, 12, 19];

function is_desktop_shell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function AppGridIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      {DOT_POSITIONS.flatMap((y) =>
        DOT_POSITIONS.map((x) => (
          <circle key={`${x}_${y}`} cx={x} cy={y} r={2} />
        )),
      )}
    </svg>
  );
}

interface AppSwitcherProps {
  on_open_current: () => void;
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
      className="h-3.5 w-3.5 flex-shrink-0 text-[var(--icon-secondary)]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      viewBox="0 0 16 16"
    >
      <path d="M6 3.5H3.5v9h9V10M9 3.5h3.5V7M12.5 3.5 7 9" />
    </svg>
  );
}

export function AppSwitcher({ on_open_current }: AppSwitcherProps) {
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
    "flex cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-2 outline-none transition-colors duration-100 data-[highlighted]:bg-[var(--aster-hover)] focus-visible:bg-[var(--aster-hover)]";

  const render_row = (app: AppEntry) => (
    <>
      <span className="h-9 w-9 flex-shrink-0">
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
        <span className="truncate text-[12.5px] leading-[18px] text-txt-secondary">
          {app.description}
        </span>
      </span>
      {app.href && <ExternalIcon />}
    </>
  );

  return (
    <div className="relative">
      <DropdownMenu modal={false} open={is_open} onOpenChange={set_is_open}>
        <Tooltip tip={t("common.aster_apps")}>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={t("common.aster_apps")}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[var(--icon-secondary)] hover:bg-[var(--aster-hover)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] data-[state=open]:bg-[var(--aster-hover)] data-[state=open]:text-[var(--text-primary)]"
              data-app-switcher=""
              type="button"
            >
              <AppGridIcon />
            </button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent
          align="start"
          aria-label={t("common.aster_apps")}
          className="w-[288px] p-1.5"
          collisionPadding={8}
          sideOffset={8}
        >
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
                      open_external(href);
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
                  <a href={href} rel="noopener noreferrer" target="_blank">
                    {render_row(app)}
                  </a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  key={app.id}
                  aria-current="page"
                  className={row_class}
                  data-app-switcher-item={app.id}
                  onSelect={on_open_current}
                >
                  {render_row(app)}
                </DropdownMenuItem>
              );
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
