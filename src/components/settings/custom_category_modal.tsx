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
import type { CustomCategoryRule } from "@/data/category_catalog";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  SparklesIcon,
  XMarkIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Input } from "@/components/ui/input";
import {
  CUSTOM_CATEGORY_ICON_CHOICES,
  MAX_CUSTOM_CATEGORY_NAME,
  MAX_MATCH_TERMS,
  is_valid_match_domain,
  is_valid_match_keyword,
  sanitize_custom_category,
} from "@/data/category_catalog";
import { category_icon } from "@/data/category_icons";
import { use_should_reduce_motion } from "@/provider";
import { use_i18n } from "@/lib/i18n/context";

interface CustomCategoryModalProps {
  is_open: boolean;
  on_close: () => void;
  on_save: (rule: CustomCategoryRule) => void;
  existing?: CustomCategoryRule | null;
}

function terms_to_text(terms: string[]): string {
  return terms.join(", ");
}

function split_terms(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_MATCH_TERMS);
}

export function CustomCategoryModal({
  is_open,
  on_close,
  on_save,
  existing,
}: CustomCategoryModalProps) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();

  const [name, set_name] = useState("");
  const [icon, set_icon] = useState(CUSTOM_CATEGORY_ICON_CHOICES[0]);
  const [domains_text, set_domains_text] = useState("");
  const [keywords_text, set_keywords_text] = useState("");
  const [expanded, set_expanded] = useState(false);
  const [error, set_error] = useState("");

  useEffect(() => {
    if (!is_open) return;

    set_name(existing?.name ?? "");
    set_icon(existing?.icon ?? CUSTOM_CATEGORY_ICON_CHOICES[0]);
    set_domains_text(terms_to_text(existing?.match_domains ?? []));
    set_keywords_text(terms_to_text(existing?.match_keywords ?? []));
    set_expanded(false);
    set_error("");
  }, [is_open, existing]);

  const trimmed_name = name.trim();

  const handle_save = () => {
    if (!trimmed_name) {
      set_error(t("settings.category_name_required"));

      return;
    }

    const domains = split_terms(domains_text);
    const keywords = split_terms(keywords_text);

    if (domains.length === 0 && keywords.length === 0) {
      set_error(t("settings.category_rule_required"));

      return;
    }

    const invalid_domains = domains.filter((d) => !is_valid_match_domain(d));

    if (invalid_domains.length > 0) {
      set_error(
        t("settings.category_domains_invalid", {
          list: invalid_domains.join(", "),
        }),
      );

      return;
    }

    const invalid_keywords = keywords.filter(
      (k) => !is_valid_match_keyword(k),
    );

    if (invalid_keywords.length > 0) {
      set_error(
        t("settings.category_keywords_invalid", {
          list: invalid_keywords.join(", "),
        }),
      );

      return;
    }

    const sanitized = sanitize_custom_category({
      id: existing?.id,
      name: trimmed_name,
      icon,
      match_domains: domains,
      match_keywords: keywords,
      enabled: existing?.enabled ?? true,
    });

    if (!sanitized) {
      set_error(t("settings.category_name_required"));

      return;
    }

    on_save(sanitized);
    on_close();
  };

  const Icon = category_icon(icon);
  const textarea_class =
    "w-full resize-none rounded-lg border border-edge-primary bg-transparent px-3 py-2 text-[14px] text-txt-primary placeholder:text-txt-muted outline-none transition-colors focus:border-[var(--accent-blue)]";

  return (
    <AnimatePresence>
      {is_open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          exit={{ opacity: 0 }}
          initial={reduce_motion ? false : { opacity: 0 }}
          transition={{ duration: reduce_motion ? 0 : 0.15 }}
          onClick={on_close}
        >
          <div
            className="absolute inset-0 backdrop-blur-md"
            style={{ backgroundColor: "var(--modal-overlay)" }}
          />
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className={`relative w-full rounded-xl border overflow-hidden bg-modal-bg border-edge-primary max-h-[90vh] overflow-y-auto transition-[max-width] duration-200 ${
              expanded ? "max-w-2xl" : "max-w-md"
            }`}
            exit={{ opacity: 0, scale: 0.96 }}
            initial={reduce_motion ? false : { opacity: 0, scale: 0.96 }}
            style={{ boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)" }}
            transition={{ duration: reduce_motion ? 0 : 0.15 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <SparklesIcon className="w-5 h-5 text-txt-secondary" />
                  <h2 className="text-[16px] font-semibold text-txt-primary">
                    {existing
                      ? t("settings.edit_custom_category")
                      : t("settings.new_custom_category")}
                  </h2>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    title={
                      expanded
                        ? t("settings.category_collapse")
                        : t("settings.category_expand")
                    }
                    variant="ghost"
                    onClick={() => set_expanded((v) => !v)}
                  >
                    {expanded ? (
                      <ArrowsPointingInIcon className="w-4 h-4" />
                    ) : (
                      <ArrowsPointingOutIcon className="w-4 h-4" />
                    )}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={on_close}>
                    <XMarkIcon className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label
                    className="block text-[13px] font-medium mb-2 text-txt-secondary"
                    htmlFor="custom-category-name"
                  >
                    {t("settings.category_name")}
                  </label>
                  <Input
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    className="w-full"
                    id="custom-category-name"
                    maxLength={MAX_CUSTOM_CATEGORY_NAME}
                    placeholder={t("settings.category_name_placeholder")}
                    type="text"
                    value={name}
                    onChange={(e) => set_name(e.target.value)}
                  />
                </div>

                <div>
                  <span className="block text-[13px] font-medium mb-2 text-txt-secondary">
                    {t("settings.category_icon")}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {CUSTOM_CATEGORY_ICON_CHOICES.map((key) => {
                      const ChoiceIcon = category_icon(key);
                      const is_selected = icon === key;

                      return (
                        <button
                          key={key}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.04] transition-colors hover:bg-black/[0.07] dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
                          style={{
                            boxShadow: is_selected
                              ? "0 0 0 2px var(--modal-bg), 0 0 0 4px var(--accent-blue)"
                              : "none",
                          }}
                          type="button"
                          onClick={() => set_icon(key)}
                        >
                          <ChoiceIcon className="h-4.5 w-4.5 text-txt-secondary" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label
                    className="block text-[13px] font-medium mb-2 text-txt-secondary"
                    htmlFor="custom-category-domains"
                  >
                    {t("settings.category_match_domains")}
                  </label>
                  {expanded ? (
                    <textarea
                      className={textarea_class}
                      id="custom-category-domains"
                      placeholder={t(
                        "settings.category_match_domains_placeholder",
                      )}
                      rows={5}
                      value={domains_text}
                      onChange={(e) => set_domains_text(e.target.value)}
                    />
                  ) : (
                    <Input
                      className="w-full"
                      id="custom-category-domains"
                      placeholder={t(
                        "settings.category_match_domains_placeholder",
                      )}
                      type="text"
                      value={domains_text}
                      onChange={(e) => set_domains_text(e.target.value)}
                    />
                  )}
                  <p className="mt-1 text-[12px] text-txt-muted">
                    {t("settings.category_match_domains_help")}
                  </p>
                </div>

                <div>
                  <label
                    className="block text-[13px] font-medium mb-2 text-txt-secondary"
                    htmlFor="custom-category-keywords"
                  >
                    {t("settings.category_match_keywords")}
                  </label>
                  {expanded ? (
                    <textarea
                      className={textarea_class}
                      id="custom-category-keywords"
                      placeholder={t(
                        "settings.category_match_keywords_placeholder",
                      )}
                      rows={5}
                      value={keywords_text}
                      onChange={(e) => set_keywords_text(e.target.value)}
                    />
                  ) : (
                    <Input
                      className="w-full"
                      id="custom-category-keywords"
                      placeholder={t(
                        "settings.category_match_keywords_placeholder",
                      )}
                      type="text"
                      value={keywords_text}
                      onChange={(e) => set_keywords_text(e.target.value)}
                    />
                  )}
                  <p className="mt-1 text-[12px] text-txt-muted">
                    {t("settings.category_match_keywords_help")}
                  </p>
                </div>

                <div>
                  <span className="block text-[13px] font-medium mb-2 text-txt-secondary">
                    {t("common.preview")}
                  </span>
                  <div className="flex items-center gap-2.5 rounded-lg border border-edge-primary bg-surf-primary px-4 py-3.5">
                    <Icon className="h-5 w-5 shrink-0 text-txt-muted" />
                    <span className="text-[13.5px] font-medium text-txt-secondary">
                      {trimmed_name || t("settings.category_name_placeholder")}
                    </span>
                  </div>
                </div>

                {error && (
                  <p className="text-[13px] text-red-500 mt-2">{error}</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 pb-6 pt-2">
              <Button size="xl" variant="outline" onClick={on_close}>
                {t("common.cancel")}
              </Button>
              <Button
                disabled={!trimmed_name}
                size="xl"
                variant="depth"
                onClick={handle_save}
              >
                {existing ? t("common.save") : t("common.create")}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
