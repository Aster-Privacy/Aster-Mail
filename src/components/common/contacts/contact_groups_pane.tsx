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

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeftIcon,
  CloudIcon,
  EllipsisHorizontalIcon,
  EnvelopeIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  UserGroupIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@aster/ui";

import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import { ContactAvatar } from "@/components/common/contacts/contact_avatar";
import { ContactGroupAvatar } from "@/components/common/contacts/contact_group_glyph";
import { ContactGroupAddMembersModal } from "@/components/common/contacts/contact_group_add_members_modal";
import {
  GROUP_VIEW_PARAM,
  contact_display_name,
  group_member_count,
  group_member_counts,
  group_member_emails,
  group_members,
} from "@/components/common/contacts/contact_group_members";
import { ContactGroupModal } from "@/components/contacts/contact_group_modal";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { show_toast } from "@/components/toast/simple_toast";
import { MAIL_EVENTS, mail_event_bus } from "@/hooks/mail_events";
import {
  CONTACT_GROUPS_CHANGED_EVENT,
  emit_contact_groups_changed,
} from "@/hooks/use_contact_groups";
import {
  delete_contact_group,
  list_contact_groups,
} from "@/services/api/contacts";

export type ContactsLoadStatus = "loading" | "ready" | "failed";

interface ContactGroupsPaneProps {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  contacts: DecryptedContact[];
  contacts_status: ContactsLoadStatus;
  selected_contact_id?: string | null;
  is_active: boolean;
  search_query: string;
  is_modal_open: boolean;
  on_modal_open: () => void;
  on_modal_close: () => void;
  on_count_change: (count: number) => void;
  on_open_contact: (contact: DecryptedContact) => void;
  on_compose_to: (recipients: string) => void;
  on_set_members: (
    group_id: string,
    contact_ids: string[],
    should_add: boolean,
  ) => Promise<boolean>;
  on_refresh_memberships: () => void;
  on_retry_contacts: () => void;
}

const GROUP_VIEW_REFRESH_MS = 30_000;

interface GroupViewHistoryState {
  group_view_pushed?: boolean;
}

