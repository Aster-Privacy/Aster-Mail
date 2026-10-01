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
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  XMarkIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  Island,
  IslandEmpty,
  IslandIconButton,
  IslandRow,
  IslandSection,
  IslandSections,
} from "@aster/ui";

import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import { Input } from "@/components/ui/input";
import { ButtonSpinner } from "@/components/ui/spinner";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";
import { use_templates } from "@/contexts/templates_context";
import {
  list_templates,
  create_template,
  update_template,
  delete_template,
  type DecryptedTemplate,
  type TemplateFormData,
} from "@/services/api/templates";

const MAX_TEMPLATE_NAME_LENGTH = 200;
const MAX_TEMPLATE_CATEGORY_LENGTH = 100;
const MAX_TEMPLATE_CONTENT_LENGTH = 30000;

interface EditorState {
  is_open: boolean;
  editing_id: string | null;
  name: string;
  category: string;
  content: string;
  is_saving: boolean;
  show_validation: boolean;
}

const initial_editor_state: EditorState = {
  is_open: false,
  editing_id: null,
  name: "",
  category: "",
  content: "",
  is_saving: false,
  show_validation: false,
};

export function TemplatesSection() {
  const { t } = use_i18n();
  const { reload_templates: reload_context_templates } = use_templates();
  const [templates, set_templates] = useState<DecryptedTemplate[]>([]);
  const [is_initial_load, set_is_initial_load] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [has_unreadable, set_has_unreadable] = useState(false);
  const [editor, set_editor] = useState<EditorState>(initial_editor_state);
  const [deleting_id, set_deleting_id] = useState<string | null>(null);
  const [confirm_discard_open, set_confirm_discard_open] = useState(false);
  const [editor_baseline, set_editor_baseline] = useState("");
  const [confirm_delete_id, set_confirm_delete_id] = useState<string | null>(
    null,
  );
  const [load_failed, set_load_failed] = useState(false);
  const [editor_error, set_editor_error] = useState<string | null>(null);

  const load_templates = useCallback(async () => {
    set_error(null);

    const response = await list_templates();

    if (response.error) {
      set_error(response.error);
      set_load_failed(true);
    } else if (response.data) {
      set_load_failed(false);
      set_templates(response.data.templates);
      set_has_unreadable(
        typeof response.data.total === "number" &&
          response.data.total > response.data.templates.length,
      );
    }

    set_is_initial_load(false);
  }, []);

  useEffect(() => {
    load_templates();
  }, [load_templates]);

  const open_create_editor = () => {
    set_editor_error(null);
    set_editor_baseline(
      JSON.stringify({ name: "", category: "", content: "" }),
    );
    set_editor({
      is_open: true,
      editing_id: null,
      name: "",
      category: "",
      content: "",
      is_saving: false,
      show_validation: false,
    });
  };

  const open_edit_editor = (template: DecryptedTemplate) => {
    set_editor_error(null);
    set_editor_baseline(
      JSON.stringify({
        name: template.name,
        category: template.category,
        content: template.content,
      }),
    );
    set_editor({
      is_open: true,
      editing_id: template.id,
      name: template.name,
      category: template.category,
      content: template.content,
      is_saving: false,
      show_validation: false,
    });
  };

  const close_editor = () => {
    set_editor_error(null);
    set_editor_baseline("");
    set_confirm_discard_open(false);
    set_editor(initial_editor_state);
  };

  const request_close_editor = () => {
    if (editor.is_saving) return;

    const current = JSON.stringify({
      name: editor.name,
      category: editor.category,
      content: editor.content,
    });

    if (editor_baseline !== "" && current !== editor_baseline) {
      set_confirm_discard_open(true);

      return;
    }

    close_editor();
  };

  const name_invalid = editor.show_validation && !editor.name.trim();
  const content_invalid = editor.show_validation && !editor.content.trim();

  const handle_save = async () => {
    if (!editor.name.trim() || !editor.content.trim()) {
      set_editor((prev) => ({ ...prev, show_validation: true }));

      return;
    }

    set_editor_error(null);
    set_editor((prev) => ({ ...prev, is_saving: true }));

    const form_data: TemplateFormData = {
      name: editor.name.trim(),
      category: editor.category.trim() || t("common.general"),
      content: editor.content.trim(),
    };

    if (editor.editing_id) {
      const response = await update_template(editor.editing_id, form_data);

      if (response.error) {
        set_editor_error(response.error);
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
        set_editor_error(response.error);
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
    <IslandSections>
      <IslandSection
        bare
        description={t("settings.email_templates_description")}
        icon={<DocumentDuplicateIcon />}
        title={t("settings.email_templates_title")}
      >
        {has_unreadable && (
          <p className="text-[12px] text-txt-muted">
            {t("settings.unreadable_entries_notice")}
          </p>
        )}

        {error && (
          <Island padding="sm" tone="danger">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-txt-primary">{error}</span>
              <IslandIconButton
                label={t("common.close")}
                size="sm"
                onClick={() => set_error(null)}
              >
                <XMarkIcon className="w-4 h-4" />
              </IslandIconButton>
            </div>
          </Island>
        )}
      </IslandSection>

      <IslandSection
        bare
        title={t("settings.your_templates", {
          count: templates.length,
        })}
        trailing={
          <Button
            disabled={editor.is_open}
            variant="depth"
            onClick={open_create_editor}
          >
            <PlusIcon className="w-4 h-4" />
            {t("settings.add_template")}
          </Button>
        }
      >
        {templates.length === 0 && !editor.is_open && load_failed ? (
          <LoadFailedNotice on_retry={() => void load_templates()} />
        ) : templates.length === 0 && !editor.is_open ? (
          <IslandEmpty
            icon={<PencilIcon />}
            title={t("settings.no_templates_yet")}
          />
        ) : (
          <Island divided>
            {templates.map((template) => (
              <IslandRow
                key={template.id}
                description={
                  <span className="line-clamp-1" dir="auto">
                    {template.content}
                  </span>
                }
                label={
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate" dir="auto">
                      {template.name}
                    </span>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--text-primary)_7%,transparent)] text-txt-muted flex-shrink-0">
                      {template.category || t("common.general")}
                    </span>
                  </span>
                }
                trailing={
                  <span className="flex items-center gap-1">
                    <IslandIconButton
                      label={t("common.edit")}
                      size="sm"
                      title={t("common.edit")}
                      onClick={() => open_edit_editor(template)}
                    >
                      <PencilIcon className="w-4 h-4" />
                    </IslandIconButton>
                    <IslandIconButton
                      className="text-red-500 hover:text-red-500"
                      disabled={deleting_id === template.id}
                      label={t("common.delete")}
                      size="sm"
                      title={t("common.delete")}
                      onClick={() => set_confirm_delete_id(template.id)}
                    >
                      {deleting_id === template.id ? (
                        <ButtonSpinner />
                      ) : (
                        <TrashIcon className="w-4 h-4" />
                      )}
                    </IslandIconButton>
                  </span>
                }
              />
            ))}
          </Island>
        )}
      </IslandSection>

      <Modal
        is_open={editor.is_open}
        on_close={request_close_editor}
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
          {editor_error && (
            <p
              className="p-3 rounded-lg text-sm bg-red-500/10 text-red-700 dark:text-red-300"
              role="alert"
            >
              {editor_error}
            </p>
          )}
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
                aria-describedby={
                  name_invalid ? "template-name-error" : undefined
                }
                aria-invalid={name_invalid}
                className="w-full"
                id="template-name"
                maxLength={MAX_TEMPLATE_NAME_LENGTH}
                placeholder={t("settings.template_name_placeholder")}
                status={name_invalid ? "error" : "default"}
                value={editor.name}
                onChange={(e) =>
                  set_editor((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
              />
              {name_invalid && (
                <p
                  className="text-xs mt-1.5 text-red-500"
                  id="template-name-error"
                >
                  {t("settings.template_name_required")}
                </p>
              )}
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
                maxLength={MAX_TEMPLATE_CATEGORY_LENGTH}
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
              aria-describedby={
                content_invalid ? "template-content-error" : undefined
              }
              aria-invalid={content_invalid}
              className={`aster_input resize-none !py-3 font-mono ${
                content_invalid ? "aster_input_error" : ""
              }`}
              id="template-content"
              maxLength={MAX_TEMPLATE_CONTENT_LENGTH}
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
            {content_invalid && (
              <p
                className="text-xs mt-1.5 text-red-500"
                id="template-content-error"
              >
                {t("settings.template_content_required")}
              </p>
            )}
            <p className="text-xs mt-1.5 text-txt-muted">
              {t("settings.placeholders_hint")}
            </p>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            disabled={editor.is_saving}
            variant="ghost"
            onClick={request_close_editor}
          >
            {t("common.cancel")}
          </Button>
          <Button
            disabled={editor.is_saving}
            is_loading={editor.is_saving}
            variant="depth"
            onClick={handle_save}
          >
            {editor.editing_id
              ? t("settings.update_template")
              : t("settings.create_template")}
          </Button>
        </ModalFooter>
      </Modal>

      <ConfirmationModal
        confirm_text={t("mail.discard")}
        is_open={confirm_discard_open}
        message={t("common.discard_changes_message")}
        on_cancel={() => set_confirm_discard_open(false)}
        on_confirm={close_editor}
        title={t("common.discard_changes_title")}
        variant="danger"
      />

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
    </IslandSections>
  );
}
