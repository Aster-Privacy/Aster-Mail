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
import type { TranslationKey } from "@/lib/i18n/types";

import { useMemo } from "react";
import {
  ArrowUturnLeftIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Tooltip } from "@aster/ui";

import { contact_trash_days_left } from "@/lib/contact_trash";

interface ContactTrashPaneProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  contacts: DecryptedContact[];
  search_query: string;
  on_restore: (contact: DecryptedContact) => void;
  on_delete_forever: (contact: DecryptedContact) => void;
  on_empty_trash: () => void;
}

const display_name_of = (contact: DecryptedContact): string =>
  `${contact.first_name || ""} ${contact.last_name || ""}`.trim() ||
  contact.emails[0] ||
  "";

export function ContactTrashPane({
  t,
  contacts,
  search_query,
  on_restore,
  on_delete_forever,
  on_empty_trash,
}: ContactTrashPaneProps) {
  const visible_contacts = useMemo(() => {
    const needle = search_query.trim().toLowerCase();
    const matched = needle
      ? contacts.filter(
          (contact) =>
            display_name_of(contact).toLowerCase().includes(needle) ||
            contact.emails.some((email) =>
              email.toLowerCase().includes(needle),
            ),
        )
      : contacts;

    return [...matched].sort((a, b) =>
      (b.deleted_at || "").localeCompare(a.deleted_at || ""),
    );
  }, [contacts, search_query]);

  if (visible_contacts.length === 0) {
    const has_query = search_query.trim().length > 0;

    return (
      <div className="contact_empty_state">
        <span className="contact_empty_state_glyph">
          <TrashIcon className="h-8 w-8" strokeWidth={1.5} />
        </span>
        <p className="mb-1 text-[14px] font-medium text-txt-primary">
          {has_query && contacts.length > 0
            ? t("common.no_contacts_match", { query: search_query.trim() })
            : t("common.no_contacts_in_trash")}
        </p>
        <p className="max-w-[280px] text-[12.5px] leading-relaxed text-txt-muted">
          {t("common.contacts_in_trash_notice")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <p className="text-[12px] text-txt-muted">
          {t("common.contacts_in_trash_notice")}
        </p>
        <button
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-[8px] px-2 py-1 text-[12px] font-medium text-txt-secondary transition-colors hover:bg-black/5 hover:text-danger dark:hover:bg-white/5"
          type="button"
          onClick={on_empty_trash}
        >
          <XMarkIcon className="h-3.5 w-3.5" />
          {t("mail.empty_trash")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {visible_contacts.map((contact) => (
          <div
            key={contact.id}
            className="group/trash my-0.5 flex w-full items-center gap-3 rounded-[12px] px-3 py-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-txt-primary">
                {display_name_of(contact)}
              </p>
              <p className="text-[12px] text-txt-muted">
                {t("common.trash_days_left", {
                  count: contact_trash_days_left(contact.deleted_at || ""),
                })}
              </p>
            </div>
            <Tooltip tip={t("mail.restore")}>
              <button
                aria-label={t("mail.restore")}
                className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] text-txt-muted opacity-0 transition-opacity hover:text-txt-primary focus-visible:opacity-100 group-hover/trash:opacity-100"
                type="button"
                onClick={() => on_restore(contact)}
              >
                <ArrowUturnLeftIcon className="h-4 w-4" />
              </button>
            </Tooltip>
            <Tooltip tip={t("mail.delete_permanently")}>
              <button
                aria-label={t("mail.delete_permanently")}
                className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] text-txt-muted opacity-0 transition-opacity hover:text-red-500 focus-visible:opacity-100 group-hover/trash:opacity-100"
                type="button"
                onClick={() => on_delete_forever(contact)}
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
        ))}
      </div>
    </div>
  );
}
