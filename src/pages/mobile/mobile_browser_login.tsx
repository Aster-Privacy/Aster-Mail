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
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronLeftIcon } from "@heroicons/react/20/solid";

import { use_platform } from "@/hooks/use_platform";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import {
  stagger_container,
  fade_up_item,
  button_tap,
  BACK_BUTTON_CLASS,
  BACK_BUTTON_STYLE,
  DEPTH_SECONDARY_CLASS,
} from "@/components/auth/mobile_auth_motion";

function generate_pairing_code(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const array = new Uint8Array(8);

  crypto.getRandomValues(array);
  for (let i = 0; i < 8; i++) {
    code += chars[array[i] % chars.length];
  }

  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export default function MobileBrowserLoginPage() {
  const navigate = useNavigate();
  const { safe_area_insets } = use_platform();
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();

  const [pairing_code, set_pairing_code] = useState(() =>
    generate_pairing_code(),
  );
  const [countdown, set_countdown] = useState(300);

  const refresh_code = useCallback(() => {
    set_pairing_code(generate_pairing_code());
    set_countdown(300);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      set_countdown((prev) => {
        if (prev <= 1) {
          refresh_code();

          return 300;
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [refresh_code]);

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex h-[100dvh] flex-col bg-[var(--bg-primary)]"
      initial={reduce_motion ? false : { opacity: 0 }}
      style={{
        paddingTop: safe_area_insets.top,
        paddingBottom: safe_area_insets.bottom,
      }}
      transition={{ duration: reduce_motion ? 0 : 0.3 }}
    >
      <div className="flex items-center px-6 pt-4">
        <motion.button
          className={BACK_BUTTON_CLASS}
          style={BACK_BUTTON_STYLE}
          whileTap={button_tap}
          onClick={() => navigate("/welcome")}
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </motion.button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-8">
        <motion.div
          animate="animate"
          className="flex w-full flex-col items-center"
          initial={reduce_motion ? false : "initial"}
          variants={reduce_motion ? undefined : stagger_container}
        >
          <motion.div
            className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg, #4a7aff 0%, #6b8aff 100%)",
              boxShadow: "0 8px 32px rgba(74,122,255,0.25)",
            }}
            variants={reduce_motion ? undefined : fade_up_item}
          >
            <svg
              className="h-8 w-8 text-white"
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
          </motion.div>

          <motion.h1
            className="mt-6 text-center text-2xl font-semibold text-[var(--text-primary)]"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            {t("auth.browser_login_title")}
          </motion.h1>

          <motion.p
            className="mt-2 max-w-[280px] text-center text-sm leading-relaxed text-[var(--text-tertiary)]"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            {t("auth.browser_login_desc")}
          </motion.p>

          <motion.div
            className="mt-8 w-full max-w-[280px] rounded-2xl border border-[var(--border-secondary)] bg-[var(--bg-secondary)] p-6"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            <p className="text-center font-mono text-3xl font-bold tracking-[0.2em] text-[var(--text-primary)]">
              {pairing_code}
            </p>
            <div className="mt-3 flex items-center justify-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-[#4a7aff]" />
              <p className="text-xs text-[var(--text-muted)]">
                {t("auth.browser_login_expires_in")}
                {minutes}:{seconds.toString().padStart(2, "0")}
              </p>
            </div>
          </motion.div>

          <motion.button
            className="mt-4 text-sm font-medium text-[#4a7aff]"
            variants={reduce_motion ? undefined : fade_up_item}
            whileTap={{ opacity: 0.7 }}
            onClick={refresh_code}
          >
            {t("auth.browser_login_generate_new")}
          </motion.button>
        </motion.div>
      </div>

      <motion.div
        animate={{ opacity: 1 }}
        className="shrink-0 px-6 pb-6 pt-4"
        initial={reduce_motion ? false : { opacity: 0 }}
        transition={
          reduce_motion ? { duration: 0 } : { duration: 0.3, delay: 0.15 }
        }
      >
        <motion.button
          className={DEPTH_SECONDARY_CLASS}
          whileTap={button_tap}
          onClick={() => navigate("/sign-in")}
        >
          {t("auth.browser_login_sign_in_password")}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
