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

import { useEffect, useRef, useState } from "react";
import { GlobeAltIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion, type Transition } from "framer-motion";

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
  spacing_class?: string;
}

const EASE_STANDARD = [0.2, 0, 0, 1] as const;
const EASE_EMPHASIZED_DECELERATE = [0.05, 0.7, 0.1, 1] as const;
const TRANSLATING_REVEAL_DELAY_MS = 180;
const TRANSLATING_MIN_VISIBLE_MS = 480;

const INSTANT: Transition = { duration: 0 };
const TEXT_ENTER: Transition = { duration: 0.2, ease: EASE_STANDARD };
const TEXT_EXIT: Transition = { duration: 0.12, ease: EASE_STANDARD };

function use_steady_status(status: TranslationStatus): TranslationStatus {
  const [shown, set_shown] = useState(status);
  const shown_at_ref = useRef(0);

  useEffect(() => {
    if (status === shown) return;

    let delay = 0;

    if (status === "translating" && shown === "idle") {
      delay = TRANSLATING_REVEAL_DELAY_MS;
    } else if (shown === "translating" && status !== "idle") {
      delay = Math.max(
        0,
        TRANSLATING_MIN_VISIBLE_MS - (Date.now() - shown_at_ref.current),
      );
    }

    const timer = window.setTimeout(() => {
      shown_at_ref.current = Date.now();
      set_shown(status);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [status, shown]);

  return shown;
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
  spacing_class = "pb-2",
}: TranslationBannerProps) {
  const { t, language: ui_locale } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const [supported_names, set_supported_names] = useState<string | null>(null);
  const shown = use_steady_status(status);
  const language_ref = useRef(source_language);
  const wrapper_ref = useRef<HTMLDivElement>(null);

  if (source_language) language_ref.current = source_language;

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

  const remembered_language = language_ref.current;
  const visible = shown !== "idle" && remembered_language !== null;
  const language_name = remembered_language
    ? language_display_name(remembered_language, ui_locale)
    : "";

  const message = (() => {
    if (shown === "offer") {
      if (download_bytes > 0) {
        return t("mail.translation_offer_download", {
          language: language_name,
        });
      }

      return t("mail.translation_offer", { language: language_name });
    }

    if (shown === "translating") return t("mail.translation_in_progress");

    if (shown === "translated") {
      if (showing_original) return t("mail.translation_showing_original");

      const translated = t("mail.translation_translated_from", {
        language: language_name,
      });

      return limited_quality
        ? `${translated} ${t("mail.translation_limited_quality")}`
        : translated;
    }

    if (shown === "unsupported") {
      return t("mail.translation_unsupported", { language: language_name });
    }

    if (shown === "unavailable") return t("mail.translation_unavailable");

    return "";
  })();

  const info = (() => {
    if (shown === "unsupported") {
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

    if (shown === "unavailable") {
      return {
        title: t("mail.translation_unavailable_info_title"),
        description: t("mail.translation_unavailable_info_body"),
      };
    }

    return null;
  })();

  const action = (() => {
    if (shown === "offer") {
      return {
        kind: "translate",
        on_click: on_translate,
        label:
          download_bytes > 0
            ? t("mail.translation_translate_download", {
                size: format_bytes(download_bytes),
              })
            : t("mail.translation_translate"),
      };
    }

    if (shown === "translated") {
      return {
        kind: "toggle",
        on_click: on_show_original,
        label: showing_original
          ? t("mail.translation_show_translation")
          : t("mail.translation_show_original"),
      };
    }

    return null;
  })();

  const enter = reduce_motion ? INSTANT : TEXT_ENTER;
  const exit = reduce_motion ? INSTANT : TEXT_EXIT;
  const is_translating = shown === "translating" && !reduce_motion;

  return (
    <div aria-live="polite" role="status">
      <AnimatePresence initial={false}>
        {visible && (
          <motion.div
            key="translation_banner"
            ref={wrapper_ref}
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden"
            exit={{
              height: 0,
              opacity: 0,
              transition: reduce_motion
                ? INSTANT
                : { duration: 0.18, ease: EASE_STANDARD },
            }}
            initial={{ height: 0, opacity: 0 }}
            transition={
              reduce_motion
                ? INSTANT
                : {
                    height: {
                      duration: 0.28,
                      ease: EASE_EMPHASIZED_DECELERATE,
                    },
                    opacity: {
                      duration: 0.2,
                      delay: 0.04,
                      ease: EASE_STANDARD,
                    },
                  }
            }
            onAnimationComplete={(definition) => {
              const opened =
                (definition as { height?: unknown }).height === "auto";

              if (wrapper_ref.current && opened) {
                wrapper_ref.current.style.overflow = "visible";
              }
            }}
            onAnimationStart={() => {
              if (wrapper_ref.current) {
                wrapper_ref.current.style.overflow = "hidden";
              }
            }}
          >
            <div className={spacing_class}>
              <div className="flex min-h-5 items-center gap-1.5 text-xs text-txt-muted">
                <motion.span
                  animate={{ opacity: is_translating ? [1, 0.35, 1] : 1 }}
                  className="flex flex-shrink-0"
                  transition={
                    is_translating
                      ? { duration: 1.4, ease: "easeInOut", repeat: Infinity }
                      : { duration: 0.2 }
                  }
                >
                  <GlobeAltIcon className="w-3.5 h-3.5" />
                </motion.span>
                <span className="relative flex min-w-0 items-center">
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.span
                      key={message}
                      animate={{ opacity: 1, y: 0, transition: enter }}
                      className="block min-w-0 truncate"
                      exit={{ opacity: 0, transition: exit }}
                      initial={{ opacity: 0, y: reduce_motion ? 0 : 3 }}
                    >
                      {message}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <AnimatePresence initial={false} mode="popLayout">
                  {info && (
                    <motion.span
                      key={shown}
                      animate={{ opacity: 1, transition: enter }}
                      className="flex flex-shrink-0 items-center self-center leading-none text-txt-muted"
                      exit={{ opacity: 0, transition: exit }}
                      initial={{ opacity: 0 }}
                      layout={reduce_motion ? false : "position"}
                      transition={enter}
                    >
                      <InfoPopover
                        description={info.description}
                        icon_class="w-3.5 h-3.5"
                        title={info.title}
                      />
                    </motion.span>
                  )}
                </AnimatePresence>
                <AnimatePresence initial={false} mode="popLayout">
                  {action && (
                    <motion.button
                      key={action.kind}
                      animate={{ opacity: 1, transition: enter }}
                      className="relative flex flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-blue-500 outline-none transition-colors hover:bg-blue-500/10 focus-visible:ring-2 focus-visible:ring-blue-500/60"
                      exit={{ opacity: 0, transition: exit }}
                      initial={{ opacity: 0 }}
                      layout={reduce_motion ? false : "position"}
                      transition={enter}
                      type="button"
                      onClick={action.on_click}
                    >
                      <AnimatePresence initial={false} mode="popLayout">
                        <motion.span
                          key={action.label}
                          animate={{ opacity: 1, y: 0, transition: enter }}
                          className="block whitespace-nowrap"
                          exit={{ opacity: 0, transition: exit }}
                          initial={{ opacity: 0, y: reduce_motion ? 0 : 3 }}
                        >
                          {action.label}
                        </motion.span>
                      </AnimatePresence>
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
