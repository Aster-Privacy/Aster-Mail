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

import { useMemo, useState } from "react";
import { UserPlusIcon } from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { is_valid_email } from "@/components/compose/compose_shared_core";
import { is_contact_trashed } from "@/lib/contact_trash";
import { use_i18n } from "@/lib/i18n/context";

interface RecipientContactPickerProps {
  label: string;
  contacts: DecryptedContact[];
  existing_recipients: string[];
  on_add_recipient: (email: string) => void;
}

export function RecipientContactPicker(props: RecipientContactPickerProps) {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);
  const button_label = `${t("common.add_recipient")} (${props.label})`;

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label={button_label}
        className="h-8 w-8 flex items-center justify-center rounded-full transition-colors flex-shrink-0 hover_bg text-txt-tertiary"
        title={button_label}
        type="button"
        onClick={() => set_is_open(true)}
      >
        <UserPlusIcon className="w-4 h-4" />
      </button>
      {is_open && (
        <RecipientContactModal {...props} on_close={() => set_is_open(false)} />
      )}
    </>
  );
}

function RecipientContactModal({
  label,
  contacts,
  existing_recipients,
  on_add_recipient,
  on_close,
}: RecipientContactPickerProps & { on_close: () => void }) {
  const { t } = use_i18n();
  const [query, set_query] = useState("");
  const [selected, set_selected] = useState<Set<string>>(new Set());
  const existing = new Set(
    existing_recipients.map((email) => email.trim().toLowerCase()),
  );
  const rows = useMemo(() => {
    const seen = new Set<string>();

    return contacts
      .filter((contact) => !is_contact_trashed(contact))
      .flatMap((contact) => {
        const name = `${contact.first_name} ${contact.last_name}`.trim();

        return contact.emails.flatMap((value) => {
          const email = value.trim();
          const key = email.toLowerCase();

          if (!is_valid_email(email) || seen.has(key)) return [];
          seen.add(key);

          return [{ contact, name, email, key }];
        });
      })
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  }, [contacts]);
  const search = query.trim().toLowerCase();
  const filtered_rows = rows.filter(({ name, email, contact }) =>
    [name, email, contact.company ?? ""].some((value) =>
      value.toLowerCase().includes(search),
    ),
  );
  const selected_rows = rows.filter(
    ({ key }) => selected.has(key) && !existing.has(key),
  );

  return (
    <Modal is_open on_close={on_close} size="lg">
      <ModalHeader>
        <ModalTitle>{t("common.contacts")}</ModalTitle>
        <ModalDescription>
          {t("common.add_recipient")} · {label}
        </ModalDescription>
      </ModalHeader>
      <ModalBody className="flex min-h-0 flex-col gap-3">
        <Input
          aria-label={t("common.search_contacts")}
          placeholder={t("common.search_contacts")}
          value={query}
          onChange={(event) => set_query(event.target.value)}
        />
        <div className="max-h-[min(360px,50dvh)] overflow-y-auto space-y-1">
          {filtered_rows.map(({ contact, name, email, key }) => {
            const already_added = existing.has(key);

            return (
              <label
                key={key}
                className={`flex items-center gap-3 rounded-xl p-3 hover_bg ${already_added ? "opacity-50" : "cursor-pointer"}`}
              >
                <input
                  checked={already_added || selected.has(key)}
                  className="h-4 w-4 shrink-0 accent-[var(--accent-color)]"
                  disabled={already_added}
                  type="checkbox"
                  onChange={() => {
                    set_selected((previous) => {
                      const next = new Set(previous);

                      if (next.has(key)) next.delete(key);
                      else next.add(key);

                      return next;
                    });
                  }}
                />
                <ProfileAvatar
                  email={email}
                  image_url={contact.avatar_url}
                  name={name || email}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-txt-primary">
                    {name || email}
                  </span>
                  <span className="block truncate text-xs text-txt-muted">
                    {email}
                  </span>
                </span>
              </label>
            );
          })}
          {filtered_rows.length === 0 && (
            <p className="py-10 text-center text-sm text-txt-muted">
              {search
                ? t("common.no_contacts_match", { query: query.trim() })
                : t("common.no_contacts_yet")}
            </p>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <span aria-live="polite" className="me-auto text-xs text-txt-muted">
          {t("common.selected_count", { count: selected_rows.length })}
        </span>
        <Button variant="ghost" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={selected_rows.length === 0}
          variant="depth"
          onClick={() => {
            selected_rows.forEach(({ email }) => on_add_recipient(email));
            on_close();
          }}
        >
          {t("common.add")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
