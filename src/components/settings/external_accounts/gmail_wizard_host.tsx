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
import { useEffect, useRef } from "react";

import { use_plan_limits } from "@/hooks/use_plan_limits";
import { show_plan_limit_upgrade } from "@/stores/upgrade_store";
import { use_external_accounts } from "@/components/settings/hooks/use_external_accounts";
import { GmailSetupWizard } from "@/components/settings/external_accounts/gmail_setup_wizard";

interface GmailWizardHostProps {
  on_close: () => void;
}

export function GmailWizardHost({ on_close }: GmailWizardHostProps) {
  const state = use_external_accounts();
  const { limits } = use_plan_limits();
  const { open_add_form } = state;
  const has_opened = useRef(false);
  const was_visible = useRef(false);

  const account_limit = limits?.limits["max_multi_accounts"]?.limit ?? -1;
  const external_accounts_enabled =
    (limits?.limits["has_external_accounts"]?.limit ?? 1) >= 1;
  const at_account_limit =
    !external_accounts_enabled ||
    (account_limit >= 0 && state.accounts.length >= account_limit);

  useEffect(() => {
    if (has_opened.current) return;
    if (state.is_loading || !limits) return;

    has_opened.current = true;

    if (at_account_limit) {
      show_plan_limit_upgrade({ resource: "external accounts" });
      on_close();

      return;
    }

    open_add_form();
  }, [state.is_loading, limits, at_account_limit, open_add_form, on_close]);

  useEffect(() => {
    if (state.show_add_form) {
      was_visible.current = true;

      return;
    }

    if (was_visible.current) on_close();
  }, [state.show_add_form, on_close]);

  if (!state.show_add_form) return null;

  return (
    <GmailSetupWizard
      close_form={state.close_form}
      form_email={state.form_email}
      form_password={state.form_password}
      handle_email_change={state.handle_email_change}
      handle_password_change={state.handle_password_change}
      handle_submit={state.handle_submit}
      handle_test_connection={state.handle_test_connection}
      is_form_busy={state.is_form_busy}
      is_submitting={state.is_submitting}
      is_testing={state.is_testing}
      t={state.t}
      test_result={state.test_result}
    />
  );
}
