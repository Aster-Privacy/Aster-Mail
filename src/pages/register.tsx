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
import { AnimatePresence } from "framer-motion";

import { ErrorBoundary } from "@/components/ui/error_boundary";
import { use_registration } from "@/components/register/hooks/use_registration";
import { RegisterStepWelcome } from "@/components/register/register_step_welcome";
import { RegisterStepAccount } from "@/components/register/register_step_account";
import { RegisterStepPassword } from "@/components/register/register_step_password";
import { RegisterStepKeys } from "@/components/register/register_step_keys";
import {
  RegisterStepRecoveryCodes,
  RegisterStepRecoveryEmail,
  RegisterStepRecoveryEmailVerification,
} from "@/components/register/register_step_recovery";
import { RegisterStepPlanSelection } from "@/components/register/register_step_plan_selection";

export default function RegisterPage() {
  const reg = use_registration();

  if (reg.auth_loading || reg.has_existing_session) {
    return null;
  }

  const render_step_content = () => {
    switch (reg.step) {
      case "welcome":
        return <RegisterStepWelcome reg={reg} />;
      case "email":
        return <RegisterStepAccount reg={reg} />;
      case "password":
        return <RegisterStepPassword reg={reg} />;
      case "generating":
        return <RegisterStepKeys reg={reg} />;
      case "recovery_key":
        return <RegisterStepRecoveryCodes reg={reg} />;
      case "recovery_email":
        return <RegisterStepRecoveryEmail reg={reg} />;
      case "recovery_email_verification":
        return <RegisterStepRecoveryEmailVerification reg={reg} />;
      case "plan_selection":
        return <RegisterStepPlanSelection reg={reg} />;
      default:
        return <RegisterStepKeys reg={reg} />;
    }
  };

  return (
    <div className="fixed inset-0 overflow-y-auto transition-colors duration-200 bg-surf-primary">
      <div className="min-h-full flex items-start md:items-center justify-center py-8 md:py-4 px-4">
        <ErrorBoundary>
          <AnimatePresence mode="wait">{render_step_content()}</AnimatePresence>
        </ErrorBoundary>
      </div>
    </div>
  );
}
