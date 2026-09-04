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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  EnvelopeIcon,
  PlusIcon,
  TrashIcon,
  UserGroupIcon,
  UserMinusIcon,
} from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@aster/ui";

import { Skeleton } from "@/components/ui/skeleton";
import { ContactAvatar } from "@/components/common/contacts/contact_avatar";
import {
  ContactGroupGlyph,
  DEFAULT_CONTACT_GROUP_COLOR,
} from "@/components/common/contacts/contact_group_glyph";
import { ContactGroupModal } from "@/components/contacts/contact_group_modal";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { show_toast } from "@/components/toast/simple_toast";
import { MAIL_EVENTS, mail_event_bus } from "@/hooks/mail_events";
import {
  delete_contact_group,
  list_contacts,
  list_contact_groups,
  remove_contact_from_group,
} from "@/services/api/contacts";

interface ContactGroupsPaneProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  contacts: DecryptedContact[];
  search_query: string;
  is_modal_open: boolean;
  on_modal_open: () => void;
  on_modal_close: () => void;
  on_count_change: (count: number) => void;
  on_open_contact: (contact: DecryptedContact) => void;
  on_compose_to: (recipients: string) => void;
}

const MEMBER_PAGE_LIMIT = 500;
const MAX_MEMBER_PAGES = 20;

function contact_display_name(contact: DecryptedContact): string {
  return (
    `${contact.first_name || ""} ${contact.last_name || ""}`.trim() ||
    contact.emails[0] ||
    ""
  );
}

