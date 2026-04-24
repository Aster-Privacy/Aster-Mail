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
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  XMarkIcon,
  PhotoIcon,
  PencilSquareIcon,
  Bars3BottomLeftIcon,
} from "@heroicons/react/24/outline";
import { Button, Radio } from "@aster/ui";

import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { use_preferences } from "@/contexts/preferences_context";
import { use_signatures } from "@/contexts/signatures_context";
import { use_editor } from "@/hooks/use_editor";
import { sanitize_compose_paste } from "@/lib/html_sanitizer";
import {
  list_signatures,
  create_signature,
  update_signature,
  delete_signature,
  set_default_signature,
  type DecryptedSignature,
  type SignatureFormData,
} from "@/services/api/signatures";
import { fetch_my_badges } from "@/services/api/user";
import { use_plan_limits } from "@/hooks/use_plan_limits";

function escape_html(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const IMAGE_MAGIC_BYTES: Record<string, number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/gif": [0x47, 0x49, 0x46],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
};

function validate_image_magic_bytes(
  data: ArrayBuffer,
  mime_type: string,
): boolean {
  const expected = IMAGE_MAGIC_BYTES[mime_type];

  if (!expected) return false;

  const bytes = new Uint8Array(data.slice(0, expected.length));

  return expected.every((b, i) => bytes[i] === b);
}

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

type SignatureMode = "disabled" | "auto" | "manual";

interface EditorState {
  is_open: boolean;
  editing_id: string | null;
  name: string;
  content: string;
  is_saving: boolean;
}

const initial_editor_state: EditorState = {
  is_open: false,
  editing_id: null,
  name: "",
  content: "",
  is_saving: false,
};

