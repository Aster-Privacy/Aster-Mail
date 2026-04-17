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
import { AnimatePresence, motion } from "framer-motion";

import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";

interface NewEmailPillProps {
  new_email_count: number;
  on_load_new: () => void;
}

export function NewEmailPill({
  new_email_count,
  on_load_new,
}: NewEmailPillProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();

  return (
    <AnimatePresence>
      {new_email_count > 0 && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none"
          exit={{ opacity: 0, y: -20 }}
          initial={reduce_motion ? false : { opacity: 0, y: -20 }}
          transition={{ duration: reduce_motion ? 0 : 0.2, ease: "easeOut" }}
        >
          <button
            className="pointer-events-auto rounded-full px-4 py-2 text-sm font-medium bg-surf-primary text-txt-secondary shadow-lg shadow-black/15 border border-edge-primary cursor-pointer hover:brightness-95 transition-all"
            onClick={on_load_new}
          >
            {new_email_count === 1
              ? t("common.new_email_single")
              : t("common.new_emails_count", { count: new_email_count })}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
