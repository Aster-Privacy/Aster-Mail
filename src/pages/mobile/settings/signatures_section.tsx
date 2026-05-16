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
import type {
  DecryptedSignature,
  SignatureFormData,
  SignaturePlacement,
} from "@/services/api/signatures";

import { useState, useCallback, useEffect } from "react";
import { PlusIcon, DocumentTextIcon, CheckIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { SettingsHeader } from "./shared";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  list_signatures,
  create_signature,
  update_signature,
  delete_signature,
  set_default_signature,
} from "@/services/api/signatures";
import { use_signatures } from "@/contexts/signatures_context";
import { use_sender_aliases } from "@/hooks/use_sender_aliases";

export function SignaturesSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const { reload_signatures: reload_context_signatures } = use_signatures();
  const { sender_options } = use_sender_aliases();
  const sender_aliases = sender_options.filter(
    (o) => o.type === "alias" && o.is_enabled,
  );
  const [signatures, set_signatures] = useState<DecryptedSignature[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [editor_open, set_editor_open] = useState(false);
  const [editing_id, set_editing_id] = useState<string | null>(null);
  const [editor_name, set_editor_name] = useState("");
  const [editor_content, set_editor_content] = useState("");
  const [editor_alias_id, set_editor_alias_id] = useState<string | null>(null);
  const [editor_placement, set_editor_placement] =
    useState<SignaturePlacement | null>(null);
  const [is_saving, set_is_saving] = useState(false);
  const [deleting_id, set_deleting_id] = useState<string | null>(null);
  const [delete_confirm, set_delete_confirm] = useState<{
    is_open: boolean;
    id: string | null;
  }>({ is_open: false, id: null });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await list_signatures();

        if (!cancelled && res.data) {
          set_signatures(res.data.signatures);
        }
      } catch {
      } finally {
        if (!cancelled) set_is_loading(false);
      }
    }
    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const open_create = useCallback(() => {
    set_editing_id(null);
    set_editor_name("");
    set_editor_content("");
    set_editor_alias_id(null);
    set_editor_placement(null);
    set_editor_open(true);
  }, []);

  const open_edit = useCallback((sig: DecryptedSignature) => {
    set_editing_id(sig.id);
    set_editor_name(sig.name);
    set_editor_content(sig.content);
    set_editor_alias_id(sig.alias_id);
    set_editor_placement(sig.placement);
    set_editor_open(true);
  }, []);

  const close_editor = useCallback(() => {
    set_editor_open(false);
    set_editing_id(null);
    set_editor_name("");
    set_editor_content("");
    set_editor_alias_id(null);
    set_editor_placement(null);
  }, []);

  const handle_save = useCallback(async () => {
    if (!editor_name.trim() || !editor_content.trim()) return;
    set_is_saving(true);

    const form_data: SignatureFormData = {
      name: editor_name.trim(),
      content: editor_content.trim(),
      is_html: false,
      alias_id: editor_alias_id,
      placement: editor_placement,
    };

    if (editing_id) {
      const res = await update_signature(editing_id, form_data);

      if (!res.error) {
        set_signatures((prev) =>
          prev.map((sig) =>
            sig.id === editing_id
              ? {
                  ...sig,
                  name: form_data.name,
                  content: form_data.content,
                  alias_id: editor_alias_id,
                  placement: editor_placement,
                }
              : sig,
          ),
        );
        reload_context_signatures();
        close_editor();
      }
    } else {
      const is_first = signatures.length === 0;
      const res = await create_signature(form_data, is_first);

      if (!res.error && res.data) {
        const new_sig: DecryptedSignature = {
          id: res.data.id,
          name: form_data.name,
          content: form_data.content,
          is_default: is_first && !editor_alias_id,
          is_html: false,
          alias_id: editor_alias_id,
          placement: editor_placement,
          created_at: res.data.created_at,
          updated_at: res.data.created_at,
        };

        set_signatures((prev) => [...prev, new_sig]);
        reload_context_signatures();
        close_editor();
      }
    }

    set_is_saving(false);
  }, [
    editor_name,
    editor_content,
    editor_alias_id,
    editor_placement,
    editing_id,
    signatures.length,
    reload_context_signatures,
    close_editor,
  ]);

  const handle_set_default = useCallback(
    async (id: string) => {
      set_signatures((prev) =>
        prev.map((s) => ({ ...s, is_default: s.id === id })),
      );
      reload_context_signatures();
      await set_default_signature(id);
    },
    [reload_context_signatures],
  );

  const request_delete = useCallback((id: string) => {
    set_delete_confirm({ is_open: true, id });
  }, []);

  const confirm_delete = useCallback(async () => {
    const id = delete_confirm.id;

    if (!id) return;
    set_delete_confirm({ is_open: false, id: null });
    set_deleting_id(id);
    const res = await delete_signature(id);

    if (!res.error) {
      set_signatures((prev) => {
        const filtered = prev.filter((s) => s.id !== id);

        if (filtered.length > 0 && !filtered.some((s) => s.is_default)) {
          filtered[0].is_default = true;
        }

        return filtered;
      });
      reload_context_signatures();
    }
    set_deleting_id(null);
  }, [delete_confirm.id, reload_context_signatures]);

  if (editor_open) {
    return (
      <div className="flex h-full flex-col">
        <SettingsHeader
          on_back={close_editor}
          on_close={on_close}
          title={
            editing_id
              ? t("settings.update_signature")
              : t("settings.create_signature")
          }
        />
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-primary)] mb-1.5">
              {t("settings.signature_name")}
            </label>
            <Input
              autoFocus
              className="w-full"
              placeholder={t("settings.signature_name_placeholder")}
              type="text"
              value={editor_name}
              onChange={(e) => set_editor_name(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-primary)] mb-1.5">
              {t("settings.signature_content")}
            </label>
            <textarea
              className="w-full rounded-xl bg-[var(--mobile-bg-card)] px-4 py-3 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none border border-[var(--border-secondary)] resize-none font-mono"
              placeholder={t("settings.signature_content_placeholder")}
              rows={8}
              value={editor_content}
              onChange={(e) => set_editor_content(e.target.value)}
            />
            <p className="text-[11px] mt-1.5 text-[var(--text-muted)]">
              {t("settings.plain_text_hint")}
            </p>
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-primary)] mb-1.5">
              {t("settings.signature_alias")}
            </label>
            <div className="rounded-xl border border-[var(--border-secondary)] bg-[var(--mobile-bg-card)] overflow-hidden">
              <div className="divide-y divide-[var(--border-primary)]">
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-[var(--mobile-bg-card-hover)]"
                  type="button"
                  onClick={() => set_editor_alias_id(null)}
                >
                  <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                    {t("settings.signature_alias_default")}
                  </span>
                  {editor_alias_id === null && (
                    <CheckIcon className="h-5 w-5 shrink-0 text-[var(--accent-color,#3b82f6)]" />
                  )}
                </button>
                {sender_aliases.map((alias) => {
                  const in_use = signatures.some(
                    (s) => s.alias_id === alias.id && s.id !== editing_id,
                  );
                  return (
                    <button
                      key={alias.id}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-[var(--mobile-bg-card-hover)] disabled:opacity-50"
                      disabled={in_use}
                      type="button"
                      onClick={() => set_editor_alias_id(alias.id)}
                    >
                      <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                        {alias.email}
                        {in_use
                          ? ` (${t("settings.signature_alias_in_use")})`
                          : ""}
                      </span>
                      {editor_alias_id === alias.id && (
                        <CheckIcon className="h-5 w-5 shrink-0 text-[var(--accent-color,#3b82f6)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-primary)] mb-1.5">
              {t("settings.signature_placement")}
            </label>
            <div className="rounded-xl border border-[var(--border-secondary)] bg-[var(--mobile-bg-card)] overflow-hidden">
              <div className="divide-y divide-[var(--border-primary)]">
                {[
                  { value: null, label: t("settings.signature_placement_inherit") },
                  { value: "below" as SignaturePlacement, label: t("settings.below_quoted_text") },
                  { value: "above" as SignaturePlacement, label: t("settings.above_quoted_text") },
                ].map((opt) => (
                  <button
                    key={opt.value ?? "__inherit__"}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-[var(--mobile-bg-card-hover)]"
                    type="button"
                    onClick={() => set_editor_placement(opt.value)}
                  >
                    <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                      {opt.label}
                    </span>
                    {editor_placement === opt.value && (
                      <CheckIcon className="h-5 w-5 shrink-0 text-[var(--accent-color,#3b82f6)]" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-4 py-4 border-t border-[var(--border-secondary)]">
          <Button
            className="flex-1"
            disabled={is_saving}
            variant="ghost"
            onClick={close_editor}
          >
            {t("common.cancel")}
          </Button>
          <Button
            className="flex-1"
            disabled={
              !editor_name.trim() || !editor_content.trim() || is_saving
            }
            variant="depth"
            onClick={handle_save}
          >
            {is_saving ? (
              <Spinner size="md" />
            ) : editing_id ? (
              t("settings.update_signature")
            ) : (
              t("settings.create_signature")
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.signature")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="px-4 py-3">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-[16px] px-4 py-3 text-[15px] font-semibold text-white active:opacity-80"
            style={{
              background:
                "linear-gradient(180deg, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
              boxShadow:
                "0 2px 4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
            type="button"
            onClick={open_create}
          >
            <PlusIcon className="h-5 w-5" />
            {t("settings.add_signature")}
          </button>
        </div>
        {is_loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" />
          </div>
        ) : signatures.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-8 pt-12">
            <DocumentTextIcon className="h-16 w-16 text-[var(--text-muted)] opacity-40" />
            <p className="text-center text-[15px] text-[var(--text-muted)]">
              {t("settings.no_signatures_yet")}
            </p>
          </div>
        ) : (
          <div className="px-4 py-2 space-y-3">
            {signatures.map((sig) => (
              <div
                key={sig.id}
                className="rounded-xl bg-[var(--mobile-bg-card)] p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-[15px] font-medium text-[var(--text-primary)]">
                    {sig.name}
                  </span>
                  {sig.is_default && (
                    <span className="rounded-full bg-[var(--accent-color,#3b82f6)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--accent-color,#3b82f6)]">
                      {t("settings.default_badge")}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[13px] text-[var(--text-muted)] line-clamp-3 whitespace-pre-wrap font-mono">
                  {sig.content}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    className="text-[13px] text-[var(--accent-color,#3b82f6)]"
                    type="button"
                    onClick={() => open_edit(sig)}
                  >
                    {t("common.edit")}
                  </button>
                  {!sig.is_default && !sig.alias_id && (
                    <button
                      className="text-[13px] text-[var(--accent-color,#3b82f6)]"
                      type="button"
                      onClick={() => handle_set_default(sig.id)}
                    >
                      {t("common.set_as_default")}
                    </button>
                  )}
                  <button
                    className="ml-auto text-[13px] text-[var(--color-danger,#ef4444)]"
                    disabled={deleting_id === sig.id}
                    type="button"
                    onClick={() => request_delete(sig.id)}
                  >
                    {deleting_id === sig.id ? (
                      <Spinner size="md" />
                    ) : (
                      t("common.delete")
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ConfirmationModal
        confirm_text={t("common.delete")}
        is_open={delete_confirm.is_open}
        message={t("settings.delete_signature_confirmation")}
        on_cancel={() => set_delete_confirm({ is_open: false, id: null })}
        on_confirm={confirm_delete}
        title={t("common.delete")}
        variant="danger"
      />
    </div>
  );
}
