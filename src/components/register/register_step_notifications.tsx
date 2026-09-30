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

import {
  OnboardingButton,
  SkipLink,
  StepShell,
} from "@/components/register/register_shared";

interface RegisterStepNotificationsProps {
  reg: UseRegistrationReturn;
}

export const RegisterStepNotifications = ({
  reg,
}: RegisterStepNotificationsProps) => {
  return (
    <StepShell
      step_key="notifications"
      subtitle={reg.t("auth.notifications_step_desc")}
      title={reg.t("auth.notifications_step_title")}
    >
      <div
        aria-hidden="true"
        className="w-full select-none overflow-hidden rounded-xl border border-edge-secondary bg-surf-tertiary"
      >
        <div className="flex items-center gap-1.5 border-b border-edge-secondary px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex justify-end px-3 pb-6 pt-3">
          <div className="flex w-full max-w-[280px] items-start gap-3 rounded-lg px-3 py-2.5 text-start shadow-md bg-[#1f1f1f] text-white">
            <img
              alt=""
              className="mt-0.5 h-6 w-6 rounded-md"
              draggable={false}
              src="/mail_logo.png"
            />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold">
                {reg.t("auth.notification_preview_title")}
              </div>
              <div className="line-clamp-2 text-xs leading-snug opacity-80">
                {reg.t("auth.notification_preview_body")}
              </div>
            </div>
          </div>
        </div>
      </div>

      <OnboardingButton
        className="mt-4 w-full"
        variant="primary"
        is_loading={reg.notifications_busy}
        onClick={() => void reg.handle_notifications_turn_on()}
      >
        {reg.t("auth.turn_on")}
      </OnboardingButton>

      <SkipLink
        label={reg.t("auth.skip_for_now")}
        on_click={reg.handle_notifications_skip}
      />
    </StepShell>
  );
};
