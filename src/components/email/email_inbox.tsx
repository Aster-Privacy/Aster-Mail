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
import type { EmailInboxProps } from "@/components/email/inbox/inbox_types";

import { EmailListHeader } from "@/components/email/email_list_header";
import { CategoryTabs } from "@/components/email/inbox/category_tabs";
import { MailFilterChips } from "@/components/email/inbox/mail_filter_chips";
import { CategoryEmptyState } from "@/components/email/inbox/category_empty_state";
import { ErrorBoundary } from "@/components/ui/error_boundary";
import { SplitEmailViewer } from "@/components/email/split_email_viewer";
import { SplitScheduledViewer } from "@/components/scheduled/split_scheduled_viewer";
import { FullEmailViewer } from "@/components/email/full_email_viewer";
import { resolve_list_density } from "@/lib/list_density";
import {
  get_view_title,
  get_search_context,
} from "@/components/email/inbox/inbox_view_helpers";
import { InboxDialogs } from "@/components/email/inbox/inbox_dialogs";
import { ConfirmModal } from "@/components/email/inbox/inbox_confirmation_dialog";
import {
  EmailList,
  LoadingState,
  EmptyState,
  FolderNotFoundState,
  TagNotFoundState,
  LockedFolderState,
} from "@/components/email/inbox/inbox_email_list";
import { BottomPagination } from "@/components/email/inbox/inbox_bottom_pagination";
import { StorageBanner } from "@/components/email/inbox/inbox_storage_banner";
import { TrashBanner } from "@/components/email/inbox/inbox_trash_banner";

export type {
  ReplyData,
  ForwardData,
  DraftClickData,
  ScheduledClickData,
} from "@/components/email/inbox/inbox_types";
import { use_email_inbox_state } from "./use_email_inbox_state";

