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
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  XMarkIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { use_templates } from "@/contexts/templates_context";
import {
  list_templates,
  create_template,
  update_template,
  delete_template,
  type DecryptedTemplate,
  type TemplateFormData,
} from "@/services/api/templates";

interface EditorState {
  is_open: boolean;
  editing_id: string | null;
  name: string;
  category: string;
  content: string;
  is_saving: boolean;
}

const initial_editor_state: EditorState = {
  is_open: false,
  editing_id: null,
  name: "",
  category: "",
  content: "",
  is_saving: false,
};

export function TemplatesSection() {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { reload_templates: reload_context_templates } = use_templates();
  const [templates, set_templates] = useState<DecryptedTemplate[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [is_initial_load, set_is_initial_load] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [editor, set_editor] = useState<EditorState>(initial_editor_state);
  const [deleting_id, set_deleting_id] = useState<string | null>(null);
  const [confirm_delete_id, set_confirm_delete_id] = useState<string | null>(
    null,
  );
  const [_name_focused, _set_name_focused] = useState(false);
  const [_category_focused, _set_category_focused] = useState(false);
  const [_content_focused, _set_content_focused] = useState(false);

  const load_templates = useCallback(async () => {
    set_is_loading(true);
    set_error(null);

    const response = await list_templates();

    if (response.error) {
      set_error(response.error);
    } else if (response.data) {
      set_templates(response.data.templates);
    }

    set_is_loading(false);
    set_is_initial_load(false);
  }, []);

  useEffect(() => {
    load_templates();
  }, [load_templates]);

  const open_create_editor = () => {
    set_editor({
      is_open: true,
      editing_id: null,
      name: "",
      category: "",
      content: "",
      is_saving: false,
    });
  };

  const open_edit_editor = (template: DecryptedTemplate) => {
    set_editor({
      is_open: true,
      editing_id: template.id,
      name: template.name,
      category: template.category,
      content: template.content,
      is_saving: false,
    });
  };

  const close_editor = () => {
    set_editor(initial_editor_state);
  };

  const handle_save = async () => {
    if (!editor.name.trim() || !editor.content.trim()) return;

    set_editor((prev) => ({ ...prev, is_saving: true }));

    const form_data: TemplateFormData = {
      name: editor.name.trim(),
      category: editor.category.trim() || t("common.general"),
      content: editor.content.trim(),
    };

    if (editor.editing_id) {
      const response = await update_template(editor.editing_id, form_data);

      if (response.error) {
        set_error(response.error);
        set_editor((prev) => ({ ...prev, is_saving: false }));

        return;
      }

      set_templates((prev) =>
        prev.map((t) =>
          t.id === editor.editing_id
            ? {
                ...t,
                name: form_data.name,
                category: form_data.category,
                content: form_data.content,
              }
            : t,
        ),
      );
      reload_context_templates();
    } else {
      const response = await create_template(form_data);

      if (response.error) {
        set_error(response.error);
        set_editor((prev) => ({ ...prev, is_saving: false }));

        return;
      }

      if (response.data) {
        const new_template: DecryptedTemplate = {
          id: response.data.id,
          name: form_data.name,
          category: form_data.category,
          content: form_data.content,
          sort_order: 0,
          created_at: response.data.created_at,
          updated_at: response.data.created_at,
        };

        set_templates((prev) => [...prev, new_template]);
        reload_context_templates();
      }
    }

    close_editor();
  };

  const handle_delete = async (id: string) => {
    set_deleting_id(id);
    const response = await delete_template(id);

    if (response.error) {
      set_error(response.error);
    } else {
      set_templates((prev) => prev.filter((t) => t.id !== id));
      reload_context_templates();
    }

    set_deleting_id(null);
  };

  if (is_initial_load) {
    return <SettingsSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-4">
          <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
            <DocumentDuplicateIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.email_templates_title")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-4 text-txt-muted">
          {t("settings.email_templates_description")}
        </p>

        {error && (
          <div
            className="mb-4 p-3 rounded-lg text-sm flex items-center justify-between"
            style={{
              backgroundColor: "#dc2626",
              color: "#fff",
              border: "none",
            }}
          >
            <span>{error}</span>
            <button
              className="p-1 rounded hover:bg-red-500/20"
              onClick={() => set_error(null)}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-txt-primary">
              {t("settings.your_templates", {
                count: is_loading ? "..." : String(templates.length),
              })}
            </h4>
            <Button
              disabled={editor.is_open}
              size="md"
              variant="depth"
              onClick={open_create_editor}
            >
              <PlusIcon className="w-4 h-4" />
              {t("settings.add_template")}
            </Button>
          </div>

          <Modal
            is_open={editor.is_open}
            on_close={close_editor}
            show_close_button={!editor.is_saving}
            size="lg"
          >
            <ModalHeader>
              <ModalTitle>
                {editor.editing_id
                  ? t("settings.update_template")
                  : t("settings.add_template")}
              </ModalTitle>
            </ModalHeader>
            <ModalBody className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className="text-sm font-medium block mb-2 text-txt-primary"
                    htmlFor="template-name"
                  >
                    {t("settings.template_name")}
                  </label>
                  <Input
                    autoFocus
                    className="w-full"
                    id="template-name"
                    placeholder={t("settings.template_name_placeholder")}
                    value={editor.name}
                    onChange={(e) =>
                      set_editor((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <label
                    className="text-sm font-medium block mb-2 text-txt-primary"
                    htmlFor="template-category"
                  >
                    {t("settings.category")}
                  </label>
                  <Input
                    className="w-full"
                    id="template-category"
                    placeholder={t("settings.category_placeholder")}
                    value={editor.category}
                    onChange={(e) =>
                      set_editor((prev) => ({
                        ...prev,
                        category: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div>
                <label
                  className="text-sm font-medium block mb-2 text-txt-primary"
                  htmlFor="template-content"
                >
                  {t("settings.template_content")}
                </label>
                <textarea
                  className="aster_input resize-none py-2 font-mono"
                  id="template-content"
                  placeholder={t("settings.template_content_placeholder")}
                  rows={8}
                  value={editor.content}
                  onChange={(e) =>
                    set_editor((prev) => ({
                      ...prev,
                      content: e.target.value,
                    }))
                  }
                />
                <p className="text-xs mt-1.5 text-txt-muted">
                  {t("settings.placeholders_hint")}
                </p>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                disabled={editor.is_saving}
                variant="ghost"
                onClick={close_editor}
              >
                {t("common.cancel")}
              </Button>
              <Button
                disabled={
                  !editor.name.trim() ||
                  !editor.content.trim() ||
                  editor.is_saving
                }
                variant="depth"
                onClick={handle_save}
              >
                {editor.is_saving ? (
                  <>
                    <Spinner className="mr-2" size="md" />
                    {t("common.saving")}
                  </>
                ) : editor.editing_id ? (
                  t("settings.update_template")
                ) : (
                  t("settings.create_template")
                )}
              </Button>
            </ModalFooter>
          </Modal>

          {templates.length === 0 && !editor.is_open ? (
            <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
              <PencilIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
              <p className="text-sm text-txt-muted">
                {t("settings.no_templates_yet")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {templates.map((template) => (
                  <motion.div
                    key={template.id}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3 p-3 rounded-lg bg-surf-secondary border border-edge-primary group"
                    exit={{ opacity: 0 }}
                    initial={reduce_motion ? false : { opacity: 0 }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-txt-primary truncate">
                          {template.name}
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-surf-tertiary text-txt-muted flex-shrink-0">
                          {template.category || t("common.general")}
                        </span>
                      </div>
                      <p className="text-xs text-txt-muted mt-0.5 line-clamp-1">
                        {template.content}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="icon"
                        title={t("common.edit")}
                        variant="ghost"
                        onClick={() => open_edit_editor(template)}
                      >
                        <PencilIcon className="w-4 h-4" />
                      </Button>
                      <Button
                        className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
                        disabled={deleting_id === template.id}
                        size="icon"
                        title={t("common.delete")}
                        variant="ghost"
                        onClick={() => set_confirm_delete_id(template.id)}
                      >
                        {deleting_id === template.id ? (
                          <div
                            className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                            style={{
                              borderColor: "currentColor",
                              borderTopColor: "transparent",
                            }}
                          />
                        ) : (
                          <TrashIcon className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <ConfirmationModal
        confirm_text={t("common.delete")}
        is_open={confirm_delete_id !== null}
        message={t("settings.delete_template_message")}
        on_cancel={() => set_confirm_delete_id(null)}
        on_confirm={() => {
          if (confirm_delete_id) {
            handle_delete(confirm_delete_id);
          }
          set_confirm_delete_id(null);
        }}
        title={t("settings.delete_template_title")}
        variant="danger"
      />
    </div>
  );
}
