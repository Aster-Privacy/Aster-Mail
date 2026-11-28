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
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MapPinIcon } from "@heroicons/react/24/outline";

import { FoundUsModal } from "./found_us_modal";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import {
  finish_found_us,
  get_found_us_status,
  snooze_found_us,
} from "@/services/api/found_us";

interface FoundUsPromptProps {
  is_suppressed?: boolean;
  on_visibility_change?: (is_visible: boolean) => void;
}

function BannerPill({
  label,
  on_click,
  emphasis,
}: {
  label: string;
  on_click: () => void;
  emphasis: boolean;
}) {
  return (
    <button
      className={`px-2.5 py-0.5 text-xs font-medium rounded-[var(--aster-radius-control)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/70 ${
        emphasis
          ? "bg-white/20 hover:bg-white/30"
          : "bg-white/10 hover:bg-white/20"
      }`}
      style={{ color: "inherit" }}
      type="button"
      onClick={on_click}
    >
      {label}
    </button>
  );
}

export function FoundUsPrompt({
  is_suppressed = false,
  on_visibility_change,
}: FoundUsPromptProps = {}) {
  const reduce_motion = use_should_reduce_motion();
  const { t } = use_i18n();
  const { user } = use_auth();
  const user_id = user?.id ?? null;
  const [eligible_user_id, set_eligible_user_id] = useState<string | null>(
    null,
  );
  const [is_hidden, set_is_hidden] = useState(false);
  const [is_choosing_dismissal, set_is_choosing_dismissal] = useState(false);
  const [is_modal_open, set_is_modal_open] = useState(false);

  useEffect(() => {
    set_eligible_user_id(null);
    set_is_hidden(false);
    set_is_choosing_dismissal(false);
    set_is_modal_open(false);

    if (!user_id) return;

    let cancelled = false;

    get_found_us_status().then((response) => {
      if (cancelled || response.error || !response.data?.eligible) return;

      set_eligible_user_id(user_id);
    });

    return () => {
      cancelled = true;
    };
  }, [user_id]);

  const is_eligible = user_id !== null && eligible_user_id === user_id;
  const is_visible = is_eligible && !is_hidden && !is_suppressed;

  useEffect(() => {
    on_visibility_change?.(is_visible);
  }, [is_visible, on_visibility_change]);

  const handle_remind_later = () => {
    set_is_hidden(true);
    snooze_found_us();
  };

  const handle_dont_ask = () => {
    set_is_hidden(true);
    finish_found_us(null);
  };

  const handle_finished = () => {
    set_is_modal_open(false);
    set_is_hidden(true);
  };

  return (
    <>
      <AnimatePresence>
        {is_visible && (
          <motion.div
            animate={{ opacity: 1, height: "auto" }}
            className="w-full text-[var(--accent-fg,#ffffff)] flex-shrink-0 overflow-hidden"
            data-testid="found-us-banner"
            exit={{ opacity: 0, height: 0, overflow: "hidden" }}
            initial={reduce_motion ? false : { opacity: 0, height: 0 }}
            style={{ backgroundColor: "var(--accent-color)" }}
            transition={{ duration: reduce_motion ? 0 : 0.2 }}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5">
              <div className="flex items-center gap-1.5 min-w-0 flex-1 basis-60">
                <MapPinIcon className="h-3.5 w-3.5 flex-shrink-0 opacity-90" />
                <span className="text-xs font-medium opacity-95">
                  {t("found_us.banner_message")}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {is_choosing_dismissal ? (
                  <>
                    <BannerPill
                      emphasis={false}
                      label={t("found_us.remind_later")}
                      on_click={handle_remind_later}
                    />
                    <BannerPill
                      emphasis={false}
                      label={t("found_us.dont_ask")}
                      on_click={handle_dont_ask}
                    />
                  </>
                ) : (
                  <>
                    <BannerPill
                      emphasis
                      label={t("found_us.banner_answer")}
                      on_click={() => set_is_modal_open(true)}
                    />
                    <BannerPill
                      emphasis={false}
                      label={t("found_us.banner_dismiss")}
                      on_click={() => set_is_choosing_dismissal(true)}
                    />
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {is_eligible && (
        <FoundUsModal
          is_open={is_modal_open}
          on_close={() => set_is_modal_open(false)}
          on_finished={handle_finished}
        />
      )}
    </>
  );
}