export function EmailInbox(props: EmailInboxProps): React.ReactElement {
  const {
    on_settings_click,
    on_quick_settings_click,
    current_view,
    on_compose,
    on_reply,
    on_forward,
    split_email_id,
    split_local_email,
    on_split_close,
    split_scheduled_data,
    on_split_scheduled_close,
    on_scheduled_edit,
    on_search_click,
    on_search_result_click,
    on_search_submit,
    focused_email_id,
    active_email_id,
    on_view_change,
  } = props;
  const {
    t,
    user,
    preferences,
    mail_stats,
    folders_state,
    tags_state,
    current_page,
    page_size,
    categories,
    is_drafts_view,
    is_scheduled_view,
    is_archive_view,
    spam_retention_days,
    family_policy,
    folder_not_found,
    tag_not_found,
    locked_folder,
    refresh_current_view,
    manual_refresh_active,
    handle_snooze,
    handle_category_change,
    email_state,
    handle_edit_thread_draft,
    toolbar,
    context_menu_actions,
    active_filter,
    custom_snooze_email,
    set_custom_snooze_email,
    show_toolbar_custom_snooze,
    set_show_toolbar_custom_snooze,
    filtered_emails,
    pinned_emails,
    primary_emails,
    handle_category_drop,
    empty_state_visible,
    skeleton_visible,
    effective_total_for_pages,
    header_display_count,
    total_pages,
    selection,
    scope_for_view,
    active_category_title,
    pending_select_all_action,
    set_pending_select_all_action,
    handle_delete_wrapped,
    handle_archive_wrapped,
    handle_unarchive_wrapped,
    handle_spam_wrapped,
    handle_mark_read_wrapped,
    handle_mark_unread_wrapped,
    handle_toggle_star_wrapped,
    handle_restore_wrapped,
    handle_folder_toggle_wrapped,
    handle_tag_toggle_wrapped,
    handle_snooze_wrapped,
    selection_menu,
    nav,
    is_split_view,
    is_full_view_mode,
    show_full_email_viewer,
    split_email_snoozed_until,
    split_email_grouped_ids,
    split_email_label_hints,
    handle_list_snooze,
    handle_list_unsnooze,
    list_tags,
    viewer_folders,
    handle_viewer_folder_toggle,
    is_bottom_pane,
    split_pane,
    handle_list_scroll,
    handle_page_change,
    handle_filter_change,
  } = use_email_inbox_state(props);

  const handle_viewer_snooze = () => {
    const target = email_state.emails.find(
      (item) => item.id === split_email_id,
    );

    if (target) set_custom_snooze_email(target);
  };

  const email_list_content = (
    <>
      {folder_not_found ? (
        <FolderNotFoundState />
      ) : tag_not_found ? (
        <TagNotFoundState />
      ) : locked_folder ? (
        <LockedFolderState
          folder_id={locked_folder.id}
          folder_name={locked_folder.name}
        />
      ) : empty_state_visible ? (
        categories.enabled && !email_state.has_load_error ? (
          <CategoryEmptyState category={categories.active_category} />
        ) : (
          <EmptyState
            current_view={current_view}
            has_load_error={email_state.has_load_error}
            on_retry={refresh_current_view}
            user_email={user?.email}
          />
        )
      ) : (
        <div className="relative min-h-full -mt-px border-t border-edge-secondary">
          <div>
            {filtered_emails.length > 0 && (
              <EmailList
                categories_enabled={categories.enabled}
                current_view={current_view}
                density={resolve_list_density(preferences.mail_list_density)}
                focused_email_id={focused_email_id}
                folders={viewer_folders}
                on_archive={context_menu_actions.handle_archive}
                on_category_change={handle_category_change}
                on_custom_snooze={set_custom_snooze_email}
                on_delete={context_menu_actions.handle_delete}
                on_email_click={nav.handle_email_click}
                on_find_from_sender={
                  context_menu_actions.handle_find_from_sender
                }
                on_folder_toggle={context_menu_actions.handle_folder_toggle}
                on_forward={context_menu_actions.handle_forward}
                on_mark_not_spam={context_menu_actions.handle_mark_not_spam}
                on_move_to_inbox={context_menu_actions.handle_move_to_inbox}
                on_open_in_new_window={
                  context_menu_actions.handle_open_in_new_window
                }
                on_reply={context_menu_actions.handle_reply}
                on_reply_all={context_menu_actions.handle_reply_all}
                on_restore={context_menu_actions.handle_restore}
                on_select_only={selection.handle_select_only}
                on_snooze={handle_list_snooze}
                on_spam={context_menu_actions.handle_spam}
                on_tag_toggle={context_menu_actions.handle_tag_toggle}
                on_toggle_pin={context_menu_actions.handle_toggle_pin}
                on_toggle_read={context_menu_actions.handle_toggle_read}
                on_toggle_select={selection.handle_toggle_select}
                on_toggle_star={context_menu_actions.handle_toggle_star}
                on_unsnooze={handle_list_unsnooze}
                pinned_emails={pinned_emails}
                primary_emails={primary_emails}
                selected_email_id={active_email_id ?? split_scheduled_data?.id}
                selection_menu={selection_menu}
                show_email_preview={preferences.show_email_preview}
                show_message_size={preferences.show_message_size}
                show_profile_pictures={preferences.show_profile_pictures}
                show_thread_count={preferences.conversation_grouping !== false}
                tags={list_tags}
              />
            )}
            {!skeleton_visible &&
              filtered_emails.length > 0 &&
              total_pages > 1 && (
                <BottomPagination
                  current_page={current_page}
                  on_page_change={handle_page_change}
                  total_pages={total_pages}
                />
              )}
          </div>
          {(skeleton_visible ||
            manual_refresh_active ||
            (email_state.is_loading_more && primary_emails.length === 0)) && (
            <div className="absolute inset-0 z-10 bg-surf-primary">
              <LoadingState />
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-full bg-surf-primary">
        {!show_full_email_viewer && (
          <EmailListHeader
            active_filter={active_filter}
            all_selected={selection.all_selected}
            can_go_next={nav.local_can_go_next}
            can_go_prev={nav.local_can_go_prev}
            current_email_index={nav.local_email_index}
            current_page={current_page}
            display_count={header_display_count}
            excluded_count={selection.excluded_ids.length}
            filtered_count={effective_total_for_pages}
            folders={folders_state.folders
              .filter((f) => !f.is_system)
              .map((f) => ({
                folder_token: f.folder_token,
                name: f.name,
                color: f.color || "#6366f1",
                status: selection.get_folder_status_for_selection(
                  f.folder_token,
                ),
              }))}
            is_archive_view={is_archive_view}
            is_drafts_view={is_drafts_view}
            is_scheduled_view={is_scheduled_view}
            is_spam_view={current_view === "spam"}
            is_trash_view={current_view === "trash"}
            on_activate_select_all_mode={
              scope_for_view ? selection.activate_select_all_mode : undefined
            }
            on_archive={handle_archive_wrapped}
            on_clear_selection={selection.handle_clear_selection}
            on_compose={on_compose}
            on_delete={handle_delete_wrapped}
            on_empty_spam={toolbar.handle_empty_spam}
            on_empty_trash={toolbar.handle_empty_trash}
            on_filter_change={handle_filter_change}
            on_folder_toggle={(folder_token) => {
              handle_folder_toggle_wrapped(
                folder_token,
                selection.get_folder_status_for_selection(folder_token) ===
                  "all",
              );
            }}
            on_mark_read={handle_mark_read_wrapped}
            on_mark_unread={handle_mark_unread_wrapped}
            on_navigate_next={
              nav.effective_email_id
                ? nav.handle_local_navigate_next
                : undefined
            }
            on_navigate_prev={
              nav.effective_email_id
                ? nav.handle_local_navigate_prev
                : undefined
            }
            on_page_change={
              show_full_email_viewer || nav.effective_email_id
                ? undefined
                : handle_page_change
            }
            on_quick_settings_click={on_quick_settings_click}
            on_restore={handle_restore_wrapped}
            on_search_click={on_search_click}
            on_search_result_click={on_search_result_click}
            on_search_submit={on_search_submit}
            on_select_by_filter={selection.handle_select_by_filter}
            on_settings_click={on_settings_click}
            on_snooze={handle_snooze_wrapped}
            on_spam={handle_spam_wrapped}
            on_tag_toggle={(tag_token) => {
              handle_tag_toggle_wrapped(
                tag_token,
                selection.get_tag_status_for_selection(tag_token) === "all",
              );
            }}
            on_toggle_select_all={
              show_full_email_viewer
                ? undefined
                : selection.handle_toggle_select_all
            }
            on_toggle_star={handle_toggle_star_wrapped}
            on_unarchive={handle_unarchive_wrapped}
            on_view_change={on_view_change}
            page_selected_count={selection.page_selected_count}
            page_size={page_size}
            search_context={get_search_context(
              current_view,
              folders_state.folders,
              tags_state.tags,
            )}
            select_all_mode={selection.select_all_mode}
            selected_count={selection.selected_count}
            selection_scope_title={active_category_title}
            some_selected={selection.some_selected}
            spam_count={email_state.emails.filter((e) => e.is_spam).length}
            tags={tags_state.tags.map((t) => ({
              tag_token: t.tag_token,
              name: t.name,
              color: t.color || "#6366f1",
              status: selection.get_tag_status_for_selection(t.tag_token),
            }))}
            total_email_count={nav.visible_ids.length}
            total_messages={effective_total_for_pages}
            trash_count={mail_stats.trash}
            view_title={get_view_title(
              current_view,
              folders_state.folders,
              tags_state.tags,
              t,
            )}
          />
        )}

        {current_view === "all" &&
          !show_full_email_viewer &&
          on_search_submit && (
            <MailFilterChips on_search_submit={on_search_submit} />
          )}

        {categories.enabled &&
          categories.restored &&
          !show_full_email_viewer && (
            <CategoryTabs
              active_category={categories.active_category}
              counts={categories.counts}
              on_category_drop={handle_category_drop}
              on_change={categories.set_active_category}
            />
          )}

        {!categories.enabled && !show_full_email_viewer && (
          <div
            aria-hidden="true"
            className="border-t border-edge-secondary shrink-0"
          />
        )}

        <StorageBanner
          storage_total_bytes={mail_stats.storage_total_bytes}
          storage_used_bytes={mail_stats.storage_used_bytes}
        />

        {(current_view === "trash" || current_view === "spam") &&
          (() => {
            const is_trash = current_view === "trash";
            const family_enforced = !!family_policy?.enforce_on_members;
            let effective_days: number | null;
            let banner_family_enforced: boolean;

            if (is_trash) {
              if (
                family_enforced &&
                family_policy?.trash_retention_days != null &&
                family_policy.trash_retention_days > 0
              ) {
                effective_days = family_policy.trash_retention_days;
                banner_family_enforced = true;
              } else {
                effective_days = null;
                banner_family_enforced = false;
              }
            } else {
              if (
                family_enforced &&
                family_policy?.spam_retention_days != null &&
                family_policy.spam_retention_days > 0
              ) {
                effective_days = family_policy.spam_retention_days;
                banner_family_enforced = true;
              } else {
                effective_days = spam_retention_days;
                banner_family_enforced = false;
              }
            }

            return effective_days !== null && effective_days > 0 ? (
              <TrashBanner
                family_enforced={banner_family_enforced}
                retention_days={effective_days}
                view={current_view as "trash" | "spam"}
              />
            ) : null;
          })()}

        {show_full_email_viewer && split_email_id ? (
          <div className="flex-1 overflow-hidden">
            <FullEmailViewer
              can_go_next={nav.local_can_go_next}
              can_go_prev={nav.local_can_go_prev}
              current_index={
                nav.local_email_index >= 0 ? nav.local_email_index : undefined
              }
              email_id={split_email_id}
              folders={viewer_folders}
              grouped_email_ids={split_email_grouped_ids}
              label_hints={split_email_label_hints}
              local_email={split_local_email ?? undefined}
              on_back={on_split_close || (() => {})}
              on_edit_draft={handle_edit_thread_draft}
              on_folder_toggle={handle_viewer_folder_toggle}
              on_forward={on_forward}
              on_navigate_next={
                nav.effective_email_id
                  ? nav.handle_local_navigate_next
                  : undefined
              }
              on_navigate_prev={
                nav.effective_email_id
                  ? nav.handle_local_navigate_prev
                  : undefined
              }
              on_reply={on_reply}
              on_snooze={handle_viewer_snooze}
              snoozed_until={split_email_snoozed_until}
              total_count={nav.visible_ids.length}
            />
          </div>
        ) : is_split_view && !is_full_view_mode ? (
          <div
            className={`flex-1 flex min-h-0 ${is_bottom_pane ? "flex-col" : ""}`}
          >
            <div
              ref={split_pane.list_panel_ref}
              className="overflow-y-auto overflow-x-hidden relative"
              style={
                is_bottom_pane
                  ? {
                      height: split_pane.pane_height,
                      flexShrink: 0,
                      flexGrow: 0,
                      overflowAnchor: "none",
                    }
                  : {
                      width: split_pane.pane_width,
                      flexShrink: 0,
                      flexGrow: 0,
                      overflowAnchor: "none",
                    }
              }
            >
              {email_list_content}
            </div>
            <div
              className={`${is_bottom_pane ? "h-px cursor-row-resize" : "w-px cursor-col-resize"} relative hover:bg-blue-500 shrink-0 ${split_pane.is_dragging ? "bg-blue-500" : "bg-edge-primary"}`}
              role="presentation"
              onMouseDown={split_pane.handle_drag_start}
            >
              {is_bottom_pane ? (
                <div className="absolute inset-x-0 -top-1.5 -bottom-1.5" />
              ) : (
                <div className="absolute inset-y-0 -start-1.5 -end-1.5" />
              )}
            </div>
            <div
              ref={split_pane.detail_panel_ref}
              className="@container overflow-hidden relative"
              style={
                is_bottom_pane
                  ? { flex: 1, minHeight: 0 }
                  : { flex: 1, minWidth: 0 }
              }
            >
              {split_scheduled_data ? (
                <SplitScheduledViewer
                  on_close={on_split_scheduled_close || (() => {})}
                  on_edit={on_scheduled_edit}
                  scheduled_data={split_scheduled_data}
                />
              ) : split_email_id ? (
                <SplitEmailViewer
                  email_id={split_email_id}
                  folders={viewer_folders}
                  grouped_email_ids={split_email_grouped_ids}
                  label_hints={split_email_label_hints}
                  local_email={split_local_email ?? undefined}
                  on_close={on_split_close || (() => {})}
                  on_folder_toggle={handle_viewer_folder_toggle}
                  on_forward={on_forward}
                  on_reply={on_reply}
                  on_snooze={handle_viewer_snooze}
                  snoozed_until={split_email_snoozed_until}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <div
            ref={split_pane.list_scroll_ref}
            className="flex-1 overflow-y-auto relative"
            style={{ overflowAnchor: "none" }}
            onScroll={handle_list_scroll}
          >
            {email_list_content}
          </div>
        )}

        <InboxDialogs
          cancel_archive={toolbar.cancel_archive}
          cancel_delete={toolbar.cancel_delete}
          cancel_empty_spam={toolbar.cancel_empty_spam}
          cancel_empty_trash={toolbar.cancel_empty_trash}
          cancel_single_archive={toolbar.cancel_single_archive}
          cancel_single_delete={toolbar.cancel_single_delete}
          cancel_single_spam={toolbar.cancel_single_spam}
          cancel_spam={toolbar.cancel_spam}
          confirm_archive={toolbar.confirm_archive}
          confirm_delete={toolbar.confirm_delete}
          confirm_empty_spam={toolbar.confirm_empty_spam}
          confirm_empty_trash={toolbar.confirm_empty_trash}
          confirm_single_archive={toolbar.confirm_single_archive}
          confirm_single_delete={toolbar.confirm_single_delete}
          confirm_single_spam={toolbar.confirm_single_spam}
          confirm_spam={toolbar.confirm_spam}
          confirmations={toolbar.confirmations}
          current_view={current_view}
          custom_snooze_open={
            custom_snooze_email !== null || show_toolbar_custom_snooze
          }
          dont_ask_archive={toolbar.dont_ask_archive}
          dont_ask_delete={toolbar.dont_ask_delete}
          dont_ask_single_archive={toolbar.dont_ask_single_archive}
          dont_ask_single_delete={toolbar.dont_ask_single_delete}
          dont_ask_single_spam={toolbar.dont_ask_single_spam}
          dont_ask_spam={toolbar.dont_ask_spam}
          is_emptying_spam={toolbar.is_emptying_spam}
          is_emptying_trash={toolbar.is_emptying_trash}
          on_custom_snooze={async (snooze_until) => {
            if (custom_snooze_email) {
              return await handle_snooze(custom_snooze_email.id, snooze_until);
            }
            if (show_toolbar_custom_snooze) {
              return await handle_snooze_wrapped(snooze_until);
            }

            return true;
          }}
          on_custom_snooze_close={() => {
            set_custom_snooze_email(null);
            set_show_toolbar_custom_snooze(false);
          }}
          set_dont_ask_archive={toolbar.set_dont_ask_archive}
          set_dont_ask_delete={toolbar.set_dont_ask_delete}
          set_dont_ask_single_archive={toolbar.set_dont_ask_single_archive}
          set_dont_ask_single_delete={toolbar.set_dont_ask_single_delete}
          set_dont_ask_single_spam={toolbar.set_dont_ask_single_spam}
          set_dont_ask_spam={toolbar.set_dont_ask_spam}
          show_empty_spam_dialog={toolbar.show_empty_spam_dialog}
          show_empty_trash_dialog={toolbar.show_empty_trash_dialog}
          show_single_archive_confirm={toolbar.show_single_archive_confirm}
          show_single_delete_confirm={toolbar.show_single_delete_confirm}
          show_single_spam_confirm={toolbar.show_single_spam_confirm}
          spam_count={email_state.emails.filter((e) => e.is_spam).length}
          trash_count={mail_stats.trash}
        />
        <ConfirmModal
          hide_dont_ask
          confirm_text={t("common.ok")}
          confirm_variant="default"
          description={t("mail.confirm_bulk_action_description")}
          dont_ask={false}
          on_cancel={() => set_pending_select_all_action(null)}
          on_confirm={() => {
            const action = pending_select_all_action;

            set_pending_select_all_action(null);
            action?.();
          }}
          on_dont_ask_change={() => {}}
          show={pending_select_all_action !== null}
          title={t("mail.confirm_bulk_action_title")}
        />
      </div>
    </ErrorBoundary>
  );
}
