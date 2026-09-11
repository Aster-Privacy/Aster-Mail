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

import { useCallback, useState } from "react";
import { motion } from "framer-motion";

import { Logo } from "@/components/auth/auth_styles";
import { AppStorePlans } from "@/components/app_store/app_store_plans";
import {
  page_transition,
  page_variants,
} from "@/components/register/register_types";
import { clear_first_run_plan } from "@/lib/first_run";

export function AppStoreRegisterStep({ reg }: { reg: UseRegistrationReturn }) {
  const { t } = reg;
  const [is_finalizing, set_is_finalizing] = useState(false);

  const finalize = useCallback(async () => {
    if (is_finalizing) return;
    set_is_finalizing(true);
    try {
      await reg.finalize_registration();
    } catch {
      set_is_finalizing(false);
    }
  }, [is_finalizing, reg]);

  const handle_redeemed = useCallback(() => {
    clear_first_run_plan();
    void finalize();
  }, [finalize]);

  return (
    <motion.div
      key="plan_selection"
      animate="animate"
      className="flex flex-col items-center w-full max-w-md md:max-w-5xl px-4 pt-6 pb-10 md:pt-10"
      exit="exit"
      initial="initial"
      transition={page_transition}
      variants={page_variants}
    >
      <Logo />

      <h1 className="text-xl font-semibold mt-6 text-txt-primary">
        {t("auth.plan_selection_title")}
      </h1>
      <p className="text-sm mt-2 leading-relaxed text-txt-tertiary text-center max-w-md">
        {t("app_store.register_subtitle")}
      </p>

      <div className="mt-6 w-full">
        <AppStorePlans current_plan_code={null} on_redeemed={handle_redeemed} />
      </div>

      <div className="w-full flex flex-col items-center mt-5 mb-4 gap-3">
        <button
          className="text-sm font-medium hover:underline disabled:opacity-60"
          disabled={is_finalizing}
          style={{ color: "var(--accent-blue)" }}
          type="button"
          onClick={() => void finalize()}
        >
          {t("auth.plan_continue_as_free")}
        </button>
      </div>
    </motion.div>
  );
}
