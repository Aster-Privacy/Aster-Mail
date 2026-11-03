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
import { Tooltip } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import mail_icon from "@/assets/app_icons/mail.png?inline";
import { DatedCalendarImage } from "@/components/icons/dated_calendar_image";

const MAIL_SIGN_IN_URL = "https://app.astermail.org/sign-in";
const CALENDAR_SIGN_IN_URL = "https://calendar.astermail.org/sign-in";

interface SignInAppEntry {
  id: "mail" | "calendar";
  label: string;
  icon: string | null;
  href: string;
}

export function SignInAppsRow() {
  const { t } = use_i18n();
  const current: SignInAppEntry["id"] = "mail";

  const apps: SignInAppEntry[] = [
    {
      id: "mail",
      label: t("common.app_name_mail"),
      icon: mail_icon,
      href: MAIL_SIGN_IN_URL,
    },
    {
      id: "calendar",
      label: t("common.app_name_calendar"),
      icon: null,
      href: CALENDAR_SIGN_IN_URL,
    },
  ];

  const tile_class =
    "flex h-10 w-10 items-center justify-center rounded-[10px] transition-[background-color] duration-150 ease-out";

  return (
    <nav
      aria-label={t("common.aster_apps")}
      className="mt-7 flex w-full justify-center"
    >
      <ul className="flex items-center gap-1">
        {apps.map((app) => {
          const icon = app.icon ? (
            <img
              alt=""
              className="h-6 w-6 select-none object-contain"
              draggable={false}
              height={24}
              src={app.icon}
              width={24}
            />
          ) : (
            <DatedCalendarImage className="h-6 w-6" kind="app" />
          );

          return (
            <li key={app.id}>
              <Tooltip
                tip={
                  app.id === current
                    ? t("common.app_current_tip", { app: app.label })
                    : app.label
                }
              >
                {app.id === current ? (
                  <span
                    aria-current="page"
                    aria-label={app.label}
                    className={tile_class}
                    role="img"
                  >
                    {icon}
                  </span>
                ) : (
                  <a
                    aria-label={app.label}
                    className={`${tile_class} hover:bg-[var(--aster-hover)] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-[color:var(--accent-color)]`}
                    href={app.href}
                    rel="noopener"
                  >
                    {icon}
                  </a>
                )}
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
