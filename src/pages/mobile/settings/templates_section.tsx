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
import type { DecryptedTemplate } from "@/services/api/templates";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PlusIcon,
  DocumentTextIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { SettingsHeader } from "./shared";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import {
  list_templates,
  create_template,
  delete_template,
} from "@/services/api/templates";

export function TemplatesSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const [templates, set_templates] = useState<DecryptedTemplate[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [show_form, set_show_form] = useState(false);
  const [form_name, set_form_name] = useState("");
  const [form_category] = useState(t("settings.general"));
  const [form_content, set_form_content] = useState("");
  const [is_saving, set_is_saving] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await list_templates();

      if (!cancelled) {
        if (res.error) set_error(res.error);
        else if (res.data) set_templates(res.data.templates);
        set_is_loading(false);
      }
    }
    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const handle_create = useCallback(async () => {
    if (!form_name.trim() || !form_content.trim() || is_saving) return;
    set_is_saving(true);
    set_error(null);
    const res = await create_template({
      name: form_name.trim(),
      category: form_category,
      content: form_content.trim(),
    });

    if (res.error) {
      set_error(res.error);
      set_is_saving(false);

      return;
    }
    if (res.data) {
      set_templates((prev) => [
        ...prev,
        {
          id: res.data!.id,
          name: form_name.trim(),
          category: form_category,
          content: form_content.trim(),
          sort_order: 0,
          created_at: res.data!.created_at,
          updated_at: res.data!.created_at,
        },
      ]);
      set_show_form(false);
      set_form_name("");
      set_form_content("");
    }
    set_is_saving(false);
  }, [form_name, form_category, form_content, is_saving]);

  const handle_delete = useCallback(async (id: string) => {
    await delete_template(id);
    set_templates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.templates")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        {error && (
          <div
            className="mx-4 mt-3 flex items-center justify-between rounded-xl px-4 py-3 text-[13px]"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "var(--color-danger)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            <span>{error}</span>
            <button
              className="ml-2 p-1"
              type="button"
              onClick={() => set_error(null)}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        )}
        <AnimatePresence mode="wait">
          {is_loading ? (
            <motion.div
              key="loading"
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="flex items-center justify-center py-12">
                <Spinner size="md" />
              </div>
            </motion.div>
          ) : show_form ? (
            <motion.div
              key="form"
              animate={{ opacity: 1 }}
              className="px-4 pt-4 space-y-3"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Input
                className="w-full"
                placeholder={t("settings.template_name_placeholder")}
                value={form_name}
                onChange={(e) => set_form_name(e.target.value)}
              />
              <textarea
                className="w-full resize-none rounded-xl bg-[var(--mobile-bg-card)] p-4 text-[15px] text-[var(--mobile-text-primary)] placeholder:text-[var(--mobile-text-muted)] outline-none"
                placeholder={t("settings.template_content_placeholder")}
                rows={6}
                value={form_content}
                onChange={(e) => set_form_content(e.target.value)}
              />
              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-xl bg-[var(--mobile-bg-card)] py-3 text-[15px] font-medium text-[var(--mobile-text-primary)]"
                  type="button"
                  onClick={() => set_show_form(false)}
                >
                  {t("common.cancel")}
                </button>
                <motion.button
                  className="flex-1 flex items-center justify-center rounded-xl py-3 text-[15px] font-semibold text-white disabled:opacity-50"
                  disabled={
                    !form_name.trim() || !form_content.trim() || is_saving
                  }
                  style={{
                    background:
                      "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                    boxShadow:
                      "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }}
                  type="button"
                  onClick={handle_create}
                >
                  {is_saving ? (
                    <Spinner size="md" />
                  ) : (
                    t("settings.create_template")
                  )}
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="px-4 pt-3">
                <motion.button
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-semibold text-white"
                  style={{
                    background:
                      "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                    boxShadow:
                      "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }}
                  type="button"
                  onClick={() => set_show_form(true)}
                >
                  <PlusIcon className="h-5 w-5" />
                  {t("settings.add_template")}
                </motion.button>
              </div>
              {templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-8 pt-16">
                  <DocumentTextIcon className="h-16 w-16 text-[var(--mobile-text-muted)] opacity-40" />
                  <p className="text-center text-[15px] text-[var(--mobile-text-muted)]">
                    {t("settings.no_templates_yet")}
                  </p>
                </div>
              ) : (
                <div className="px-4 pt-3 space-y-3">
                  {templates.map((tmpl) => (
                    <div
                      key={tmpl.id}
                      className="rounded-xl bg-[var(--mobile-bg-card)] p-4"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-[15px] font-medium text-[var(--mobile-text-primary)]">
                          {tmpl.name}
                        </span>
                        <span className="rounded-full bg-[var(--mobile-bg-card-hover)] px-2 py-0.5 text-[11px] capitalize text-[var(--mobile-text-muted)]">
                          {tmpl.category}
                        </span>
                      </div>
                      <p className="mt-2 text-[13px] text-[var(--mobile-text-muted)] line-clamp-3 whitespace-pre-wrap">
                        {tmpl.content}
                      </p>
                      <button
                        className="mt-3 text-[13px] text-[var(--mobile-danger)]"
                        type="button"
                        onClick={() => handle_delete(tmpl.id)}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
