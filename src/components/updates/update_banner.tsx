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

import { UpdateCard } from "@/components/updates/update_card";
import { use_update_installer } from "@/components/updates/use_update_installer";
import { ignore_error } from "@/lib/ignore_error";
import { use_should_reduce_motion } from "@/provider";
import {
  is_desktop_runtime,
  get_auto_update_enabled,
  get_last_notified_version,
  mark_version_notified,
  check_for_update,
  type DesktopUpdateInfo,
} from "@/services/updates/updater";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const FIRST_CHECK_DELAY_MS = 8000;

export function UpdateBanner() {
  const reduce_motion = use_should_reduce_motion();
  const [info, set_info] = useState<DesktopUpdateInfo | null>(null);
  const [dismissed_version, set_dismissed_version] = useState<string | null>(
    null,
  );
  const { state, start } = use_update_installer();

  useEffect(() => {
    if (!is_desktop_runtime()) return;
    let cancelled = false;
    const run = async () => {
      if (!get_auto_update_enabled()) return;
      try {
        const result = await check_for_update();

        if (cancelled) return;
        if (result && get_last_notified_version() !== result.version) {
          set_info(result);
        }
      } catch (caught) {
        ignore_error("components/updates/update_banner:run", caught);
      }
    };

    const first_id = window.setTimeout(run, FIRST_CHECK_DELAY_MS);
    const id = window.setInterval(run, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(first_id);
      window.clearInterval(id);
    };
  }, []);

  const visible = Boolean(info) && dismissed_version !== info?.version;

  const handle_dismiss = () => {
    if (!info) return;
    mark_version_notified(info.version);
    set_dismissed_version(info.version);
  };

  return (
    <div className="pointer-events-none fixed bottom-4 end-4 z-[9999]">
      <AnimatePresence>
        {visible && info && (
          <motion.div
            key={info.version}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="pointer-events-auto"
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            initial={
              reduce_motion
                ? { opacity: 0 }
                : { opacity: 0, y: 24, scale: 0.96 }
            }
            transition={
              reduce_motion
                ? { duration: 0.15 }
                : { type: "spring", stiffness: 380, damping: 32, mass: 0.9 }
            }
          >
            <UpdateCard
              install={state}
              notes={info.notes}
              on_dismiss={handle_dismiss}
              on_install={() => void start()}
              version={info.version}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
