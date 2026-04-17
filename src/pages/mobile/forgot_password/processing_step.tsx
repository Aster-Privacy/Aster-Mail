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
import type { ProcessingStepProps } from "./types";

import { motion } from "framer-motion";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";

export function ProcessingStep({
  reduce_motion,
  processing_status,
}: ProcessingStepProps) {
  const { t } = use_i18n();

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="flex flex-1 flex-col items-center justify-center px-6"
      initial={reduce_motion ? false : { opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Spinner className="h-10 w-10 text-[#4a7aff]" size="lg" />
      <h2 className="mt-8 text-xl font-semibold text-[var(--text-primary)]">
        {t("auth.recovering_your_account")}
      </h2>
      <p className="mt-3 text-sm text-[var(--text-tertiary)]">
        {processing_status}
      </p>
      <p className="mt-8 max-w-xs text-center text-xs leading-relaxed text-[var(--text-muted)]">
        {t("auth.please_dont_close")}
      </p>
    </motion.div>
  );
}
