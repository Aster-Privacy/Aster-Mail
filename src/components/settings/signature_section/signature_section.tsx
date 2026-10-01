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
import type { SignaturePlacement } from "@/services/api/signatures";

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
import {
  Button,
  Island,
  IslandRow,
  IslandSection,
  IslandSections,
  SettingControlRow,
  SettingToggleRow,
  UpgradeBtn,
} from "@aster/ui";

import { FmtButton, FmtDivider, SignatureMode, escape_html } from "./helpers";
import { use_signature_section } from "./use_signature_section";

import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import { ButtonSpinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { LinkDialog } from "@/components/compose/link_dialog";
import { FontSizeSelect } from "@/components/compose/compose_toolbar/font_size";
import { ColorPickerPopover } from "@/components/compose/compose_toolbar/color_picker";
import { use_frozen_selection } from "@/components/compose/compose_toolbar/shared";
import { sanitize_compose_paste } from "@/lib/html_sanitizer";
import { prompt_upgrade } from "@/components/settings/aliases/feature_lock";
import { Spinner } from "@/components/ui/spinner";

export function SignatureSection() {
  const {
    t,
    reduce_motion,
    preferences,
    update_preference,
    sender_aliases,
    is_paid_plan,
    signatures,
    is_loading,
    is_initial_load,
    has_badges,
    error,
    set_error,
    editor_error,
    has_unreadable,
    editor,
    set_editor,
    deleting_id,
    confirm_delete_id,
    set_confirm_delete_id,
    editor_div_ref,
    image_input_ref,
    show_link_dialog,
    set_show_link_dialog,
    selected_text_for_link,
    rich_editor,
    name_invalid,
    content_invalid,
    handle_image_upload,
    handle_insert_horizontal_rule,
    handle_open_link_dialog,
    local_mode,
    local_placement,
    handle_mode_change,
    handle_placement_change,
    open_create_editor,
    open_edit_editor,
    close_editor,
    request_close_editor,
    confirm_discard_open,
    set_confirm_discard_open,
    handle_save,
    handle_delete,
    handle_set_default,
  } = use_signature_section();

  const { freeze_selection, apply_with_frozen_selection } =
    use_frozen_selection(rich_editor);

  if (is_initial_load && is_loading && signatures.length === 0) {
    return <SettingsSkeleton variant="list" />;
  }

  return (
    <IslandSections>
      <IslandSection
        bare
        description={t("settings.email_signature_description")}
        icon={<PencilSquareIcon />}
        title={t("settings.email_signature_title")}
      >
        <Island>
          <SettingControlRow
            control={
              <Select
                value={local_mode}
                onValueChange={(value) =>
                  handle_mode_change(value as SignatureMode)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disabled">
                    {t("settings.signature_off")}
                  </SelectItem>
                  <SelectItem value="auto">
                    {t("settings.signature_auto")}
                  </SelectItem>
                  <SelectItem value="manual">
                    {t("settings.signature_manual")}
                  </SelectItem>
                </SelectContent>
              </Select>
            }
            description={
              <>
                {local_mode === "disabled" &&
                  t("settings.signature_off_description")}
                {local_mode === "auto" &&
                  t("settings.signature_auto_description")}
                {local_mode === "manual" &&
                  t("settings.signature_manual_description")}
              </>
            }
            label={t("settings.signature_mode")}
          />

          {has_badges && (
            <SettingToggleRow
              checked={preferences.show_badges_in_signature}
              description={t("settings.show_badges_in_signature_description")}
              label={t("settings.show_badges_in_signature")}
              on_change={(checked) =>
                update_preference("show_badges_in_signature", checked, true)
              }
            />
          )}
        </Island>

        {has_unreadable && (
          <p className="px-1 text-[12px] text-txt-muted">
            {t("settings.unreadable_entries_notice")}
          </p>
        )}

        {error && (
          <div
            className="p-3 rounded-lg text-sm flex items-center justify-between"
            style={{
              backgroundColor: "#dc2626",
              color: "#fff",
              border: "none",
            }}
          >
            <span>{error}</span>
            <Button
              aria-label={t("common.close")}
              className="p-1"
              size="icon"
              variant="ghost"
              onClick={() => set_error(null)}
            >
              <XMarkIcon className="w-4 h-4" />
            </Button>
          </div>
        )}

        <IslandSection
          bare
          title={t("settings.your_signatures", {
            count: is_loading ? "..." : String(signatures.length),
          })}
          trailing={
            <Button
              disabled={editor.is_open}
              variant="depth"
              onClick={open_create_editor}
            >
              <PlusIcon className="w-4 h-4" />
              {t("settings.add_signature")}
            </Button>
          }
        >
          <Modal
            is_open={editor.is_open}
            on_close={request_close_editor}
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
              {editor_error && (
                <p
                  className="p-3 rounded-lg text-sm bg-red-500/10 text-red-700 dark:text-red-300"
                  role="alert"
                >
                  {editor_error}
                </p>
              )}
              <div>
                <label
                  className="text-sm font-medium block mb-2 text-txt-primary"
                  htmlFor="signature-name"
                >
                  {t("settings.signature_name")}
                </label>
                <Input
                  autoFocus
                  aria-describedby={
                    name_invalid ? "signature-name-error" : undefined
                  }
                  aria-invalid={name_invalid}
                  id="signature-name"
                  placeholder={t("settings.signature_name_placeholder")}
                  status={name_invalid ? "error" : "default"}
                  type="text"
                  value={editor.name}
                  onChange={(e) =>
                    set_editor((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
                {name_invalid && (
                  <p
                    className="text-xs mt-1.5 text-red-500"
                    id="signature-name-error"
                  >
                    {t("settings.signature_name_required")}
                  </p>
                )}
              </div>

              <div>
                <span className="text-sm font-medium block mb-2 text-txt-primary">
                  {t("settings.signature_alias")}
                </span>
                <Select
                  value={editor.alias_id ?? "__default__"}
                  onValueChange={(value) =>
                    set_editor((prev) => ({
                      ...prev,
                      alias_id: value === "__default__" ? null : value,
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">
                      {t("settings.signature_alias_default")}
                    </SelectItem>
                    {sender_aliases.map((alias) => {
                      const in_use = signatures.some(
                        (s) =>
                          s.alias_id === alias.id && s.id !== editor.editing_id,
                      );

                      return (
                        <SelectItem
                          key={alias.id}
                          disabled={in_use}
                          value={alias.id}
                        >
                          {alias.email}
                          {in_use
                            ? ` (${t("settings.signature_alias_in_use")})`
                            : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <span className="text-sm font-medium block mb-2 text-txt-primary">
                  {t("settings.signature_placement")}
                </span>
                <Select
                  value={editor.placement ?? "__inherit__"}
                  onValueChange={(value) =>
                    set_editor((prev) => ({
                      ...prev,
                      placement:
                        value === "__inherit__"
                          ? null
                          : (value as SignaturePlacement),
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__inherit__">
                      {t("settings.signature_placement_inherit")}
                    </SelectItem>
                    <SelectItem value="below">
                      {t("settings.below_quoted_text")}
                    </SelectItem>
                    <SelectItem value="above">
                      {t("settings.above_quoted_text")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <span
                  className="text-sm font-medium block mb-2 text-txt-primary"
                  id="signature-content-label"
                >
                  {t("settings.signature_content")}
                </span>
                <div
                  className={`rounded-md border bg-input-bg overflow-hidden ${
                    content_invalid ? "border-red-500" : "border-input-border"
                  }`}
                >
                  <div
                    aria-label={t("mail.text_formatting")}
                    className="flex items-center flex-wrap gap-0.5 px-2 py-1.5 border-b border-input-border"
                    role="toolbar"
                  >
                    <FontSizeSelect
                      font_size={rich_editor.format_state.current_font_size}
                      on_before_open={freeze_selection}
                      on_change={(size) =>
                        apply_with_frozen_selection(() =>
                          rich_editor.set_font_size(size),
                        )
                      }
                    />

                    <ColorPickerPopover
                      bg_color={rich_editor.format_state.current_bg_color}
                      font_color={rich_editor.format_state.current_font_color}
                      on_before_open={freeze_selection}
                      on_bg_color_change={(color) =>
                        apply_with_frozen_selection(() =>
                          rich_editor.set_background_color(color),
                        )
                      }
                      on_font_color_change={(color) =>
                        apply_with_frozen_selection(() =>
                          rich_editor.set_font_color(color),
                        )
                      }
                    />

                    <FmtDivider />

                    <FmtButton
                      active={rich_editor.format_state.active_formats.has(
                        "bold",
                      )}
                      title={`${t("mail.bold")} (${rich_editor.is_mac ? "⌘" : "Ctrl"}+B)`}
                      onClick={rich_editor.toggle_bold}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" />
                      </svg>
                    </FmtButton>

                    <FmtButton
                      active={rich_editor.format_state.active_formats.has(
                        "italic",
                      )}
                      title={`${t("mail.italic")} (${rich_editor.is_mac ? "⌘" : "Ctrl"}+I)`}
                      onClick={rich_editor.toggle_italic}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z" />
                      </svg>
                    </FmtButton>

                    <FmtButton
                      active={rich_editor.format_state.active_formats.has(
                        "underline",
                      )}
                      title={`${t("mail.underline")} (${rich_editor.is_mac ? "⌘" : "Ctrl"}+U)`}
                      onClick={rich_editor.toggle_underline}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z" />
                      </svg>
                    </FmtButton>

                    <FmtButton
                      active={rich_editor.format_state.active_formats.has(
                        "strikethrough",
                      )}
                      title={`${t("mail.strikethrough")} (${rich_editor.is_mac ? "⌘" : "Ctrl"}+Shift+X)`}
                      onClick={rich_editor.toggle_strikethrough}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zM3 14h18v-2H3v2z" />
                      </svg>
                    </FmtButton>

                    <FmtDivider />

                    <FmtButton
                      active={rich_editor.format_state.active_formats.has(
                        "unorderedList",
                      )}
                      title={t("mail.bullet_list")}
                      onClick={rich_editor.toggle_unordered_list}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z" />
                      </svg>
                    </FmtButton>

                    <FmtButton
                      active={rich_editor.format_state.active_formats.has(
                        "orderedList",
                      )}
                      title={t("mail.numbered_list")}
                      onClick={rich_editor.toggle_ordered_list}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z" />
                      </svg>
                    </FmtButton>

                    <FmtButton
                      active={rich_editor.format_state.is_in_blockquote}
                      title={`${t("mail.blockquote")} (${rich_editor.is_mac ? "⌘" : "Ctrl"}+Shift+9)`}
                      onClick={rich_editor.insert_blockquote}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" />
                      </svg>
                    </FmtButton>

                    <FmtDivider />

                    <div className="relative">
                      <FmtButton
                        active={show_link_dialog}
                        title={t("mail.insert_link")}
                        onClick={handle_open_link_dialog}
                      >
                        <svg
                          className="w-4 h-4"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
                        </svg>
                      </FmtButton>
                      <LinkDialog
                        on_close={() => set_show_link_dialog(false)}
                        on_insert={(url, text) =>
                          rich_editor.insert_link(url, text)
                        }
                        open={show_link_dialog}
                        selected_text={selected_text_for_link}
                      />
                    </div>

                    <FmtButton
                      title={t("mail.horizontal_rule")}
                      onClick={handle_insert_horizontal_rule}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M4 11h16v2H4z" />
                      </svg>
                    </FmtButton>

                    <FmtDivider />

                    <FmtButton
                      title={t("mail.insert_image")}
                      onClick={() => image_input_ref.current?.click()}
                    >
                      <PhotoIcon className="w-4 h-4" />
                    </FmtButton>
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
                    aria-labelledby="signature-content-label"
                    aria-multiline="true"
                    className="px-3 py-2 text-sm min-h-[150px] max-h-[300px] overflow-y-auto text-txt-primary outline-none [&_img]:max-w-full"
                    role="textbox"
                    onDragOver={rich_editor.handle_drag_over}
                    onDrop={rich_editor.handle_drop}
                    onInput={rich_editor.handle_input}
                    onPaste={rich_editor.handle_paste}
                  />
                </div>
                {content_invalid && (
                  <p className="text-xs mt-1.5 text-red-500">
                    {t("settings.signature_content_required")}
                  </p>
                )}
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
                variant="depth"
                onClick={handle_save}
              >
                {editor.editing_id
                  ? t("settings.update_signature")
                  : t("settings.create_signature")}
                {editor.is_saving && <ButtonSpinner />}
              </Button>
            </ModalFooter>
          </Modal>

          {signatures.length === 0 && !editor.is_open ? (
            <Island className="text-center" padding="lg">
              <PencilIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
              <p className="text-sm text-txt-muted">
                {t("settings.no_signatures_yet")}
              </p>
            </Island>
          ) : (
            <div className="flex flex-col gap-2">
              <AnimatePresence>
                {signatures.map((signature) => (
                  <motion.div
                    key={signature.id}
                    animate={{ opacity: 1 }}
                    className="aster_island aster_island_pad_md"
                    exit={{ opacity: 0 }}
                    initial={reduce_motion ? false : { opacity: 0 }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                      <div className="flex min-w-0 flex-col gap-1">
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
                                  "linear-gradient(180deg, var(--accent-mix-w80, #629bf8) 0%, var(--accent-color) 50%, var(--accent-mix-b80, #2f68c5) 100%)",
                                boxShadow:
                                  "0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                              }}
                            >
                              {t("settings.default_badge")}
                            </span>
                          )}
                        </div>
                        {(() => {
                          const bound = signature.alias_id
                            ? sender_aliases.find(
                                (a) => a.id === signature.alias_id,
                              )
                            : null;
                          const label = bound
                            ? bound.email
                            : t("settings.signature_alias_default");

                          return (
                            <p className="text-xs text-txt-muted">{label}</p>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {!signature.is_default && !signature.alias_id && (
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
                            <Spinner size="sm" />
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
                      data-selectable-region
                      className="p-3 rounded-md text-xs leading-relaxed bg-surf-primary text-txt-secondary [&_img]:max-w-full"
                      tabIndex={-1}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </IslandSection>
      </IslandSection>

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

      <IslandSection
        icon={<Bars3BottomLeftIcon />}
        title={t("settings.signature_placement")}
      >
        <SettingControlRow
          control={
            <Select
              value={local_placement}
              onValueChange={(value) =>
                handle_placement_change(value as "below" | "above")
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="below">
                  {t("settings.below_quoted_text")}
                </SelectItem>
                <SelectItem value="above">
                  {t("settings.above_quoted_text")}
                </SelectItem>
              </SelectContent>
            </Select>
          }
          control_width={220}
          description={
            local_placement === "below"
              ? t("settings.below_quoted_description")
              : t("settings.above_quoted_description")
          }
          label={t("settings.signature_placement_description")}
        />
      </IslandSection>

      <IslandSection>
        <SettingToggleRow
          checked={preferences.show_signature_separator !== false}
          description={t("settings.show_signature_separator_description")}
          label={t("settings.show_signature_separator")}
          on_change={() =>
            update_preference(
              "show_signature_separator",
              preferences.show_signature_separator === false,
              true,
            )
          }
        />
        <IslandRow
          description={
            <>
              {t("settings.show_aster_branding_description")}
              {!is_paid_plan && (
                <span className="block text-xs text-txt-muted mt-1">
                  {t("settings.show_aster_branding_free_note")}
                </span>
              )}
            </>
          }
          label={t("settings.show_aster_branding")}
          toggle={
            is_paid_plan
              ? {
                  checked: preferences.show_aster_branding,
                  on_change: () =>
                    update_preference(
                      "show_aster_branding",
                      !preferences.show_aster_branding,
                      true,
                    ),
                  size: "lg",
                }
              : undefined
          }
          trailing={
            is_paid_plan ? undefined : (
              <UpgradeBtn
                size="sm"
                onClick={() =>
                  prompt_upgrade(
                    t("settings.feature_requires_upgrade"),
                    undefined,
                    "has_remove_branding",
                  )
                }
              >
                {t("settings.upgrade_to_unlock")}
              </UpgradeBtn>
            )
          }
        />
      </IslandSection>
    </IslandSections>
  );
}
