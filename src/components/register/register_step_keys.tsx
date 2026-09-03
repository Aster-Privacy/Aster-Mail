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
import type { CSSProperties } from "react";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { Spinner } from "@/components/ui/spinner";
import { use_should_reduce_motion } from "@/provider";
import {
  page_variants,
  page_transition,
} from "@/components/register/register_types";

interface RegisterStepKeysProps {
  reg: UseRegistrationReturn;
}

const ADVANCE_MS = 1100;
const STALL_NOTICE_MS = 25000;
const START_SCALE = 0.08;

const sweep_style = `
  @keyframes key_setup_advance {
    from {
      transform: scaleX(var(--advance-from));
    }
    to {
      transform: scaleX(var(--advance-to));
    }
  }
  @keyframes key_setup_sweep {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(400%);
    }
  }
  .key_setup_sweep {
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.55),
      transparent
    );
    animation: key_setup_sweep 1.2s ease-in-out infinite;
  }
`;

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
  const is_final_step = current_step_index === steps.length - 1;
  const progress =
    current_step_index >= 0
      ? ((current_step_index + 1) / (steps.length + 1)) * 100
      : 8;
  const target_scale = progress / 100;
  const [advance, set_advance] = useState({
    from: START_SCALE,
    to: target_scale,
  });

  const [stalled, set_stalled] = useState(false);

  useEffect(() => {
    set_advance((previous) =>
      previous.to === target_scale
        ? previous
        : { from: previous.to, to: target_scale },
    );
  }, [target_scale]);

  useEffect(() => {
    set_stalled(false);

    const timer = window.setTimeout(
      () => set_stalled(true),
      STALL_NOTICE_MS,
    );

    return () => window.clearTimeout(timer);
  }, [reg.generation_status]);

  return (
    <motion.div
      key="generating"
      animate="animate"
      className="flex flex-col items-center w-full max-w-sm px-4 text-center"
      exit="exit"
      initial={false}
      transition={page_transition}
      variants={page_variants}
    >
      <style>{sweep_style}</style>

      <Spinner className="h-10 w-10 text-[var(--accent-color)]" size="lg" />

      <h2 className="text-xl font-semibold mt-8 text-txt-primary">
        {reg.t("auth.setting_up_account")}
      </h2>

      <p className="mt-3 text-sm text-txt-tertiary">{reg.generation_status}</p>

      <div className="w-full mt-8">
        <div
          className="relative h-1 w-full overflow-hidden rounded-full"
          style={{
            backgroundColor: reg.is_dark
              ? "rgba(255, 255, 255, 0.1)"
              : "rgba(0, 0, 0, 0.08)",
          }}
        >
          <div
            key={reduce_motion ? "static" : `${advance.from}-${advance.to}`}
            className="h-full w-full origin-left rounded-full"
            style={
              {
                backgroundColor: reg.is_dark
                  ? "var(--accent-color-hover)"
                  : "var(--accent-color)",
                transform: `scaleX(${advance.to})`,
                "--advance-from": advance.from,
                "--advance-to": advance.to,
                animation: reduce_motion
                  ? "none"
                  : `key_setup_advance ${ADVANCE_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards`,
              } as CSSProperties
            }
          />

          {is_final_step && !reduce_motion && (
            <div
              className="pointer-events-none absolute inset-y-0 start-0 overflow-hidden"
              style={{ width: `${progress}%` }}
            >
              <div className="key_setup_sweep absolute inset-y-0 w-1/3" />
            </div>
          )}
        </div>
      </div>

      {stalled && (
        <p className="mt-6 text-xs max-w-xs leading-relaxed text-txt-tertiary">
          {reg.t("auth.setup_taking_longer")}
        </p>
      )}

      <p className="mt-8 text-xs max-w-xs leading-relaxed text-txt-muted">
        {reg.t("auth.encryption_keys_local")}
      </p>
    </motion.div>
  );
};
