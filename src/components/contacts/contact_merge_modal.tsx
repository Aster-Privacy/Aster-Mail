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
import type { DecryptedContact } from "@/types/contacts";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Bars2Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button, Spinner } from "@aster/ui";

import { ContactAvatar } from "@/components/common/contacts/contact_avatar";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { contact_display_name, merge_contacts } from "@/lib/contact_duplicates";
import {
  bulk_delete_contacts,
  update_contact_encrypted,
} from "@/services/api/contacts";
import { user_facing_error } from "@/utils/user_facing_error";

interface ContactMergeModalProps {
  contacts: DecryptedContact[];
  on_close: () => void;
  on_merged: () => void;
}

export function ContactMergeModal({
  contacts,
  on_close,
  on_merged,
}: ContactMergeModalProps) {
  const { t } = use_i18n();
  const title_id = useId();
  const dialog_ref = useRef<HTMLDivElement>(null);
  const [order, set_order] = useState<DecryptedContact[]>(contacts);
  const [excluded, set_excluded] = useState<Set<string>>(new Set());
  const [is_preview_open, set_is_preview_open] = useState(false);
  const [is_merging, set_is_merging] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const drag_id = useRef<string | null>(null);

  useEffect(() => {
    set_order(contacts);
    set_excluded(new Set());
  }, [contacts]);

  useEffect(() => {
    const previously_focused = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => dialog_ref.current?.focus());

    return () => {
      cancelAnimationFrame(frame);
      previously_focused?.focus?.();
    };
  }, []);

  useEffect(() => {
    const on_key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !is_merging) on_close();
    };

    document.addEventListener("keydown", on_key);

    return () => document.removeEventListener("keydown", on_key);
  }, [is_merging, on_close]);

  const selected = useMemo(
    () => order.filter((contact) => !excluded.has(contact.id)),
    [order, excluded],
  );

  const preview = useMemo(
    () => (selected.length > 0 ? merge_contacts(selected) : null),
    [selected],
  );

  const toggle = useCallback((id: string) => {
    set_excluded((prev) => {
      const next = new Set(prev);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }, []);

  const move = useCallback((id: string, delta: number) => {
    set_order((prev) => {
      const index = prev.findIndex((contact) => contact.id === id);
      const target = index + delta;

      if (index < 0 || target < 0 || target >= prev.length) return prev;

      const next = [...prev];
      const [item] = next.splice(index, 1);

      next.splice(target, 0, item);

      return next;
    });
  }, []);

  const drop_on = useCallback((id: string) => {
    const source = drag_id.current;

    drag_id.current = null;
    if (!source || source === id) return;

    set_order((prev) => {
      const from = prev.findIndex((contact) => contact.id === source);
      const to = prev.findIndex((contact) => contact.id === id);

      if (from < 0 || to < 0) return prev;

      const next = [...prev];
      const [item] = next.splice(from, 1);

      next.splice(to, 0, item);

      return next;
    });
  }, []);

  const run_merge = useCallback(async () => {
    if (selected.length < 2 || !preview) return;

    set_is_merging(true);
    set_error(null);
    try {
      const [keeper, ...absorbed] = selected;
      const response = await update_contact_encrypted(keeper.id, preview);

      if (response.error) {
        set_error(response.error);

        return;
      }

      const removed = await bulk_delete_contacts({
        contact_ids: absorbed.map((contact) => contact.id),
      });

      if (removed.error) {
        set_error(removed.error);

        return;
      }

      show_toast(
        t("common.contacts_merged", { count: selected.length }),
        "success",
      );
      on_merged();
    } catch (err) {
      set_error(user_facing_error(err, t("common.failed_to_merge_contacts")));
    } finally {
      set_is_merging(false);
    }
  }, [on_merged, preview, selected, t]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && !is_merging && on_close()}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 backdrop-blur-md"
        style={{ backgroundColor: "var(--modal-overlay)" }}
      />

      <div
        ref={dialog_ref}
        aria-labelledby={title_id}
        aria-modal="true"
        className="relative mx-4 flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-modal-bg border-edge-primary outline-none"
        role="dialog"
        style={{ boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.35)" }}
        tabIndex={-1}
      >
        <div className="flex flex-shrink-0 items-start justify-between gap-4 px-6 pb-4 pt-5">
          <div className="min-w-0">
            <h2
              className="text-[17px] font-semibold text-txt-primary"
              id={title_id}
            >
              {t("common.merge_contacts")}
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-txt-muted">
              {t("common.merge_contacts_hint")}
            </p>
          </div>
          <button
            aria-label={t("common.close")}
            className="rounded-[14px] p-1 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={is_merging}
            type="button"
            onClick={on_close}
          >
            <XMarkIcon className="h-5 w-5 text-txt-muted" />
          </button>
        </div>

        <div
          className="h-px flex-shrink-0"
          style={{ backgroundColor: "var(--border-secondary)" }}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {order.map((contact, index) => {
            const is_included = !excluded.has(contact.id);
            const is_keeper = is_included && selected[0]?.id === contact.id;

            return (
              <div
                key={contact.id}
                draggable
                className="contact_merge_row flex items-center gap-2 rounded-xl px-2 py-2"
                onDragOver={(event) => event.preventDefault()}
                onDragStart={() => {
                  drag_id.current = contact.id;
                }}
                onDrop={() => drop_on(contact.id)}
              >
                <Bars2Icon className="h-4 w-4 flex-shrink-0 cursor-grab text-txt-muted" />
                <input
                  aria-label={contact_display_name(contact)}
                  checked={is_included}
                  className="h-4 w-4 flex-shrink-0 accent-[var(--accent-primary)]"
                  type="checkbox"
                  onChange={() => toggle(contact.id)}
                />
                <ContactAvatar
                  avatar_url={contact.avatar_url}
                  email={contact.emails[0]}
                  name={contact_display_name(contact)}
                  profile_color={contact.profile_color}
                  size_px={32}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[13.5px] font-medium text-txt-primary">
                    {contact_display_name(contact)}
                    {is_keeper && (
                      <span className="contact_merge_badge rounded-full px-1.5 py-0.5 text-[10.5px] font-medium">
                        {t("common.merge_keeps_this")}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[12px] text-txt-muted">
                    {contact.emails.join(", ") || t("common.no_email")}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center">
                  <button
                    aria-label={t("common.move_up")}
                    className="contact_merge_action flex h-7 w-7 items-center justify-center rounded-full disabled:opacity-30"
                    disabled={index === 0}
                    type="button"
                    onClick={() => move(contact.id, -1)}
                  >
                    <ArrowUpIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    aria-label={t("common.move_down")}
                    className="contact_merge_action flex h-7 w-7 items-center justify-center rounded-full disabled:opacity-30"
                    disabled={index === order.length - 1}
                    type="button"
                    onClick={() => move(contact.id, 1)}
                  >
                    <ArrowDownIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {is_preview_open && preview && (
            <div className="contact_merge_preview mt-2 rounded-xl px-3 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-txt-muted">
                {t("common.merged_contact_preview")}
              </p>
              <p className="mt-1.5 text-[13.5px] font-medium text-txt-primary">
                {`${preview.first_name} ${preview.last_name}`.trim() ||
                  preview.emails[0]}
              </p>
              <p className="mt-0.5 break-words text-[12.5px] text-txt-muted">
                {preview.emails.join(", ")}
              </p>
            </div>
          )}

          {error && (
            <p className="mt-2 px-2 text-[12.5px] text-red-400">{error}</p>
          )}
        </div>

        <div
          className="h-px flex-shrink-0"
          style={{ backgroundColor: "var(--border-secondary)" }}
        />

        <div className="flex flex-shrink-0 items-center justify-between gap-2 px-6 py-4">
          <Button
            disabled={is_merging}
            size="sm"
            variant="ghost"
            onClick={on_close}
          >
            {t("common.cancel")}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              disabled={selected.length < 2}
              size="sm"
              variant="secondary"
              onClick={() => set_is_preview_open((open) => !open)}
            >
              {t("common.preview_contact")}
            </Button>
            <Button
              disabled={selected.length < 2 || is_merging}
              size="sm"
              variant="primary"
              onClick={run_merge}
            >
              {is_merging ? <Spinner size="sm" /> : t("common.merge")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