export function ContactGroupsPane({
  t,
  contacts,
  contacts_status,
  selected_contact_id = null,
  is_active,
  search_query,
  is_modal_open,
  on_modal_open,
  on_modal_close,
  on_count_change,
  on_open_contact,
  on_compose_to,
  on_set_members,
  on_refresh_memberships,
  on_retry_contacts,
}: ContactGroupsPaneProps) {
  const [groups, set_groups] = useState<ContactGroup[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [groups_loaded, set_groups_loaded] = useState(false);
  const [load_error, set_load_error] = useState<string | null>(null);
  const [group_to_delete, set_group_to_delete] = useState<ContactGroup | null>(
    null,
  );
  const [group_to_edit, set_group_to_edit] = useState<ContactGroup | null>(
    null,
  );
  const [group_to_fill, set_group_to_fill] = useState<ContactGroup | null>(
    null,
  );
  const [pending_removal, set_pending_removal] = useState<Set<string>>(
    () => new Set(),
  );

  const [search_params, set_search_params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const open_group_id = search_params.get(GROUP_VIEW_PARAM);

  const count_change_ref = useRef(on_count_change);
  const refresh_memberships_ref = useRef(on_refresh_memberships);
  const seen_groups_ref = useRef(new Set<string>());
  const deleted_here_ref = useRef(new Set<string>());
  const list_scroll_ref = useRef<HTMLDivElement>(null);
  const saved_scroll_ref = useRef(0);
  const row_refs = useRef(new Map<string, HTMLButtonElement>());
  const back_button_ref = useRef<HTMLButtonElement>(null);
  const last_open_ref = useRef<string | null>(null);
  const load_seq_ref = useRef(0);

  count_change_ref.current = on_count_change;
  refresh_memberships_ref.current = on_refresh_memberships;

  const load = useCallback(async () => {
    const seq = ++load_seq_ref.current;
    const response = await list_contact_groups();

    if (seq !== load_seq_ref.current) return;
    set_is_loading(false);

    if (response.error || !response.data) {
      set_load_error(response.error || t("common.failed_to_load_groups"));

      return;
    }
    set_load_error(null);
    set_groups(response.data.groups);
    set_groups_loaded(true);
    count_change_ref.current(response.data.groups.length);
  }, [t]);

  useEffect(() => {
    void load();

    const reload = () => {
      void load();
    };
    const unsubscribe = mail_event_bus.subscribe(
      MAIL_EVENTS.CONTACTS_CHANGED,
      reload,
    );

    window.addEventListener(CONTACT_GROUPS_CHANGED_EVENT, reload);

    return () => {
      unsubscribe();
      window.removeEventListener(CONTACT_GROUPS_CHANGED_EVENT, reload);
    };
  }, [load]);

  const open_group = useMemo(
    () =>
      open_group_id
        ? (groups.find((group) => group.id === open_group_id) ?? null)
        : null,
    [groups, open_group_id],
  );

  useEffect(() => {
    for (const group of groups) seen_groups_ref.current.add(group.id);
  }, [groups]);

  const pushed_view =
    (location.state as GroupViewHistoryState | null)?.group_view_pushed ===
    true;

  const close_view = useCallback(
    (prefer_history: boolean) => {
      if (prefer_history && pushed_view) {
        navigate(-1);

        return;
      }
      set_search_params(
        (previous) => {
          const next = new URLSearchParams(previous);

          next.delete(GROUP_VIEW_PARAM);

          return next;
        },
        { replace: true },
      );
    },
    [navigate, pushed_view, set_search_params],
  );

  const open_view = useCallback(
    (group: ContactGroup) => {
      if (list_scroll_ref.current) {
        saved_scroll_ref.current = list_scroll_ref.current.scrollTop;
      }
      const next = new URLSearchParams(search_params);

      next.set(GROUP_VIEW_PARAM, group.id);
      set_search_params(next, {
        state: { group_view_pushed: true } satisfies GroupViewHistoryState,
      });
    },
    [search_params, set_search_params],
  );

  useEffect(() => {
    if (!open_group_id) return;
    if (!groups_loaded || load_error) return;
    if (open_group) return;

    const was_known = seen_groups_ref.current.has(open_group_id);
    const deleted_here = deleted_here_ref.current.has(open_group_id);

    if (was_known && !deleted_here) {
      show_toast(t("common.group_deleted"), "info");
    }
    close_view(false);
  }, [close_view, groups_loaded, load_error, open_group, open_group_id, t]);

  useEffect(() => {
    if (!open_group_id) return;
    refresh_memberships_ref.current();
  }, [open_group_id]);

  useEffect(() => {
    if (!open_group_id || !is_active) return;

    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void load();
      refresh_memberships_ref.current();
    };
    const on_visibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refresh, GROUP_VIEW_REFRESH_MS);

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", on_visibility);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", on_visibility);
    };
  }, [is_active, load, open_group_id]);

  useLayoutEffect(() => {
    const previous = last_open_ref.current;

    last_open_ref.current = open_group_id;
    if (previous === open_group_id) return;

    if (open_group_id) {
      if (is_active) back_button_ref.current?.focus({ preventScroll: true });

      return;
    }
    if (list_scroll_ref.current) {
      list_scroll_ref.current.scrollTop = saved_scroll_ref.current;
    }
    if (previous && is_active) {
      row_refs.current.get(previous)?.focus({ preventScroll: true });
    }
  }, [is_active, open_group_id, open_group]);

  const confirm_delete = useCallback(async () => {
    const group = group_to_delete;

    if (!group) return;
    set_group_to_delete(null);
    const response = await delete_contact_group(group.id);

    if (response.error) {
      show_toast(response.error || t("common.failed_to_delete_group"), "error");

      return;
    }
    deleted_here_ref.current.add(group.id);
    show_toast(t("common.group_deleted"), "success");
    if (open_group_id === group.id) close_view(true);
    emit_contact_groups_changed();
    refresh_memberships_ref.current();
    void load();
  }, [close_view, group_to_delete, load, open_group_id, t]);

  const remove_member = useCallback(
    async (contact: DecryptedContact) => {
      if (!open_group) return;
      const group_id = open_group.id;

      set_pending_removal((previous) => new Set(previous).add(contact.id));
      await on_set_members(group_id, [contact.id], false);
      set_pending_removal((previous) => {
        const next = new Set(previous);

        next.delete(contact.id);

        return next;
      });
      void load();
    },
    [load, on_set_members, open_group],
  );

  const add_members = useCallback(
    async (contact_ids: string[]) => {
      if (!group_to_fill) return false;
      const ok = await on_set_members(group_to_fill.id, contact_ids, true);

      void load();

      return ok;
    },
    [group_to_fill, load, on_set_members],
  );

  const visible_groups = useMemo(() => {
    const needle = search_query.trim().toLowerCase();
    const matched = needle
      ? groups.filter((group) => group.name.toLowerCase().includes(needle))
      : groups;

    return [...matched].sort((a, b) => a.name.localeCompare(b.name));
  }, [groups, search_query]);

  const contacts_ready = contacts_status === "ready";
  const member_counts = useMemo(
    () => group_member_counts(contacts),
    [contacts],
  );

  const count_of = useCallback(
    (group: ContactGroup) =>
      group_member_count(group, member_counts, contacts_ready),
    [contacts_ready, member_counts],
  );

  const members = useMemo(
    () => (open_group_id ? group_members(contacts, open_group_id) : []),
    [contacts, open_group_id],
  );

  const member_emails = useMemo(() => group_member_emails(members), [members]);

  const group_skeletons = (
    <div className="px-1" data-testid="contact_group_loading">
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

  const modals = (
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
      <ContactGroupModal
        group={group_to_edit}
        is_open={!!group_to_edit}
        on_close={() => set_group_to_edit(null)}
        on_saved={() => {
          show_toast(t("common.saved"), "success");
          void load();
        }}
      />
      <ContactGroupAddMembersModal
        contacts={contacts}
        group={group_to_fill}
        on_add={add_members}
        on_close={() => set_group_to_fill(null)}
        t={t}
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

  const render_group_view = () => {
    if (!open_group) {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-shrink-0 items-center gap-3 px-4 py-3">
            <Tooltip tip={t("common.back")}>
              <button
                ref={back_button_ref}
                aria-label={t("common.back")}
                className="contact_group_icon_button"
                data-testid="contact_group_back"
                type="button"
                onClick={() => close_view(true)}
              >
                <ArrowLeftIcon className="h-[18px] w-[18px] rtl:rotate-180" />
              </button>
            </Tooltip>
            {!load_error && <Skeleton className="h-[14px] w-36" />}
          </div>
          {load_error ? (
            <div className="contact_empty_state">
              <span className="contact_empty_state_glyph">
                <CloudIcon strokeWidth={1.25} />
              </span>
              <p className="contact_empty_state_title">
                {t("common.failed_to_load_groups")}
              </p>
              <p className="contact_empty_state_text">{load_error}</p>
              <Button
                className="contact_empty_state_action"
                size="md"
                variant="secondary"
                onClick={() => void load()}
              >
                {t("common.retry")}
              </Button>
            </div>
          ) : (
            group_skeletons
          )}
        </div>
      );
    }

    const count = count_of(open_group);

    return (
      <div
        className="flex min-h-0 flex-1 flex-col"
        data-testid="contact_group_view"
      >
        <div className="contact_group_header flex flex-shrink-0 items-center gap-2 px-3 py-3 @min-[420px]/contact-list:gap-3 @min-[420px]/contact-list:px-4">
          <Tooltip tip={t("common.back")}>
            <button
              ref={back_button_ref}
              aria-label={t("common.back")}
              className="contact_group_icon_button"
              data-testid="contact_group_back"
              type="button"
              onClick={() => close_view(true)}
            >
              <ArrowLeftIcon className="h-[18px] w-[18px] rtl:rotate-180" />
            </button>
          </Tooltip>
          <ContactGroupAvatar
            color={open_group.color}
            icon={open_group.icon}
            size_px={40}
          />
          <div className="min-w-0 flex-1">
            <h2
              className="truncate text-[16px] font-semibold leading-[1.3] tracking-[-0.01em] text-txt-primary"
              data-testid="contact_group_title"
              title={open_group.name}
            >
              {open_group.name}
            </h2>
            <p
              className="truncate text-[12.5px] leading-[1.35] text-txt-muted"
              data-testid="contact_group_count"
            >
              {t("common.group_member_count", { count })}
            </p>
          </div>
          <Button
            aria-label={t("common.add_members")}
            className="h-9 flex-shrink-0 gap-1.5 rounded-[var(--aster-radius-control)] px-2.5 text-[13px] font-medium @min-[420px]/contact-list:px-3.5"
            data-testid="contact_group_add"
            disabled={!contacts_ready}
            size="sm"
            variant="primary"
            onClick={() => set_group_to_fill(open_group)}
          >
            <UserPlusIcon className="h-4 w-4" />
            <span className="hidden @min-[420px]/contact-list:inline">
              {t("common.add_members")}
            </span>
          </Button>
          <DropdownMenu>
            <Tooltip tip={t("common.more_actions")}>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={t("common.more_actions")}
                  className="contact_group_icon_button h-9 w-9"
                  data-testid="contact_group_menu"
                  type="button"
                >
                  <EllipsisHorizontalIcon className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="end" className="min-w-52">
              {member_emails && (
                <DropdownMenuItem
                  data-testid="contact_group_email"
                  onSelect={() => on_compose_to(member_emails)}
                >
                  <EnvelopeIcon className="h-4 w-4" />
                  {t("common.email_group")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                data-testid="contact_group_edit"
                onSelect={() => set_group_to_edit(open_group)}
              >
                <PencilSquareIcon className="h-4 w-4" />
                {t("common.edit_group")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                data-testid="contact_group_delete"
                onSelect={() => set_group_to_delete(open_group)}
              >
                <TrashIcon className="h-4 w-4" />
                {t("common.delete_group")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2">
          {contacts_status === "loading" ? (
            group_skeletons
          ) : contacts_status === "failed" ? (
            <div className="contact_empty_state">
              <span className="contact_empty_state_glyph">
                <CloudIcon strokeWidth={1.25} />
              </span>
              <p className="contact_empty_state_title">
                {t("common.failed_to_fetch_contacts")}
              </p>
              <Button
                className="contact_empty_state_action"
                size="md"
                variant="secondary"
                onClick={on_retry_contacts}
              >
                {t("common.retry")}
              </Button>
            </div>
          ) : members.length === 0 ? (
            <div
              className="contact_empty_state"
              data-testid="contact_group_empty"
            >
              <span className="contact_empty_state_glyph">
                <UserGroupIcon strokeWidth={1.25} />
              </span>
              <p className="contact_empty_state_title">
                {t("common.group_empty_title")}
              </p>
              <p className="contact_empty_state_text">
                {t("common.group_empty_add_hint")}
              </p>
              <Button
                className="contact_empty_state_action"
                data-testid="contact_group_empty_add"
                size="md"
                onClick={() => set_group_to_fill(open_group)}
              >
                <UserPlusIcon className="h-3.5 w-3.5" />
                {t("common.add_members")}
              </Button>
            </div>
          ) : (
            <ul
              aria-label={t("common.group_members_label", {
                name: open_group.name,
              })}
              className="flex flex-col px-1"
            >
              {members.map((contact) => {
                const name = contact_display_name(contact);
                const primary_email = contact.emails[0];
                const is_selected = selected_contact_id === contact.id;

                return (
                  <li
                    key={contact.id}
                    className="contact_group_member_row my-px flex w-full items-center gap-3 px-2.5 py-1.5"
                    data-active={is_selected}
                    data-testid={`contact_group_member_${contact.id}`}
                    style={{
                      contentVisibility: "auto",
                      containIntrinsicSize: "auto 54px",
                    }}
                  >
                    <button
                      aria-current={is_selected ? "true" : undefined}
                      className="flex min-w-0 flex-1 items-center gap-3 text-start"
                      type="button"
                      onClick={() => on_open_contact(contact)}
                    >
                      <ContactAvatar
                        avatar_url={contact.avatar_url}
                        email={primary_email}
                        name={name}
                        profile_color={contact.profile_color}
                        size_px={40}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="contact_row_name block truncate text-[14px] font-medium text-txt-primary">
                          {name || t("common.unnamed")}
                        </span>
                        {primary_email && name !== primary_email && (
                          <span className="contact_row_sub block truncate text-[12px] text-txt-muted">
                            {primary_email}
                          </span>
                        )}
                      </span>
                    </button>
                    <Tooltip tip={t("common.remove_from_group")}>
                      <button
                        aria-label={`${t("common.remove_from_group")}: ${name || t("common.unnamed")}`}
                        className="contact_group_icon_button contact_group_reveal disabled:opacity-40"
                        data-testid={`contact_group_remove_${contact.id}`}
                        data-tone="danger"
                        disabled={pending_removal.has(contact.id)}
                        type="button"
                        onClick={() => void remove_member(contact)}
                      >
                        <UserMinusIcon className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {open_group_id && render_group_view()}
      <div
        ref={list_scroll_ref}
        className={
          open_group_id
            ? "hidden"
            : "flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2"
        }
        data-testid="contact_groups_list"
      >
        {is_loading ? (
          group_skeletons
        ) : load_error && !groups_loaded ? (
          <div className="contact_empty_state">
            <span className="contact_empty_state_glyph">
              <UserGroupIcon strokeWidth={1.25} />
            </span>
            <p className="contact_empty_state_title">
              {t("common.failed_to_load_groups")}
            </p>
            <p className="contact_empty_state_text">{load_error}</p>
            <Button
              className="contact_empty_state_action"
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
              <UserGroupIcon strokeWidth={1.25} />
            </span>
            <p className="contact_empty_state_title">
              {search_query.trim()
                ? t("common.no_groups_match", { query: search_query.trim() })
                : t("common.no_groups_yet")}
            </p>
            <p className="contact_empty_state_text">
              {t("common.group_modal_description")}
            </p>
            {!search_query.trim() && (
              <Button
                className="contact_empty_state_action"
                size="md"
                onClick={on_modal_open}
              >
                <PlusIcon className="h-3.5 w-3.5" />
                {t("common.add_group")}
              </Button>
            )}
          </div>
        ) : (
          visible_groups.map((group) => {
            const count_label = t("common.group_member_count", {
              count: count_of(group),
            });

            return (
              <div
                key={group.id}
                className="contact_group_row my-0.5 flex w-full items-center gap-1 rounded-[var(--aster-radius-control)] py-1.5 pe-2 ps-3"
              >
                <button
                  ref={(element) => {
                    if (element) row_refs.current.set(group.id, element);
                    else row_refs.current.delete(group.id);
                  }}
                  aria-label={t("common.open_group_label", {
                    name: group.name,
                    count: count_label,
                  })}
                  className="flex min-w-0 flex-1 items-center gap-3 text-start"
                  data-testid={`contact_group_row_${group.id}`}
                  type="button"
                  onClick={() => open_view(group)}
                >
                  <ContactGroupAvatar
                    color={group.color}
                    icon={group.icon}
                    size_px={40}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="contact_group_row_name block truncate text-[14px] font-medium text-txt-primary">
                      {group.name}
                    </span>
                    <span className="contact_group_row_sub block truncate text-[12px] text-txt-muted">
                      {count_label}
                    </span>
                  </span>
                </button>
                <Tooltip tip={t("common.edit_group")}>
                  <button
                    aria-label={`${t("common.edit_group")}: ${group.name}`}
                    className="contact_group_icon_button contact_group_reveal"
                    data-testid={`contact_group_row_edit_${group.id}`}
                    type="button"
                    onClick={() => set_group_to_edit(group)}
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </button>
                </Tooltip>
                <Tooltip tip={t("common.delete_group")}>
                  <button
                    aria-label={`${t("common.delete_group")}: ${group.name}`}
                    className="contact_group_icon_button contact_group_reveal"
                    data-testid={`contact_group_row_delete_${group.id}`}
                    data-tone="danger"
                    type="button"
                    onClick={() => set_group_to_delete(group)}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>
            );
          })
        )}
      </div>
      {modals}
    </>
  );
}
