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

import { motion } from "framer-motion";

import { use_should_reduce_motion } from "@/provider";
import {
  page_variants,
  page_transition,
} from "@/components/register/register_types";

interface RegisterStepKeysProps {
  reg: UseRegistrationReturn;
}

export const RegisterStepKeys = ({ reg }: RegisterStepKeysProps) => {
  const reduce_motion = use_should_reduce_motion();

  const steps = [
    reg.t("auth.generating_encryption_keys"),
    reg.t("auth.creating_identity_keypair"),
    reg.t("auth.creating_signed_prekey"),
    reg.t("auth.generating_recovery_codes"),
    reg.t("auth.encrypting_key_vault"),
    reg.t("auth.creating_recovery_backup"),
    reg.t("auth.preparing_pgp_key"),
    reg.t("auth.creating_your_account"),
  ];
  const current_step_index = steps.findIndex(
    (s) => s === reg.generation_status,
  );
  const progress =
    current_step_index >= 0
      ? ((current_step_index + 1) / steps.length) * 100
      : 10;

  return (
    <motion.div
      key="generating"
      animate="animate"
      className="flex flex-col items-center w-full max-w-sm px-4 text-center"
      exit="exit"
      initial="initial"
      transition={page_transition}
      variants={page_variants}
    >
      <div className="h-10 w-10 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin" />

      <h2 className="text-xl font-semibold mt-8 text-txt-primary">
        {reg.t("auth.setting_up_account")}
      </h2>

      <p className="mt-3 text-sm text-txt-tertiary">{reg.generation_status}</p>

      <div className="w-full mt-8">
        <div
          className="h-1 w-full rounded-full overflow-hidden"
          style={{
            backgroundColor: reg.is_dark
              ? "rgba(255, 255, 255, 0.1)"
              : "rgba(0, 0, 0, 0.08)",
          }}
        >
          <motion.div
            animate={{ width: `${progress}%` }}
            className="h-full rounded-full"
            initial={reduce_motion ? false : { width: "0%" }}
            style={{
              backgroundColor: reg.is_dark ? "#60a5fa" : "#3b82f6",
            }}
            transition={{
              duration: reduce_motion ? 0 : 0.3,
              ease: "easeOut",
            }}
          />
        </div>
      </div>

      <p className="mt-8 text-xs max-w-xs leading-relaxed text-txt-muted">
        {reg.t("auth.encryption_keys_local")}
      </p>
    </motion.div>
  );
};