export function SignatureSection() {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { preferences, update_preference } = use_preferences();
  const { reload_signatures: reload_context_signatures } = use_signatures();
  const { limits } = use_plan_limits();
  const is_paid_plan = !!limits && limits.plan_code !== "free";
  const [signatures, set_signatures] = useState<DecryptedSignature[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [is_initial_load, set_is_initial_load] = useState(true);
  const [has_badges, set_has_badges] = useState(false);

  useEffect(() => {
    fetch_my_badges().then((r) => {
      if (r.data && r.data.length > 0) set_has_badges(true);
    });
  }, []);
  const [error, set_error] = useState<string | null>(null);
  const [editor, set_editor] = useState<EditorState>(initial_editor_state);
  const [deleting_id, set_deleting_id] = useState<string | null>(null);
  const [confirm_delete_id, set_confirm_delete_id] = useState<string | null>(
    null,
  );
  const editor_div_ref = useRef<HTMLDivElement>(null);
  const image_input_ref = useRef<HTMLInputElement>(null);

  const rich_editor = use_editor({
    editor_ref: editor_div_ref,
    on_change: (html: string) => {
      set_editor((prev) => ({ ...prev, content: html }));
    },
    enable_rich_paste: true,
    enable_keyboard_shortcuts: true,
  });

  const handle_image_upload = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/") || file.type === "image/svg+xml")
        return;
      if (file.size > MAX_IMAGE_SIZE) return;

      const reader = new FileReader();

      reader.onload = () => {
        const data_url = reader.result as string;
        const arr_buf = Uint8Array.from(
          atob(data_url.split(",")[1] || ""),
          (c) => c.charCodeAt(0),
        ).buffer;

        if (!validate_image_magic_bytes(arr_buf, file.type)) return;

        rich_editor.insert_html(
          `<img src="${data_url}" style="max-width: min(100%, 480px); height: auto; border-radius: 6px; display: block; margin: 8px 0;" />`,
        );
      };
      reader.readAsDataURL(file);
    },
    [rich_editor],
  );
  const [local_mode, set_local_mode] = useState<SignatureMode>(
    (preferences.signature_mode as SignatureMode) || "auto",
  );
  const [local_placement, set_local_placement] = useState<"below" | "above">(
    preferences.signature_placement || "below",
  );

  useEffect(() => {
    set_local_mode((preferences.signature_mode as SignatureMode) || "auto");
  }, [preferences.signature_mode]);

  useEffect(() => {
    set_local_placement(preferences.signature_placement || "below");
  }, [preferences.signature_placement]);

  const load_signatures = useCallback(async () => {
    set_is_loading(true);
    set_error(null);

    const response = await list_signatures();

    if (response.error) {
      set_error(response.error);
    } else if (response.data) {
      set_signatures(response.data.signatures);
    }

    set_is_loading(false);
    set_is_initial_load(false);
  }, []);

  useEffect(() => {
    load_signatures();
  }, [load_signatures]);

  const handle_mode_change = (mode: SignatureMode) => {
    set_local_mode(mode);
    update_preference("signature_mode", mode, true);
  };

  const handle_placement_change = (placement: "below" | "above") => {
    set_local_placement(placement);
    update_preference("signature_placement", placement, true);
  };

  const open_create_editor = () => {
    set_editor({
      is_open: true,
      editing_id: null,
      name: "",
      content: "",
      is_saving: false,
    });
  };

  const open_edit_editor = (signature: DecryptedSignature) => {
    set_editor({
      is_open: true,
      editing_id: signature.id,
      name: signature.name,
      content: signature.content,
      is_saving: false,
    });
    requestAnimationFrame(() => {
      if (editor_div_ref.current) {
        const html = signature.is_html
          ? signature.content
          : escape_html(signature.content).replace(/\n/g, "<br>");

        rich_editor.set_html(html);
      }
    });
  };

  const close_editor = () => {
    set_editor(initial_editor_state);
  };

  const handle_save = async () => {
    const html_content = rich_editor.get_html();

    if (!editor.name.trim() || !html_content.trim()) return;

    set_editor((prev) => ({ ...prev, is_saving: true }));

    const temp = document.createElement("div");

    temp.innerHTML = html_content.trim();
    const has_rich_content =
      temp.querySelector("img, a, b, strong, i, em, u, table, hr") !== null ||
      temp.querySelector("[style]") !== null;

    temp.querySelectorAll("br").forEach((br) => {
      br.replaceWith("\n");
    });
    temp.querySelectorAll("div, p").forEach((block) => {
      block.before("\n");
      block.replaceWith(...block.childNodes);
    });
    const plain_text = (temp.textContent || "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const form_data: SignatureFormData = {
      name: editor.name.trim(),
      content: has_rich_content ? html_content.trim() : plain_text,
      is_html: has_rich_content,
    };

    if (editor.editing_id) {
      const response = await update_signature(editor.editing_id, form_data);

      if (response.error) {
        set_error(response.error);
        set_editor((prev) => ({ ...prev, is_saving: false }));

        return;
      }

      set_signatures((prev) =>
        prev.map((sig) =>
          sig.id === editor.editing_id
            ? {
                ...sig,
                name: form_data.name,
                content: form_data.content,
                is_html: has_rich_content,
              }
            : sig,
        ),
      );
      reload_context_signatures();
    } else {
      const is_first = signatures.length === 0;
      const response = await create_signature(form_data, is_first);

      if (response.error) {
        set_error(response.error);
        set_editor((prev) => ({ ...prev, is_saving: false }));

        return;
      }

      if (response.data) {
        const new_signature: DecryptedSignature = {
          id: response.data.id,
          name: form_data.name,
          content: form_data.content,
          is_default: is_first,
          is_html: has_rich_content,
          created_at: response.data.created_at,
          updated_at: response.data.created_at,
        };

        set_signatures((prev) => [...prev, new_signature]);
        reload_context_signatures();
      }
    }

    close_editor();
  };

  const handle_delete = async (id: string) => {
    set_deleting_id(id);
    const response = await delete_signature(id);

    if (response.error) {
      set_error(response.error);
    } else {
      set_signatures((prev) => {
        const filtered = prev.filter((sig) => sig.id !== id);

        if (filtered.length > 0 && !filtered.some((s) => s.is_default)) {
          filtered[0].is_default = true;
        }

        return filtered;
      });
      reload_context_signatures();
    }

    set_deleting_id(null);
  };

  const handle_set_default = async (id: string) => {
    set_signatures((prev) =>
      prev.map((sig) => ({ ...sig, is_default: sig.id === id })),
    );
    reload_context_signatures();

    const response = await set_default_signature(id);

    if (response.error) {
      set_error(response.error);
      load_signatures();
    }
  };

  if (is_initial_load && is_loading && signatures.length === 0) {
    return <SettingsSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <PencilSquareIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.email_signature_title")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-3 text-txt-muted">
          {t("settings.email_signature_description")}
        </p>

        <div className="mb-3">
          <p className="text-sm font-medium mb-3 text-txt-primary">
            {t("settings.signature_mode")}
          </p>
          <div className="inline-flex p-1 rounded-lg bg-surf-secondary">
            {[
              { value: "disabled", label: t("settings.signature_off") },
              { value: "auto", label: t("settings.signature_auto") },
              { value: "manual", label: t("settings.signature_manual") },
            ].map((option) => {
              const is_selected = local_mode === option.value;

              return (
                <button
                  key={option.value}
                  className="relative px-5 py-2 text-sm font-medium rounded-md transition-all duration-200 outline-none"
                  style={{
                    backgroundColor: is_selected
                      ? "var(--bg-primary)"
                      : "transparent",
                    color: is_selected
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                    boxShadow: is_selected
                      ? "0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)"
                      : "none",
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handle_mode_change(option.value as SignatureMode);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs mt-3 text-txt-muted">
            {local_mode === "disabled" &&
              t("settings.signature_off_description")}
            {local_mode === "auto" && t("settings.signature_auto_description")}
            {local_mode === "manual" &&
              t("settings.signature_manual_description")}
          </p>
        </div>

        {has_badges && (
          <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-edge-secondary mb-3">
            <div className="flex-1">
              <p className="text-sm text-txt-primary">
                {t("settings.show_badges_in_signature")}
              </p>
              <p className="text-xs text-txt-muted mt-0.5">
                {t("settings.show_badges_in_signature_description")}
              </p>
            </div>
            <button
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                preferences.show_badges_in_signature
                  ? "bg-blue-500"
                  : "bg-zinc-600"
              }`}
              type="button"
              onClick={() =>
                update_preference(
                  "show_badges_in_signature",
                  !preferences.show_badges_in_signature,
                  true,
                )
              }
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  preferences.show_badges_in_signature
                    ? "translate-x-4"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>
        )}

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
            <Button
              className="p-1"
              size="icon"
              variant="ghost"
              onClick={() => set_error(null)}
            >
              <XMarkIcon className="w-4 h-4" />
            </Button>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-txt-primary">
              {t("settings.your_signatures", {
                count: is_loading ? "..." : String(signatures.length),
              })}
            </h4>
            <Button
              disabled={editor.is_open}
              size="md"
              variant="depth"
              onClick={open_create_editor}
            >
              <PlusIcon className="w-4 h-4" />
              {t("settings.add_signature")}
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
                  ? t("settings.update_signature")
                  : t("settings.add_signature")}
              </ModalTitle>
            </ModalHeader>
            <ModalBody className="space-y-4">
              <div>
                <label
                  className="text-sm font-medium block mb-2 text-txt-primary"
                  htmlFor="signature-name"
                >
                  {t("settings.signature_name")}
                </label>
                <Input
                  autoFocus
                  id="signature-name"
                  placeholder={t("settings.signature_name_placeholder")}
                  type="text"
                  value={editor.name}
                  onChange={(e) =>
                    set_editor((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </div>

              <div>
                <label
                  className="text-sm font-medium block mb-2 text-txt-primary"
                  htmlFor="signature-content"
                >
                  {t("settings.signature_content")}
                </label>
                <div className="rounded-md border border-input-border bg-input-bg overflow-hidden">
                  <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-input-border">
                    <button
                      className={`p-1.5 rounded text-xs font-bold transition-colors ${rich_editor.format_state.active_formats.has("bold") ? "bg-surf-hover text-txt-primary" : "text-txt-secondary hover:bg-surf-hover"}`}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        rich_editor.toggle_bold();
                      }}
                    >
                      B
                    </button>
                    <button
                      className={`p-1.5 rounded text-xs italic transition-colors ${rich_editor.format_state.active_formats.has("italic") ? "bg-surf-hover text-txt-primary" : "text-txt-secondary hover:bg-surf-hover"}`}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        rich_editor.toggle_italic();
                      }}
                    >
                      I
                    </button>
                    <button
                      className={`p-1.5 rounded text-xs underline transition-colors ${rich_editor.format_state.active_formats.has("underline") ? "bg-surf-hover text-txt-primary" : "text-txt-secondary hover:bg-surf-hover"}`}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        rich_editor.toggle_underline();
                      }}
                    >
                      U
                    </button>
                    <div className="w-px h-5 mx-1 bg-edge-secondary" />
                    <button
                      className="p-1.5 rounded text-txt-secondary hover:bg-surf-hover transition-colors"
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        image_input_ref.current?.click();
                      }}
                    >
                      <PhotoIcon className="w-4 h-4" />
                    </button>
                    <input
                      ref={image_input_ref}
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      className="hidden"
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];

                        if (file) handle_image_upload(file);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <div
                    ref={editor_div_ref}
                    contentEditable
                    className="px-3 py-2 text-sm min-h-[150px] max-h-[300px] overflow-y-auto text-txt-primary outline-none [&_img]:rounded-md [&_img]:max-w-full"
                    onDragOver={rich_editor.handle_drag_over}
                    onDrop={rich_editor.handle_drop}
                    onInput={rich_editor.handle_input}
                    onPaste={rich_editor.handle_paste}
                  />
                </div>
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
                  !rich_editor.get_html().trim() ||
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
                  t("settings.update_signature")
                ) : (
                  t("settings.create_signature")
                )}
              </Button>
            </ModalFooter>
          </Modal>

          {signatures.length === 0 && !editor.is_open ? (
            <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
              <PencilIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
              <p className="text-sm text-txt-muted">
                {t("settings.no_signatures_yet")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {signatures.map((signature) => (
                  <motion.div
                    key={signature.id}
                    animate={{ opacity: 1 }}
                    className="p-4 rounded-lg bg-surf-secondary border border-edge-primary"
                    exit={{ opacity: 0 }}
                    initial={reduce_motion ? false : { opacity: 0 }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h5 className="text-sm font-semibold text-txt-primary">
                          {signature.name}
                        </h5>
                        {signature.is_default && (
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
                            style={{
                              color: "white",
                              background:
                                "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
                              boxShadow:
                                "0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                            }}
                          >
                            {t("settings.default_badge")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {!signature.is_default && (
                          <Button
                            size="md"
                            variant="outline"
                            onClick={() => handle_set_default(signature.id)}
                          >
                            {t("common.set_as_default")}
                          </Button>
                        )}
                        <Button
                          size="icon"
                          title={t("common.edit")}
                          variant="ghost"
                          onClick={() => open_edit_editor(signature)}
                        >
                          <PencilIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
                          disabled={deleting_id === signature.id}
                          size="icon"
                          title={t("common.delete")}
                          variant="ghost"
                          onClick={() => set_confirm_delete_id(signature.id)}
                        >
                          {deleting_id === signature.id ? (
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
                    </div>
                    <div
                      dangerouslySetInnerHTML={{
                        __html: signature.is_html
                          ? sanitize_compose_paste(signature.content)
                          : escape_html(signature.content).replace(
                              /\n/g,
                              "<br>",
                            ),
                      }}
                      className="p-3 rounded-md text-xs leading-relaxed bg-surf-primary text-txt-secondary border border-edge-primary [&_img]:max-w-full [&_img]:rounded-md [&_img]:h-auto"
                    />
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
        message={t("settings.delete_signature_message")}
        on_cancel={() => set_confirm_delete_id(null)}
        on_confirm={() => {
          if (confirm_delete_id) {
            handle_delete(confirm_delete_id);
          }
          set_confirm_delete_id(null);
        }}
        title={t("settings.delete_signature_title")}
        variant="danger"
      />

      <div className="pt-2">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <Bars3BottomLeftIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.signature_placement")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-4 text-txt-muted">
          {t("settings.signature_placement_description")}
        </p>

        <div className="space-y-2">
          {[
            {
              value: "below",
              label: t("settings.below_quoted_text"),
              description: t("settings.below_quoted_description"),
            },
            {
              value: "above",
              label: t("settings.above_quoted_text"),
              description: t("settings.above_quoted_description"),
            },
          ].map((option) => {
            const is_selected = local_placement === option.value;

            return (
              <button
                key={option.value}
                className="w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left"
                style={{
                  backgroundColor: is_selected
                    ? "var(--bg-selected)"
                    : "var(--bg-tertiary)",
                  border: is_selected
                    ? "1px solid var(--accent-color)"
                    : "1px solid var(--border-secondary)",
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handle_placement_change(option.value as "below" | "above");
                }}
              >
                <div>
                  <p className="text-sm font-medium text-txt-primary">
                    {option.label}
                  </p>
                  <p className="text-xs mt-0.5 text-txt-muted">
                    {option.description}
                  </p>
                </div>
                <span className="pointer-events-none flex-shrink-0 ml-3">
                  <Radio readOnly checked={is_selected} />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-2">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary">
            {t("settings.show_aster_branding")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-txt-muted">
              {t("settings.show_aster_branding_description")}
            </p>
            {!is_paid_plan && (
              <p className="text-xs text-txt-muted mt-1">
                {t("settings.show_aster_branding_free_note")}
              </p>
            )}
          </div>
          <button
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              !is_paid_plan ? "cursor-default opacity-50" : "cursor-pointer"
            } ${
              preferences.show_aster_branding ? "bg-blue-500" : "bg-zinc-600"
            }`}
            type="button"
            onClick={() => {
              if (!is_paid_plan) return;
              update_preference(
                "show_aster_branding",
                !preferences.show_aster_branding,
                true,
              );
            }}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                preferences.show_aster_branding
                  ? "translate-x-4"
                  : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
