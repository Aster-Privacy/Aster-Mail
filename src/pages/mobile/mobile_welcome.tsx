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
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";

import { use_platform } from "@/hooks/use_platform";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import {
  stagger_container,
  fade_up_item,
  button_tap,
  DEPTH_CTA_CLASS,
  DEPTH_CTA_STYLE,
  DEPTH_SECONDARY_CLASS,
} from "@/components/auth/mobile_auth_motion";

export default function MobileWelcomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { safe_area_insets } = use_platform();
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const preloaded = useRef(false);

  useEffect(() => {
    if (!preloaded.current) {
      preloaded.current = true;
      import("@/pages/mobile/mobile_sign_in").catch(() => {});
      import("@/pages/mobile/mobile_register").catch(() => {});
    }
  }, []);

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
      <div className="flex flex-1 flex-col items-center justify-center px-8">
        <motion.div
          animate="animate"
          className="flex flex-col items-center"
          initial={reduce_motion ? false : "initial"}
          variants={reduce_motion ? undefined : stagger_container}
        >
          <motion.div
            className="flex items-center justify-center"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            <img
              alt="Aster Mail"
              className="h-12"
              decoding="async"
              src="/text_logo.png"
            />
          </motion.div>

          <motion.h1
            className="mt-10 text-center text-[32px] font-semibold leading-tight text-[var(--text-primary)]"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            {t("common.welcome_to_aster")}
          </motion.h1>

          <motion.p
            className="mt-3 max-w-[280px] text-center text-base leading-relaxed text-[var(--text-tertiary)]"
            variants={reduce_motion ? undefined : fade_up_item}
          >
            {t("auth.welcome_subtitle")}
          </motion.p>
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
        <div className="space-y-3">
          <motion.button
            className={DEPTH_CTA_CLASS}
            style={DEPTH_CTA_STYLE}
            whileTap={button_tap}
            onClick={() => navigate("/sign-in" + location.search)}
          >
            {t("auth.log_in")}
          </motion.button>

          <motion.button
            className={DEPTH_SECONDARY_CLASS}
            whileTap={button_tap}
            onClick={() => navigate("/register" + location.search)}
          >
            {t("auth.create_account")}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
