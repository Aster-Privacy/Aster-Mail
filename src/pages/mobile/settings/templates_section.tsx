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
import { use_templates } from "@/contexts/templates_context";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import {
  list_templates,
  create_template,
  update_template,
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
  const { reload_templates: reload_context_templates } = use_templates();
  const [templates, set_templates] = useState<DecryptedTemplate[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [show_form, set_show_form] = useState(false);
  const [editing_id, set_editing_id] = useState<string | null>(null);
  const [form_name, set_form_name] = useState("");
  const [form_category, set_form_category] = useState("");
  const [form_content, set_form_content] = useState("");
  const [is_saving, set_is_saving] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const open_create_form = useCallback(() => {
    set_editing_id(null);
    set_form_name("");
    set_form_category("");
    set_form_content("");
    set_show_form(true);
  }, []);

  const open_edit_form = useCallback((tmpl: DecryptedTemplate) => {
    set_editing_id(tmpl.id);
    set_form_name(tmpl.name);
    set_form_category(tmpl.category);
    set_form_content(tmpl.content);
    set_show_form(true);
  }, []);

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

  const handle_save = useCallback(async () => {
    if (!form_name.trim() || !form_content.trim() || is_saving) return;
    set_is_saving(true);
    set_error(null);
    const form_data = {
      name: form_name.trim(),
      category: form_category.trim() || t("common.general"),
      content: form_content.trim(),
    };

    if (editing_id) {
      const res = await update_template(editing_id, form_data);

      if (res.error) {
        set_error(res.error);
        set_is_saving(false);

        return;
      }
      set_templates((prev) =>
        prev.map((tmpl) =>
          tmpl.id === editing_id ? { ...tmpl, ...form_data } : tmpl,
        ),
      );
      reload_context_templates();
      set_show_form(false);
      set_editing_id(null);
      set_form_name("");
      set_form_category("");
      set_form_content("");
      set_is_saving(false);

      return;
    }

    const res = await create_template(form_data);

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
          name: form_data.name,
          category: form_data.category,
          content: form_data.content,
          sort_order: 0,
          created_at: res.data!.created_at,
          updated_at: res.data!.created_at,
        },
      ]);
      reload_context_templates();
      set_show_form(false);
      set_form_name("");
      set_form_category("");
      set_form_content("");
    }
    set_is_saving(false);
  }, [
    editing_id,
    form_name,
    form_category,
    form_content,
    is_saving,
    reload_context_templates,
    t,
  ]);

  const handle_delete = useCallback(
    async (id: string) => {
      await delete_template(id);
      set_templates((prev) => prev.filter((tmpl) => tmpl.id !== id));
      reload_context_templates();
    },
    [reload_context_templates],
  );

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
              <Input
                className="w-full"
                placeholder={t("settings.category_placeholder")}
                value={form_category}
                onChange={(e) => set_form_category(e.target.value)}
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
                  className="flex-1 rounded-[16px] bg-[var(--mobile-bg-card)] py-3 text-[15px] font-medium text-[var(--mobile-text-primary)]"
                  type="button"
                  onClick={() => {
                    set_show_form(false);
                    set_editing_id(null);
                  }}
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
                  onClick={handle_save}
                >
                  {is_saving ? (
                    <Spinner size="md" />
                  ) : editing_id ? (
                    t("settings.update_template")
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
                  onClick={open_create_form}
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
                      <div className="mt-3 flex items-center gap-4">
                        <button
                          className="text-[13px] text-[var(--mobile-accent)]"
                          type="button"
                          onClick={() => open_edit_form(tmpl)}
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          className="text-[13px] text-[var(--mobile-danger)]"
                          type="button"
                          onClick={() => handle_delete(tmpl.id)}
                        >
                          {t("common.delete")}
                        </button>
                      </div>
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