export function ContactGroupsPane({
  t,
  contacts,
  search_query,
  is_modal_open,
  on_modal_open,
  on_modal_close,
  on_count_change,
  on_open_contact,
  on_compose_to,
}: ContactGroupsPaneProps) {
  const [groups, set_groups] = useState<ContactGroup[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [load_error, set_load_error] = useState<string | null>(null);
  const [open_group, set_open_group] = useState<ContactGroup | null>(null);
  const [member_ids, set_member_ids] = useState<string[] | null>(null);
  const [is_loading_members, set_is_loading_members] = useState(false);
  const [group_to_delete, set_group_to_delete] = useState<ContactGroup | null>(
    null,
  );

  const count_change_ref = useRef(on_count_change);

  count_change_ref.current = on_count_change;

  const load = useCallback(async () => {
    const response = await list_contact_groups();

    set_is_loading(false);

    if (response.error || !response.data) {
      const message = response.error || t("common.failed_to_load_groups");

      set_load_error(message);

      return;
    }
    set_load_error(null);
    set_groups(response.data.groups);
    count_change_ref.current(response.data.groups.length);
  }, [t]);

  useEffect(() => {
    void load();

    return mail_event_bus.subscribe(MAIL_EVENTS.CONTACTS_CHANGED, () => {
      void load();
    });
  }, [load]);

  const load_members = useCallback(async (group: ContactGroup) => {
    set_is_loading_members(true);

    const ids: string[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_MEMBER_PAGES; page += 1) {
      const response = await list_contacts({
        group_id: group.id,
        limit: MEMBER_PAGE_LIMIT,
        cursor,
      });

      if (response.error || !response.data) {
        set_is_loading_members(false);
        set_member_ids(page === 0 ? [] : ids);

        return;
      }
      ids.push(...response.data.items.map((item) => item.id));
      cursor = response.data.next_cursor ?? undefined;
      if (!response.data.has_more || !cursor) break;
    }

    set_is_loading_members(false);
    set_member_ids(ids);
  }, []);

  const open = useCallback(
    (group: ContactGroup) => {
      set_open_group(group);
      set_member_ids(null);
      void load_members(group);
    },
    [load_members],
  );

  useEffect(() => {
    if (!open_group) return;
    const still_there = groups.find((group) => group.id === open_group.id);

    if (!still_there) {
      set_open_group(null);
      set_member_ids(null);
    } else if (still_there.contact_count !== open_group.contact_count) {
      set_open_group(still_there);
    }
  }, [groups, open_group]);

  const confirm_delete = useCallback(async () => {
    const group = group_to_delete;

    if (!group) return;
    set_group_to_delete(null);
    const response = await delete_contact_group(group.id);

    if (response.error) {
      show_toast(response.error, "error");

      return;
    }
    show_toast(t("common.group_deleted"), "success");
    if (open_group?.id === group.id) set_open_group(null);
    void load();
  }, [group_to_delete, load, open_group, t]);

  const remove_member = useCallback(
    async (contact: DecryptedContact) => {
      if (!open_group) return;
      const response = await remove_contact_from_group(
        contact.id,
        open_group.id,
      );

      if (response.error) {
        show_toast(
          response.error || t("common.failed_to_remove_from_group"),
          "error",
        );

        return;
      }
      set_member_ids((previous) =>
        previous ? previous.filter((id) => id !== contact.id) : previous,
      );
      show_toast(t("common.removed_from_group"), "success");
      void load();
    },
    [load, open_group, t],
  );

  const visible_groups = useMemo(() => {
    const needle = search_query.trim().toLowerCase();
    const matched = needle
      ? groups.filter((group) => group.name.toLowerCase().includes(needle))
      : groups;

    return [...matched].sort((a, b) => a.name.localeCompare(b.name));
  }, [groups, search_query]);

  const members = useMemo(() => {
    if (!member_ids) return [];
    const by_id = new Map(contacts.map((contact) => [contact.id, contact]));
    const resolved = member_ids
      .map((id) => by_id.get(id))
      .filter((contact): contact is DecryptedContact => !!contact);

    return resolved.sort((a, b) =>
      contact_display_name(a).localeCompare(contact_display_name(b)),
    );
  }, [contacts, member_ids]);

  const member_emails = useMemo(
    () =>
      members
        .map((contact) => contact.emails[0])
        .filter((email): email is string => !!email)
        .join(", "),
    [members],
  );

  const group_skeletons = (
    <div className="px-1">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="mb-1.5 h-[14px] w-36" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );

  const modal = (
    <>
      <ContactGroupModal
        existing_count={groups.length}
        is_open={is_modal_open}
        on_close={on_modal_close}
        on_created={() => {
          show_toast(t("common.group_created"), "success");
          void load();
        }}
      />
      <ConfirmationModal
        cancel_text={t("common.cancel")}
        confirm_text={t("common.delete")}
        is_open={!!group_to_delete}
        message={t("common.delete_group_confirmation", {
          name: group_to_delete?.name ?? "",
        })}
        on_cancel={() => set_group_to_delete(null)}
        on_confirm={confirm_delete}
        title={t("common.delete_group")}
        variant="danger"
      />
    </>
  );

  if (open_group) {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-shrink-0 items-center gap-3 border-b border-edge-primary px-4 py-3">
            <Tooltip tip={t("common.back")}>
              <button
                aria-label={t("common.back")}
                className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] text-[var(--icon-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--icon-active)]"
                type="button"
                onClick={() => {
                  set_open_group(null);
                  set_member_ids(null);
                }}
              >
                <ArrowLeftIcon className="h-[18px] w-[18px] rtl:rotate-180" />
              </button>
            </Tooltip>
            <span
              className="contact_group_badge"
              style={{
                backgroundColor: `color-mix(in srgb, ${open_group.color || DEFAULT_CONTACT_GROUP_COLOR} 18%, var(--bg-primary))`,
              }}
            >
              <ContactGroupGlyph
                color={open_group.color}
                icon={open_group.icon}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-txt-primary">
                {open_group.name}
              </p>
              <p className="text-[12px] text-txt-muted">
                {t("common.group_contact_count", {
                  count: open_group.contact_count ?? 0,
                })}
              </p>
            </div>
            {member_emails && (
              <Tooltip tip={t("common.email_group")}>
                <button
                  aria-label={t("common.email_group")}
                  className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] text-[var(--icon-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--icon-active)]"
                  type="button"
                  onClick={() => on_compose_to(member_emails)}
                >
                  <EnvelopeIcon className="h-[18px] w-[18px]" />
                </button>
              </Tooltip>
            )}
            <Tooltip tip={t("common.delete_group")}>
              <button
                aria-label={t("common.delete_group")}
                className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] text-[var(--icon-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--color-danger)]"
                type="button"
                onClick={() => set_group_to_delete(open_group)}
              >
                <TrashIcon className="h-[18px] w-[18px]" />
              </button>
            </Tooltip>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2">
            {is_loading_members || member_ids === null ? (
              group_skeletons
            ) : members.length === 0 ? (
              <div className="contact_empty_state">
                <span className="contact_empty_state_glyph">
                  <UserGroupIcon className="h-8 w-8" strokeWidth={1.25} />
                </span>
                <p className="mb-1 text-[14px] font-medium text-txt-primary">
                  {t("common.group_empty_title")}
                </p>
                <p className="max-w-[260px] text-[12.5px] text-txt-muted">
                  {t("common.group_empty_hint")}
                </p>
              </div>
            ) : (
              members.map((contact) => (
                <div
                  key={contact.id}
                  className="contact_group_member_row group/member my-0.5 flex w-full items-center gap-3 px-3 py-2"
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-3 text-start"
                    type="button"
                    onClick={() => on_open_contact(contact)}
                  >
                    <ContactAvatar
                      avatar_url={contact.avatar_url}
                      email={contact.emails[0]}
                      name={contact_display_name(contact)}
                      profile_color={contact.profile_color}
                      size_px={36}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-txt-primary">
                        {contact_display_name(contact) || t("common.unnamed")}
                      </span>
                      {contact.emails[0] && (
                        <span className="block truncate text-[12px] text-txt-muted">
                          {contact.emails[0]}
                        </span>
                      )}
                    </span>
                  </button>
                  <Tooltip tip={t("common.remove_from_group")}>
                    <button
                      aria-label={t("common.remove_from_group")}
                      className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] text-txt-muted opacity-0 transition-opacity hover:text-[var(--color-danger)] focus-visible:opacity-100 group-hover/member:opacity-100"
                      type="button"
                      onClick={() => void remove_member(contact)}
                    >
                      <UserMinusIcon className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
              ))
            )}
          </div>
        </div>
        {modal}
      </>
    );
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2">
        {is_loading ? (
          group_skeletons
        ) : load_error ? (
          <div className="contact_empty_state">
            <span className="contact_empty_state_glyph">
              <UserGroupIcon className="h-8 w-8" strokeWidth={1.25} />
            </span>
            <p className="mb-1 text-[14px] font-medium text-txt-primary">
              {t("common.failed_to_load_groups")}
            </p>
            <p className="mb-4 max-w-[260px] text-[12.5px] text-txt-muted">
              {load_error}
            </p>
            <Button
              size="md"
              variant="secondary"
              onClick={() => {
                set_is_loading(true);
                void load();
              }}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : visible_groups.length === 0 ? (
          <div className="contact_empty_state">
            <span className="contact_empty_state_glyph">
              <UserGroupIcon className="h-8 w-8" strokeWidth={1.25} />
            </span>
            <p className="mb-1 text-[14px] font-medium text-txt-primary">
              {search_query.trim()
                ? t("common.no_groups_match", { query: search_query.trim() })
                : t("common.no_groups_yet")}
            </p>
            <p className="mb-4 max-w-[280px] text-[12.5px] text-txt-muted">
              {t("common.group_modal_description")}
            </p>
            {!search_query.trim() && (
              <Button size="md" onClick={on_modal_open}>
                <PlusIcon className="h-3.5 w-3.5" />
                {t("common.add_group")}
              </Button>
            )}
          </div>
        ) : (
          visible_groups.map((group) => (
            <div
              key={group.id}
              className="contact_group_row group/group my-0.5 flex w-full items-center gap-3 px-3 py-2"
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-3 text-start"
                type="button"
                onClick={() => open(group)}
              >
                <span
                  className="contact_group_badge"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${group.color || DEFAULT_CONTACT_GROUP_COLOR} 18%, var(--bg-primary))`,
                  }}
                >
                  <ContactGroupGlyph color={group.color} icon={group.icon} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="contact_group_row_name block truncate text-[14px] font-medium text-txt-primary">
                    {group.name}
                  </span>
                  <span className="contact_group_row_sub block text-[12px] text-txt-muted">
                    {t("common.group_contact_count", {
                      count: group.contact_count ?? 0,
                    })}
                  </span>
                </span>
              </button>
              <Tooltip tip={t("common.delete_group")}>
                <button
                  aria-label={t("common.delete_group")}
                  className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] text-txt-muted opacity-0 transition-opacity hover:text-[var(--color-danger)] focus-visible:opacity-100 group-hover/group:opacity-100"
                  type="button"
                  onClick={() => set_group_to_delete(group)}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
          ))
        )}
      </div>
      {modal}
    </>
  );
}
