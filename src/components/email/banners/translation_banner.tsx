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
import type { LanguageCode } from "@/services/translation/engine_types";
import type { TranslationStatus } from "@/components/email/hooks/use_email_translation";

import { useEffect, useState } from "react";
import { GlobeAltIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";

import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";
import { InfoPopover } from "@/components/ui/info_popover";
import { language_display_name } from "@/services/translation/accepted_languages";
import { available_source_languages } from "@/services/translation/translate_document";
import { ignore_error } from "@/lib/ignore_error";
import { format_bytes } from "@/lib/utils";

interface TranslationBannerProps {
  status: TranslationStatus;
  source_language: LanguageCode | null;
  target_language: LanguageCode;
  limited_quality: boolean;
  download_bytes: number;
  showing_original: boolean;
  on_translate: () => void;
  on_show_original: () => void;
}

export function TranslationBanner({
  status,
  source_language,
  target_language,
  limited_quality,
  download_bytes,
  showing_original,
  on_translate,
  on_show_original,
}: TranslationBannerProps) {
  const { t, language: ui_locale } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [supported_names, set_supported_names] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "unsupported") return;

    let active = true;

    void available_source_languages(target_language)
      .then((codes) => {
        if (!active || codes.length === 0) return;

        set_supported_names(
          codes
            .map((code) => language_display_name(code, ui_locale))
            .sort((a, b) => a.localeCompare(b))
            .join(", "),
        );
      })
      .catch((caught) =>
        ignore_error(
          "components/email/banners/translation_banner:TranslationBanner",
          caught,
        ),
      );

    return () => {
      active = false;
    };
  }, [status, target_language, ui_locale]);

  if (status === "idle" || !source_language) return null;

  const language_name = language_display_name(source_language, ui_locale);

  const action_class =
    "flex-shrink-0 text-xs font-medium text-blue-500 rounded px-1.5 py-0.5 hover:bg-blue-500/10 transition-colors";

  const message = (() => {
    if (status === "offer") {
      if (download_bytes > 0) {
        return t("mail.translation_offer_download", {
          language: language_name,
        });
      }

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

    if (status === "unsupported") {
      return t("mail.translation_unsupported", { language: language_name });
    }

    if (status === "unavailable") return t("mail.translation_unavailable");

    return "";
  })();

  const info = (() => {
    if (status === "unsupported") {
      return {
        title: t("mail.translation_unsupported_info_title"),
        description: supported_names
          ? t("mail.translation_unsupported_info_body_list", {
              language: language_name,
              languages: supported_names,
            })
          : t("mail.translation_unsupported_info_body", {
              language: language_name,
            }),
      };
    }

    if (status === "unavailable") {
      return {
        title: t("mail.translation_unavailable_info_title"),
        description: t("mail.translation_unavailable_info_body"),
      };
    }

    return null;
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
          {info && (
            <span className="flex flex-shrink-0 items-center self-center leading-none text-txt-muted">
              <InfoPopover
                description={info.description}
                icon_class="w-3.5 h-3.5"
                title={info.title}
              />
            </span>
          )}
          {status === "offer" && (
            <button
              className={action_class}
              type="button"
              onClick={on_translate}
            >
              {download_bytes > 0
                ? t("mail.translation_translate_download", {
                    size: format_bytes(download_bytes),
                  })
                : t("mail.translation_translate")}
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
