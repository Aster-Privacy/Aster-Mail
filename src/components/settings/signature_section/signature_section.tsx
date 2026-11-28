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
  IslandEmpty,
  IslandIconButton,
  IslandRow,
  IslandSection,
  IslandSections,
  SettingControlRow,
  SettingToggleRow,
} from "@aster/ui";

import { SignatureMode } from "./helpers";
import { use_signature_section } from "./use_signature_section";
import {
  SignatureTableControl,
  use_signature_table_keys,
} from "./table_control";

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
import { FormatBar } from "@/components/compose/compose_toolbar/format_bar";
import { LinkTool } from "@/components/compose/compose_toolbar/link_tool";
import {
  Divider,
  ToolbarButton,
  use_frozen_selection,
} from "@/components/compose/compose_toolbar/shared";
import { sanitize_compose_paste } from "@/lib/html_sanitizer";
import { plain_signature_to_html } from "@/lib/signature_html";
import { PlanUpgradeButton } from "@/components/common/plan_locked";

export function SignatureSection() {
  const {
    t,
    preferences,
    update_preference,
    sender_aliases,
    is_paid_plan,
    signatures,
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
    rich_editor,
    name_invalid,
    content_invalid,
    handle_image_upload,
    handle_insert_horizontal_rule,
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
  const handle_table_keys = use_signature_table_keys(
    editor_div_ref,
    rich_editor.handle_input,
  );

  if (is_initial_load) {
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
        title={t("settings.your_signatures", {
          count: signatures.length,
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
                <FormatBar
                  className="px-2 py-1.5 border-b border-input-border"
                  compose={{
                    editor: rich_editor,
                    is_mac: rich_editor.is_mac,
                    active_formats: rich_editor.format_state.active_formats,
                    exec_format_command: rich_editor.exec_format,
                  }}
                >
                  <Divider />

                  <LinkTool editor={rich_editor} />

                  <ToolbarButton
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
                  </ToolbarButton>

                  <SignatureTableControl
                    apply={apply_with_frozen_selection}
                    editor_ref={editor_div_ref}
                    on_before_open={freeze_selection}
                    on_change={rich_editor.handle_input}
                  />

                  <ToolbarButton
                    title={t("mail.insert_image")}
                    onClick={() => image_input_ref.current?.click()}
                  >
                    <PhotoIcon className="w-4 h-4" />
                  </ToolbarButton>
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
                </FormatBar>
                <div
                  ref={editor_div_ref}
                  contentEditable
                  aria-labelledby="signature-content-label"
                  aria-multiline="true"
                  className="signature_editor px-3 py-2 text-sm min-h-[150px] max-h-[300px] overflow-auto text-txt-primary outline-none [&_img]:max-w-full"
                  role="textbox"
                  onDragOver={rich_editor.handle_drag_over}
                  onDrop={rich_editor.handle_drop}
                  onInput={rich_editor.handle_input}
                  onKeyDown={handle_table_keys}
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
          <IslandEmpty
            icon={<PencilIcon />}
            title={t("settings.no_signatures_yet")}
          />
        ) : (
          <Island divided>
            {signatures.map((signature) => {
              const bound_alias = signature.alias_id
                ? sender_aliases.find((a) => a.id === signature.alias_id)
                : null;

              return (
                <IslandRow
                  key={signature.id}
                  description={
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="truncate" dir="auto">
                        {bound_alias
                          ? bound_alias.email
                          : t("settings.signature_alias_default")}
                      </span>
                      <span
                        dangerouslySetInnerHTML={{
                          __html: signature.is_html
                            ? sanitize_compose_paste(signature.content)
                            : plain_signature_to_html(signature.content),
                        }}
                        data-selectable-region
                        className="line-clamp-3 break-words text-txt-muted [&_*]:!text-[inherit] [&_*]:!m-0 [&_img]:inline-block [&_img]:max-h-10 [&_img]:max-w-full"
                        dir="auto"
                        tabIndex={-1}
                      />
                    </span>
                  }
                  label={
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate" dir="auto">
                        {signature.name}
                      </span>
                      {signature.is_default && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--text-primary)_7%,transparent)] text-txt-muted flex-shrink-0">
                          {t("settings.default_badge")}
                        </span>
                      )}
                    </span>
                  }
                  trailing={
                    <span className="flex items-center gap-1">
                      {!signature.is_default && !signature.alias_id && (
                        <Button
                          size="md"
                          variant="outline"
                          onClick={() => handle_set_default(signature.id)}
                        >
                          {t("common.set_as_default")}
                        </Button>
                      )}
                      <IslandIconButton
                        label={t("common.edit")}
                        size="sm"
                        title={t("common.edit")}
                        onClick={() => open_edit_editor(signature)}
                      >
                        <PencilIcon className="w-4 h-4" />
                      </IslandIconButton>
                      <IslandIconButton
                        className="text-red-500 hover:text-red-500"
                        disabled={deleting_id === signature.id}
                        label={t("common.delete")}
                        size="sm"
                        title={t("common.delete")}
                        onClick={() => set_confirm_delete_id(signature.id)}
                      >
                        {deleting_id === signature.id ? (
                          <ButtonSpinner />
                        ) : (
                          <TrashIcon className="w-4 h-4" />
                        )}
                      </IslandIconButton>
                    </span>
                  }
                />
              );
            })}
          </Island>
        )}
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
              <PlanUpgradeButton
                feature="has_remove_branding"
                message={t("settings.feature_requires_upgrade")}
              />
            )
          }
        />
      </IslandSection>
    </IslandSections>
  );
}
