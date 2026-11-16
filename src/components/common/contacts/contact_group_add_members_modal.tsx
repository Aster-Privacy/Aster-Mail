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
import type { ContactGroup, DecryptedContact } from "@/types/contacts";
import type { TranslationKey } from "@/lib/i18n/types";

import { useEffect, useMemo, useState } from "react";
import { UserPlusIcon } from "@heroicons/react/24/outline";
import { Checkbox } from "@aster/ui";

import { Button } from "@/components/ui/button";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { ContactAvatar } from "@/components/common/contacts/contact_avatar";
import {
  contact_display_name,
  group_add_candidates,
} from "@/components/common/contacts/contact_group_members";

interface ContactGroupAddMembersModalProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  group: ContactGroup | null;
  contacts: DecryptedContact[];
  on_close: () => void;
  on_add: (contact_ids: string[]) => Promise<boolean>;
}

export function ContactGroupAddMembersModal({
  t,
  group,
  contacts,
  on_close,
  on_add,
}: ContactGroupAddMembersModalProps) {
  const [query, set_query] = useState("");
  const [picked, set_picked] = useState<Set<string>>(() => new Set());
  const [is_saving, set_is_saving] = useState(false);
  const group_id = group?.id ?? null;

  useEffect(() => {
    set_query("");
    set_picked(new Set());
    set_is_saving(false);
  }, [group_id]);

  const all_candidates = useMemo(
    () => (group_id ? group_add_candidates(contacts, group_id, "") : []),
    [contacts, group_id],
  );

  const candidates = useMemo(
    () => (group_id ? group_add_candidates(contacts, group_id, query) : []),
    [contacts, group_id, query],
  );

  const picked_ids = useMemo(() => {
    const available = new Set(all_candidates.map((contact) => contact.id));

    return Array.from(picked).filter((id) => available.has(id));
  }, [all_candidates, picked]);

  const toggle = (id: string) => {
    set_picked((previous) => {
      const next = new Set(previous);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  };

  const submit = async () => {
    if (picked_ids.length === 0 || is_saving) return;
    set_is_saving(true);
    const ok = await on_add(picked_ids);

    set_is_saving(false);
    if (ok) on_close();
  };

  const trimmed_query = query.trim();

  return (
    <Modal is_open={!!group} on_close={is_saving ? () => {} : on_close} size="sm">
      <ModalHeader>
        <div className="flex items-center gap-3">
          <UserPlusIcon className="h-5 w-5 flex-shrink-0 text-txt-muted" />
          <ModalTitle className="min-w-0 truncate">
            {t("common.add_members_title", { name: group?.name ?? "" })}
          </ModalTitle>
        </div>
      </ModalHeader>

      <ModalBody>
        {all_candidates.length === 0 ? (
          <p
            className="py-6 text-center text-[13px] text-txt-muted"
            data-testid="contact_group_add_none_left"
          >
            {t("common.add_members_none_left")}
          </p>
        ) : (
          <div className="space-y-3">
            <Input
              autoFocus
              aria-label={t("common.search_contacts")}
              className="aster_input_tonal"
              placeholder={t("common.search_contacts")}
              size="md"
              value={query}
              onChange={(event) => set_query(event.target.value)}
            />
            <div
              aria-label={t("common.add_members")}
              className="contact_group_picker max-h-[340px] overflow-y-auto overscroll-contain"
              role="group"
            >
              {candidates.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-txt-muted">
                  {t("common.no_contacts_match", { query: trimmed_query })}
                </p>
              ) : (
                candidates.map((contact) => {
                  const name = contact_display_name(contact);
                  const checkbox_id = `contact_group_add_${contact.id}`;
                  const is_checked = picked.has(contact.id);

                  return (
                    <label
                      key={contact.id}
                      className="contact_group_option"
                      data-checked={is_checked}
                      data-testid={`contact_group_add_option_${contact.id}`}
                      htmlFor={checkbox_id}
                      style={{
                        contentVisibility: "auto",
                        containIntrinsicSize: "auto 48px",
                      }}
                    >
                      <ContactAvatar
                        avatar_url={contact.avatar_url}
                        email={contact.emails[0]}
                        name={name}
                        profile_color={contact.profile_color}
                        size_px={32}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-txt-primary">
                          {name || t("common.unnamed")}
                        </span>
                        {contact.emails[0] && name !== contact.emails[0] && (
                          <span className="block truncate text-[12px] text-txt-muted">
                            {contact.emails[0]}
                          </span>
                        )}
                      </span>
                      <Checkbox
                        checked={is_checked}
                        id={checkbox_id}
                        onCheckedChange={() => toggle(contact.id)}
                      />
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button disabled={is_saving} variant="ghost" onClick={on_close}>
          {t("common.cancel")}
        </Button>
        <Button
          data-testid="contact_group_add_confirm"
          disabled={picked_ids.length === 0}
          is_loading={is_saving}
          variant="depth"
          onClick={submit}
        >
          {picked_ids.length > 0
            ? t("common.add_members_count", { count: picked_ids.length })
            : t("common.add_members")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
