import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

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
  const { reload_templates: reload_context_templates } = use_templates();
  const [templates, set_templates] = useState<DecryptedTemplate[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [editor, set_editor] = useState<EditorState>(initial_editor_state);
  const [deleting_id, set_deleting_id] = useState<string | null>(null);
  const [name_focused, set_name_focused] = useState(false);
  const [category_focused, set_category_focused] = useState(false);
  const [content_focused, set_content_focused] = useState(false);

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
      category: editor.category.trim() || "General",
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

  const grouped_templates = templates.reduce(
    (acc, template) => {
      const category = template.category || "General";

      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(template);

      return acc;
    },
    {} as Record<string, DecryptedTemplate[]>,
  );

  return (
    <div className="space-y-6">
      <div>
        <h3
          className="text-base font-semibold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Email Templates
        </h3>
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          Create and manage reusable email templates. All templates are
          end-to-end encrypted.
        </p>

        {error && (
          <div
            className="mb-4 p-3 rounded-lg text-sm flex items-center justify-between"
            style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "#ef4444",
              border: "1px solid rgba(239, 68, 68, 0.2)",
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
            <h4
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Your Templates ({is_loading ? "..." : templates.length})
            </h4>
            <button
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-white rounded-lg transition-all duration-150 active:scale-[0.98] hover:brightness-105 disabled:opacity-50"
              disabled={editor.is_open}
              style={{
                background:
                  "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderBottom: "1px solid rgba(0, 0, 0, 0.15)",
              }}
              onClick={open_create_editor}
            >
              <PlusIcon className="w-4 h-4" />
              Add Template
            </button>
          </div>

          <AnimatePresence>
            {editor.is_open && (
              <motion.div
                animate={{ opacity: 1 }}
                className="p-4 rounded-lg space-y-4"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  border: "1px solid var(--border-secondary)",
                }}
                transition={{ duration: 0.15 }}
              >
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      className="text-sm font-medium block mb-2"
                      htmlFor="template-name"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Template Name
                    </label>
                    <input
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      className="w-full px-3 py-2 text-sm rounded-lg outline-none transition-colors"
                      id="template-name"
                      placeholder="e.g., Meeting Request"
                      style={{
                        backgroundColor: "var(--input-bg)",
                        border: name_focused
                          ? "1px solid var(--accent-color)"
                          : "1px solid transparent",
                        color: "var(--text-primary)",
                      }}
                      type="text"
                      value={editor.name}
                      onBlur={() => set_name_focused(false)}
                      onChange={(e) =>
                        set_editor((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      onFocus={() => set_name_focused(true)}
                    />
                  </div>

                  <div>
                    <label
                      className="text-sm font-medium block mb-2"
                      htmlFor="template-category"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Category
                    </label>
                    <input
                      className="w-full px-3 py-2 text-sm rounded-lg outline-none transition-colors"
                      id="template-category"
                      placeholder="e.g., Work, Personal"
                      style={{
                        backgroundColor: "var(--input-bg)",
                        border: category_focused
                          ? "1px solid var(--accent-color)"
                          : "1px solid transparent",
                        color: "var(--text-primary)",
                      }}
                      type="text"
                      value={editor.category}
                      onBlur={() => set_category_focused(false)}
                      onChange={(e) =>
                        set_editor((prev) => ({
                          ...prev,
                          category: e.target.value,
                        }))
                      }
                      onFocus={() => set_category_focused(true)}
                    />
                  </div>
                </div>

                <div>
                  <label
                    className="text-sm font-medium block mb-2"
                    htmlFor="template-content"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Template Content
                  </label>
                  <textarea
                    className="w-full px-3 py-2 text-sm rounded-lg resize-none outline-none transition-colors font-mono"
                    id="template-content"
                    placeholder="Hi [Name],&#10;&#10;I would like to schedule a meeting...&#10;&#10;Best regards"
                    rows={8}
                    style={{
                      backgroundColor: "var(--input-bg)",
                      border: content_focused
                        ? "1px solid var(--accent-color)"
                        : "1px solid transparent",
                      color: "var(--text-primary)",
                    }}
                    value={editor.content}
                    onBlur={() => set_content_focused(false)}
                    onChange={(e) =>
                      set_editor((prev) => ({
                        ...prev,
                        content: e.target.value,
                      }))
                    }
                    onFocus={() => set_content_focused(true)}
                  />
                  <p
                    className="text-xs mt-1.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Use placeholders like [Name], [Date], etc. to customize when
                    using.
                  </p>
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    className="px-4 py-2 text-sm font-medium rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
                    disabled={editor.is_saving}
                    style={{ color: "var(--text-secondary)" }}
                    onClick={close_editor}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={
                      !editor.name.trim() ||
                      !editor.content.trim() ||
                      editor.is_saving
                    }
                    style={{ backgroundColor: "var(--accent-color)" }}
                    onClick={handle_save}
                  >
                    {editor.is_saving
                      ? "Saving..."
                      : editor.editing_id
                        ? "Update Template"
                        : "Create Template"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {templates.length === 0 && !editor.is_open ? (
            <div
              className="text-center py-12 rounded-lg"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-secondary)",
              }}
            >
              <div
                className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <PencilIcon
                  className="w-6 h-6"
                  style={{ color: "var(--text-muted)" }}
                />
              </div>
              <p
                className="text-sm font-medium mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                No templates yet
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Create your first template to speed up email composition.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped_templates).map(
                ([category, category_templates]) => (
                  <div key={category}>
                    <h5
                      className="text-xs font-semibold uppercase tracking-wider mb-2 px-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {category}
                    </h5>
                    <div className="space-y-2">
                      <AnimatePresence>
                        {category_templates.map((template) => (
                          <motion.div
                            key={template.id}
                            animate={{ opacity: 1 }}
                            className="p-4 rounded-lg"
                            exit={{ opacity: 0 }}
                            initial={{ opacity: 0 }}
                            style={{
                              backgroundColor: "var(--bg-tertiary)",
                              border: "1px solid var(--border-secondary)",
                            }}
                            transition={{ duration: 0.15 }}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <h5
                                className="text-sm font-semibold"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {template.name}
                              </h5>
                              <div className="flex items-center gap-1.5">
                                <button
                                  className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-hover)]"
                                  style={{ color: "var(--text-muted)" }}
                                  title="Edit"
                                  onClick={() => open_edit_editor(template)}
                                >
                                  <PencilIcon className="w-4 h-4" />
                                </button>
                                <button
                                  className="p-1.5 rounded-md transition-colors hover:bg-red-500/10 disabled:opacity-50"
                                  disabled={deleting_id === template.id}
                                  style={{ color: "#ef4444" }}
                                  title="Delete"
                                  onClick={() => handle_delete(template.id)}
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
                                </button>
                              </div>
                            </div>
                            <div
                              className="p-3 rounded-md font-mono text-xs leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto"
                              style={{
                                backgroundColor: "var(--bg-primary)",
                                color: "var(--text-secondary)",
                                border: "1px solid var(--border-primary)",
                              }}
                            >
                              {template.content}
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
