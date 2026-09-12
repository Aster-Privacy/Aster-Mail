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
import type { UseRegistrationReturn } from "@/components/register/hooks/use_registration";

import { Button } from "@aster/ui";

import { SkipLink, StepShell } from "@/components/register/register_shared";

interface RegisterStepDownloadAppsProps {
  reg: UseRegistrationReturn;
}

const MOBILE_DOWNLOAD_URL = "https://astermail.org/download#mobile";
const DESKTOP_DOWNLOAD_URL = "https://astermail.org/download";

const PhoneIcon = () => (
  <svg
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    viewBox="0 0 24 24"
  >
    <path
      d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const MonitorIcon = () => (
  <svg
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    viewBox="0 0 24 24"
  >
    <path
      d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface AppCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  button_label: string;
  on_download: () => void;
}

const AppCard = ({
  icon,
  title,
  description,
  button_label,
  on_download,
}: AppCardProps) => (
  <div className="flex flex-1 flex-col items-center rounded-xl border px-4 py-5 text-center border-edge-secondary bg-surf-tertiary">
    <span className="text-txt-primary">{icon}</span>
    <span className="mt-3 text-sm font-semibold text-txt-primary">{title}</span>
    <span className="mt-1 flex-1 text-xs leading-relaxed text-txt-tertiary">
      {description}
    </span>
    <Button
      className="mt-4 w-full"
      size="md"
      variant="secondary"
      onClick={on_download}
    >
      {button_label}
    </Button>
  </div>
);

export const RegisterStepDownloadApps = ({
  reg,
}: RegisterStepDownloadAppsProps) => {
  return (
    <StepShell
      wide
      step_key="download_apps"
      subtitle={reg.t("auth.download_apps_desc")}
      title={reg.t("auth.download_apps_title")}
    >
      <div className="flex w-full flex-col gap-3 sm:flex-row">
        <AppCard
          button_label={reg.t("common.download")}
          description={reg.t("auth.mail_mobile_desc")}
          icon={<PhoneIcon />}
          on_download={() => reg.handle_open_download(MOBILE_DOWNLOAD_URL)}
          title={reg.t("auth.mail_mobile")}
        />
        <AppCard
          button_label={reg.t("common.download")}
          description={reg.t("auth.mail_desktop_desc")}
          icon={<MonitorIcon />}
          on_download={() => reg.handle_open_download(DESKTOP_DOWNLOAD_URL)}
          title={reg.t("auth.mail_desktop")}
        />
      </div>

      <SkipLink
        label={
          reg.has_opened_download
            ? reg.t("common.continue")
            : reg.t("auth.skip_for_now")
        }
        on_click={reg.handle_download_apps_continue}
      />
    </StepShell>
  );
};
