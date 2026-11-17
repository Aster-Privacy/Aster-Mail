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
  StepShell,
} from "@/components/register/register_shared";

interface RegisterStepInstallLimitProps {
  reg: UseRegistrationReturn;
}

export const RegisterStepInstallLimit = ({
  reg,
}: RegisterStepInstallLimitProps) => (
  <StepShell
    step_key="install_limit"
    subtitle={reg.t("auth.install_limit_body")}
    title={reg.t("auth.install_limit_title")}
  >
    <div className="flex w-full flex-col gap-3">
      <OnboardingButton
        variant="primary"
        onClick={reg.handle_install_limit_sign_in}
      >
        {reg.t("auth.install_limit_sign_in")}
      </OnboardingButton>
      <OnboardingButton
        variant="secondary"
        onClick={reg.handle_install_limit_upgrade}
      >
        {reg.t("auth.install_limit_upgrade")}
      </OnboardingButton>
    </div>
  </StepShell>
);
