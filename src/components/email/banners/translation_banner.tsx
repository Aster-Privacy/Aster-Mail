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
import { GlobeAltIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { language_display_name } from "@/services/translation/accepted_languages";
import type { LanguageCode } from "@/services/translation/engine_types";
import type { TranslationStatus } from "@/components/email/hooks/use_email_translation";

interface TranslationBannerProps {
  status: TranslationStatus;
  source_language: LanguageCode | null;
  limited_quality: boolean;
  showing_original: boolean;
  on_translate: () => void;
  on_show_original: () => void;
}

export function TranslationBanner({
  status,
  source_language,
  limited_quality,
  showing_original,
  on_translate,
  on_show_original,
}: TranslationBannerProps) {
  const { t, language: ui_locale } = use_i18n();
  const reduce_motion = use_should_reduce_motion();

  if (status === "idle" || !source_language) return null;

  const language_name = language_display_name(source_language, ui_locale);

  const action_class =
    "flex-shrink-0 text-xs font-medium text-blue-500 rounded px-1.5 py-0.5 hover:bg-blue-500/10 transition-colors";

  const message = (() => {
    if (status === "offer") {
      return t("mail.translation_offer", { language: language_name });
    }

    if (status === "translating") return t("mail.translation_in_progress");

    if (status === "translated") {
      if (showing_original) return t("mail.translation_showing_original");

      const translated = t("mail.translation_translated_from", {
        language: language_name,
      });

      return limited_quality
        ? `${translated} ${t("mail.translation_limited_quality")}`
        : translated;
    }

    if (status === "unavailable") return t("mail.translation_unavailable");

    return "";
  })();

  return (
    <div className="mb-2 flex items-center gap-1.5 text-xs text-txt-muted">
      <GlobeAltIcon className="w-3.5 h-3.5 flex-shrink-0" />
      <AnimatePresence mode="wait">
        <motion.div
          key={`${status}:${showing_original}`}
          animate={{ opacity: 1 }}
          className="flex min-w-0 items-center gap-1.5"
          exit={reduce_motion ? undefined : { opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.18 }}
        >
          <span className="min-w-0 truncate">{message}</span>
          {status === "offer" && (
            <button
              className={action_class}
              type="button"
              onClick={on_translate}
            >
              {t("mail.translation_translate")}
            </button>
          )}
          {status === "translated" && (
            <button
              className={action_class}
              type="button"
              onClick={on_show_original}
            >
              {showing_original
                ? t("mail.translation_show_translation")
                : t("mail.translation_show_original")}
            </button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
