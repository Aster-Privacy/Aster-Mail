import type { InboxEmail } from "@/types/email";

import { useState, useCallback, useRef } from "react";

import {
  emit_mail_item_updated,
  type MailItemUpdatedEventDetail,
} from "./mail_events";

import {
  add_mail_item_folder,
  remove_mail_item_folder,
  move_mail_item,
  restore_mail_item,
  permanent_delete_mail_item,
  batched_bulk_update,
  batched_bulk_add_folder,
  batched_bulk_remove_folder,
  type UpdateMailItemRequest,
} from "@/services/api/mail";
import {
  show_action_toast,
  update_progress_toast,
  hide_action_toast,
} from "@/components/action_toast";
import { update_item_metadata } from "@/services/crypto/mail_metadata";
import { PROGRESS_THRESHOLDS } from "@/constants/batch_config";

type ActionType =
  | "star"
  | "pin"
  | "archive"
  | "delete"
  | "spam"
  | "read"
  | "unread"
  | "label"
  | "move"
  | "restore"
  | "permanent_delete";

interface ActionState {
  is_loading: boolean;
  error: string | null;
}

type ActionStates = Record<ActionType, ActionState>;

interface PendingAction<T> {
  id: string;
  original_state: T;
  action_type: ActionType;
}

interface EmailActionsConfig {
  on_optimistic_update?: (id: string, updates: Partial<InboxEmail>) => void;
  on_bulk_optimistic_update?: (
    ids: string[],
    updates: Partial<InboxEmail>,
  ) => void;
  on_remove_from_list?: (id: string) => void;
  on_bulk_remove_from_list?: (ids: string[]) => void;
  on_error?: (error: string, action_type: ActionType) => void;
  on_success?: (action_type: ActionType, id?: string) => void;
}

interface UseEmailActionsReturn {
  action_states: ActionStates;
  is_any_action_loading: boolean;
  toggle_star: (email: InboxEmail) => Promise<boolean>;
  toggle_pin: (email: InboxEmail) => Promise<boolean>;
  toggle_read: (email: InboxEmail) => Promise<boolean>;
  mark_as_read: (email: InboxEmail) => Promise<boolean>;
  mark_as_unread: (email: InboxEmail) => Promise<boolean>;
  archive_email: (email: InboxEmail) => Promise<boolean>;
  unarchive_email: (email: InboxEmail) => Promise<boolean>;
  delete_email: (email: InboxEmail) => Promise<boolean>;
  mark_as_spam: (email: InboxEmail) => Promise<boolean>;
  unmark_spam: (email: InboxEmail) => Promise<boolean>;
  add_folder: (email: InboxEmail, folder_token: string) => Promise<boolean>;
  remove_folder: (email: InboxEmail, folder_token: string) => Promise<boolean>;
  move_to_folder: (email: InboxEmail, folder_token: string) => Promise<boolean>;
  restore_from_trash: (
    email: InboxEmail,
    restore_to?: "inbox" | "archive",
  ) => Promise<boolean>;
  permanently_delete: (email: InboxEmail) => Promise<boolean>;
  bulk_star: (emails: InboxEmail[], starred: boolean) => Promise<boolean>;
  bulk_archive: (emails: InboxEmail[]) => Promise<boolean>;
  bulk_delete: (emails: InboxEmail[]) => Promise<boolean>;
  bulk_mark_read: (emails: InboxEmail[], is_read: boolean) => Promise<boolean>;
  bulk_mark_spam: (emails: InboxEmail[]) => Promise<boolean>;
  bulk_add_folder: (
    emails: InboxEmail[],
    folder_token: string,
  ) => Promise<boolean>;
  bulk_remove_folder: (
    emails: InboxEmail[],
    folder_token: string,
  ) => Promise<boolean>;
  copy_email_id: (email: InboxEmail) => Promise<boolean>;
  copy_sender_email: (email: InboxEmail) => Promise<boolean>;
}

const INITIAL_ACTION_STATE: ActionState = {
  is_loading: false,
  error: null,
};

const INITIAL_ACTION_STATES: ActionStates = {
  star: { ...INITIAL_ACTION_STATE },
  pin: { ...INITIAL_ACTION_STATE },
  archive: { ...INITIAL_ACTION_STATE },
  delete: { ...INITIAL_ACTION_STATE },
  spam: { ...INITIAL_ACTION_STATE },
  read: { ...INITIAL_ACTION_STATE },
  unread: { ...INITIAL_ACTION_STATE },
  label: { ...INITIAL_ACTION_STATE },
  move: { ...INITIAL_ACTION_STATE },
  restore: { ...INITIAL_ACTION_STATE },
  permanent_delete: { ...INITIAL_ACTION_STATE },
};

function emit_mail_changed(): void {
  window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
}

function emit_mail_action(action: ActionType, ids: string[]): void {
  window.dispatchEvent(
    new CustomEvent("astermail:mail-action", {
      detail: { action, ids },
    }),
  );
}

const VIEW_CHANGING_ACTIONS: ActionType[] = [
  "archive",
  "delete",
  "spam",
  "restore",
  "permanent_delete",
  "move",
  "label",
];

function is_view_changing_action(action: ActionType): boolean {
  return VIEW_CHANGING_ACTIONS.includes(action);
}

export function use_email_actions(
  config: EmailActionsConfig = {},
): UseEmailActionsReturn {
  const {
    on_optimistic_update,
    on_bulk_optimistic_update,
    on_remove_from_list,
    on_bulk_remove_from_list,
    on_error,
    on_success,
  } = config;

  const [action_states, set_action_states] = useState<ActionStates>(
    INITIAL_ACTION_STATES,
  );
  const pending_actions = useRef<
    Map<string, PendingAction<Partial<InboxEmail>>>
  >(new Map());
  const bulk_abort_ref = useRef<AbortController>(new AbortController());

  const set_action_loading = useCallback(
    (action_type: ActionType, is_loading: boolean): void => {
      set_action_states((prev) => ({
        ...prev,
        [action_type]: { ...prev[action_type], is_loading, error: null },
      }));
    },
    [],
  );

  const set_action_error = useCallback(
    (action_type: ActionType, error: string): void => {
      set_action_states((prev) => ({
        ...prev,
        [action_type]: { ...prev[action_type], is_loading: false, error },
      }));
      on_error?.(error, action_type);
    },
    [on_error],
  );

  const clear_action_state = useCallback((action_type: ActionType): void => {
    set_action_states((prev) => ({
      ...prev,
      [action_type]: { ...INITIAL_ACTION_STATE },
    }));
  }, []);

  const create_pending_action = useCallback(
    (
      id: string,
      action_type: ActionType,
      original_state: Partial<InboxEmail>,
    ): void => {
      const key = `${action_type}-${id}`;

      pending_actions.current.set(key, { id, original_state, action_type });
    },
    [],
  );

  const remove_pending_action = useCallback(
    (id: string, action_type: ActionType): void => {
      const key = `${action_type}-${id}`;

      pending_actions.current.delete(key);
    },
    [],
  );

  const rollback_action = useCallback(
    (id: string, action_type: ActionType): void => {
      const key = `${action_type}-${id}`;
      const pending = pending_actions.current.get(key);

      if (pending) {
        on_optimistic_update?.(id, pending.original_state);
        pending_actions.current.delete(key);
      }
    },
    [on_optimistic_update],
  );

  const execute_single_action = useCallback(
    async <T>(
      email: InboxEmail,
      action_type: ActionType,
      optimistic_update: Partial<InboxEmail>,
      api_call: () => Promise<{ data?: T; error?: string }>,
      should_remove_from_list = false,
    ): Promise<boolean> => {
      const original_state: Partial<InboxEmail> = {};

      for (const key of Object.keys(
        optimistic_update,
      ) as (keyof InboxEmail)[]) {
        original_state[key] = email[key] as never;
      }

      create_pending_action(email.id, action_type, original_state);
      set_action_loading(action_type, true);
      on_optimistic_update?.(email.id, optimistic_update);

      try {
        const result = await api_call();

        if (result.error) {
          rollback_action(email.id, action_type);
          set_action_error(action_type, result.error);

          return false;
        }

        remove_pending_action(email.id, action_type);
        clear_action_state(action_type);

        if (should_remove_from_list) {
          on_remove_from_list?.(email.id);
        }

        if (is_view_changing_action(action_type)) {
          emit_mail_changed();
        } else {
          emit_mail_item_updated({
            id: email.id,
            ...optimistic_update,
          } as MailItemUpdatedEventDetail);
        }
        emit_mail_action(action_type, [email.id]);
        on_success?.(action_type, email.id);

        return true;
      } catch (err) {
        rollback_action(email.id, action_type);
        const error_message =
          err instanceof Error ? err.message : "An unexpected error occurred";

        set_action_error(action_type, error_message);

        return false;
      }
    },
    [
      create_pending_action,
      set_action_loading,
      on_optimistic_update,
      rollback_action,
      set_action_error,
      remove_pending_action,
      clear_action_state,
      on_remove_from_list,
      on_success,
    ],
  );

  const update_with_metadata = useCallback(
    async (
      email: InboxEmail,
      updates: Partial<UpdateMailItemRequest>,
    ): Promise<{ data?: unknown; error?: string }> => {
      const result = await update_item_metadata(
        email.id,
        {
          encrypted_metadata: email.encrypted_metadata,
          metadata_nonce: email.metadata_nonce,
          is_read: email.is_read,
          is_starred: email.is_starred,
          is_pinned: email.is_pinned,
          is_trashed: email.is_trashed,
          is_archived: email.is_archived,
          is_spam: email.is_spam,
        },
        updates,
      );

      return result.success ? { data: true } : { error: "Failed to update" };
    },
    [],
  );

  const toggle_star = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      const new_starred = !email.is_starred;

      return execute_single_action(
        email,
        "star",
        { is_starred: new_starred },
        () => update_with_metadata(email, { is_starred: new_starred }),
      );
    },
    [execute_single_action, update_with_metadata],
  );

  const toggle_pin = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      const new_pinned = !email.is_pinned;

      return execute_single_action(
        email,
        "pin",
        { is_pinned: new_pinned },
        () => update_with_metadata(email, { is_pinned: new_pinned }),
      );
    },
    [execute_single_action, update_with_metadata],
  );

  const toggle_read = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      const new_read = !email.is_read;

      return execute_single_action(
        email,
        new_read ? "read" : "unread",
        { is_read: new_read },
        () => update_with_metadata(email, { is_read: new_read }),
      );
    },
    [execute_single_action, update_with_metadata],
  );

  const mark_as_read = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      if (email.is_read) return true;

      return execute_single_action(email, "read", { is_read: true }, () =>
        update_with_metadata(email, { is_read: true }),
      );
    },
    [execute_single_action, update_with_metadata],
  );

  const mark_as_unread = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      if (!email.is_read) return true;

      return execute_single_action(email, "unread", { is_read: false }, () =>
        update_with_metadata(email, { is_read: false }),
      );
    },
    [execute_single_action, update_with_metadata],
  );

  const archive_email = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      const success = await execute_single_action(
        email,
        "archive",
        { is_archived: true },
        () => update_with_metadata(email, { is_archived: true }),
        true,
      );

      if (success) {
        show_action_toast({
          message: "Conversation archived",
          action_type: "archive",
          email_ids: [email.id],
          on_undo: async () => {
            await update_with_metadata(email, { is_archived: false });
            emit_mail_changed();
          },
        });
      }

      return success;
    },
    [execute_single_action, update_with_metadata],
  );

  const unarchive_email = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      return execute_single_action(
        email,
        "archive",
        { is_archived: false },
        () => update_with_metadata(email, { is_archived: false }),
        true,
      );
    },
    [execute_single_action, update_with_metadata],
  );

  const delete_email = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      const success = await execute_single_action(
        email,
        "delete",
        { is_trashed: true },
        () => update_with_metadata(email, { is_trashed: true }),
        true,
      );

      if (success) {
        show_action_toast({
          message: "Conversation moved to trash",
          action_type: "trash",
          email_ids: [email.id],
          on_undo: async () => {
            await update_with_metadata(email, { is_trashed: false });
            emit_mail_changed();
          },
        });
      }

      return success;
    },
    [execute_single_action, update_with_metadata],
  );

  const mark_as_spam = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      const success = await execute_single_action(
        email,
        "spam",
        { is_spam: true },
        () => update_with_metadata(email, { is_spam: true }),
        true,
      );

      if (success) {
        show_action_toast({
          message: "Conversation marked as spam",
          action_type: "spam",
          email_ids: [email.id],
          on_undo: async () => {
            await update_with_metadata(email, { is_spam: false });
            emit_mail_changed();
          },
        });
      }

      return success;
    },
    [execute_single_action, update_with_metadata],
  );

  const unmark_spam = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      return execute_single_action(
        email,
        "spam",
        { is_spam: false },
        () => update_with_metadata(email, { is_spam: false }),
        true,
      );
    },
    [execute_single_action, update_with_metadata],
  );

  const add_folder = useCallback(
    async (email: InboxEmail, folder_token: string): Promise<boolean> => {
      set_action_loading("label", true);

      try {
        const result = await add_mail_item_folder(email.id, { folder_token });

        if (result.error) {
          set_action_error("label", result.error);

          return false;
        }

        clear_action_state("label");
        emit_mail_changed();
        emit_mail_action("label", [email.id]);
        on_success?.("label", email.id);

        return true;
      } catch (err) {
        const error_message =
          err instanceof Error ? err.message : "Failed to add label";

        set_action_error("label", error_message);

        return false;
      }
    },
    [set_action_loading, set_action_error, clear_action_state, on_success],
  );

  const remove_folder = useCallback(
    async (email: InboxEmail, folder_token: string): Promise<boolean> => {
      set_action_loading("label", true);

      try {
        const result = await remove_mail_item_folder(email.id, folder_token);

        if (result.error) {
          set_action_error("label", result.error);

          return false;
        }

        clear_action_state("label");
        emit_mail_changed();
        emit_mail_action("label", [email.id]);
        on_success?.("label", email.id);

        return true;
      } catch (err) {
        const error_message =
          err instanceof Error ? err.message : "Failed to remove label";

        set_action_error("label", error_message);

        return false;
      }
    },
    [set_action_loading, set_action_error, clear_action_state, on_success],
  );

  const move_to_folder = useCallback(
    async (email: InboxEmail, folder_token: string): Promise<boolean> => {
      set_action_loading("move", true);

      try {
        const result = await move_mail_item(email.id, { folder_token });

        if (result.error) {
          set_action_error("move", result.error);

          return false;
        }

        clear_action_state("move");
        on_remove_from_list?.(email.id);
        emit_mail_changed();
        emit_mail_action("move", [email.id]);
        on_success?.("move", email.id);

        return true;
      } catch (err) {
        const error_message =
          err instanceof Error ? err.message : "Failed to move email";

        set_action_error("move", error_message);

        return false;
      }
    },
    [
      set_action_loading,
      set_action_error,
      clear_action_state,
      on_remove_from_list,
      on_success,
    ],
  );

  const restore_from_trash = useCallback(
    async (
      email: InboxEmail,
      restore_to: "inbox" | "archive" = "inbox",
    ): Promise<boolean> => {
      return execute_single_action(
        email,
        "restore",
        { is_trashed: false, is_archived: restore_to === "archive" },
        () => restore_mail_item(email.id, { target: restore_to }),
        true,
      );
    },
    [execute_single_action],
  );

  const permanently_delete = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      set_action_loading("permanent_delete", true);

      try {
        const result = await permanent_delete_mail_item(email.id);

        if (result.error) {
          set_action_error("permanent_delete", result.error);

          return false;
        }

        clear_action_state("permanent_delete");
        on_remove_from_list?.(email.id);
        emit_mail_changed();
        emit_mail_action("permanent_delete", [email.id]);
        on_success?.("permanent_delete", email.id);

        show_action_toast({
          message: "Email permanently deleted",
          action_type: "trash",
          email_ids: [email.id],
        });

        return true;
      } catch (err) {
        const error_message =
          err instanceof Error ? err.message : "Failed to permanently delete";

        set_action_error("permanent_delete", error_message);

        return false;
      }
    },
    [
      set_action_loading,
      set_action_error,
      clear_action_state,
      on_remove_from_list,
      on_success,
    ],
  );

  const bulk_star = useCallback(
    async (emails: InboxEmail[], starred: boolean): Promise<boolean> => {
      const ids = emails.map((e) => e.id);
      const show_progress =
        ids.length >= PROGRESS_THRESHOLDS.SHOW_TOAST_PROGRESS;

      for (const email of emails) {
        create_pending_action(email.id, "star", {
          is_starred: email.is_starred,
        });
      }
      set_action_loading("star", true);
      on_bulk_optimistic_update?.(ids, { is_starred: starred });

      bulk_abort_ref.current = new AbortController();

      if (show_progress) {
        show_action_toast({
          message: `Processing 0 of ${ids.length}...`,
          action_type: "progress",
          email_ids: ids,
          progress: { completed: 0, total: ids.length },
          on_cancel: () => bulk_abort_ref.current.abort(),
        });
      }

      try {
        const result = await batched_bulk_update(
          { ids, is_starred: starred },
          {
            signal: bulk_abort_ref.current.signal,
            on_progress: (completed, total) => {
              if (show_progress) update_progress_toast(completed, total);
            },
          },
        );

        if (show_progress) hide_action_toast();

        if (result.failed_ids.length > 0) {
          for (const id of result.failed_ids) {
            rollback_action(id, "star");
          }
        }

        for (const id of ids.filter((i) => !result.failed_ids.includes(i))) {
          remove_pending_action(id, "star");
        }
        clear_action_state("star");

        for (const email of emails.filter(
          (e) => !result.failed_ids.includes(e.id),
        )) {
          emit_mail_item_updated({
            id: email.id,
            is_starred: starred,
          } as MailItemUpdatedEventDetail);
        }
        emit_mail_action(
          "star",
          ids.filter((i) => !result.failed_ids.includes(i)),
        );
        on_success?.("star");

        return result.success;
      } catch {
        for (const id of ids) {
          rollback_action(id, "star");
        }
        set_action_error("star", "Failed to update emails");

        return false;
      }
    },
    [
      create_pending_action,
      set_action_loading,
      on_bulk_optimistic_update,
      rollback_action,
      remove_pending_action,
      clear_action_state,
      on_success,
      set_action_error,
    ],
  );

  const bulk_archive_action = useCallback(
    async (emails: InboxEmail[]): Promise<boolean> => {
      const ids = emails.map((e) => e.id);
      const show_progress =
        ids.length >= PROGRESS_THRESHOLDS.SHOW_TOAST_PROGRESS;

      for (const email of emails) {
        create_pending_action(email.id, "archive", {
          is_archived: email.is_archived,
        });
      }
      set_action_loading("archive", true);
      on_bulk_optimistic_update?.(ids, { is_archived: true });
      on_bulk_remove_from_list?.(ids);

      bulk_abort_ref.current = new AbortController();

      if (show_progress) {
        show_action_toast({
          message: `Processing 0 of ${ids.length}...`,
          action_type: "progress",
          email_ids: ids,
          progress: { completed: 0, total: ids.length },
          on_cancel: () => bulk_abort_ref.current.abort(),
        });
      }

      try {
        const result = await batched_bulk_update(
          { ids, is_archived: true },
          {
            signal: bulk_abort_ref.current.signal,
            on_progress: (completed, total) => {
              if (show_progress) update_progress_toast(completed, total);
            },
          },
        );

        if (show_progress) hide_action_toast();

        if (result.failed_ids.length > 0) {
          for (const id of result.failed_ids) {
            rollback_action(id, "archive");
          }
        }

        for (const id of ids.filter((i) => !result.failed_ids.includes(i))) {
          remove_pending_action(id, "archive");
        }
        clear_action_state("archive");
        emit_mail_changed();
        emit_mail_action(
          "archive",
          ids.filter((i) => !result.failed_ids.includes(i)),
        );
        on_success?.("archive");

        const success_count = ids.length - result.failed_ids.length;

        if (success_count > 0) {
          show_action_toast({
            message: `${success_count} conversation${success_count > 1 ? "s" : ""} archived`,
            action_type: "archive",
            email_ids: ids.filter((i) => !result.failed_ids.includes(i)),
            on_undo: async () => {
              await batched_bulk_update({
                ids: ids.filter((i) => !result.failed_ids.includes(i)),
                is_archived: false,
              });
              emit_mail_changed();
            },
          });
        }

        return result.success;
      } catch {
        for (const id of ids) {
          rollback_action(id, "archive");
        }
        set_action_error("archive", "Failed to archive emails");

        return false;
      }
    },
    [
      create_pending_action,
      set_action_loading,
      on_bulk_optimistic_update,
      on_bulk_remove_from_list,
      rollback_action,
      remove_pending_action,
      clear_action_state,
      on_success,
      set_action_error,
    ],
  );

  const bulk_delete_action = useCallback(
    async (emails: InboxEmail[]): Promise<boolean> => {
      const ids = emails.map((e) => e.id);
      const show_progress =
        ids.length >= PROGRESS_THRESHOLDS.SHOW_TOAST_PROGRESS;

      for (const email of emails) {
        create_pending_action(email.id, "delete", {
          is_trashed: email.is_trashed,
        });
      }
      set_action_loading("delete", true);
      on_bulk_optimistic_update?.(ids, { is_trashed: true });
      on_bulk_remove_from_list?.(ids);

      bulk_abort_ref.current = new AbortController();

      if (show_progress) {
        show_action_toast({
          message: `Processing 0 of ${ids.length}...`,
          action_type: "progress",
          email_ids: ids,
          progress: { completed: 0, total: ids.length },
          on_cancel: () => bulk_abort_ref.current.abort(),
        });
      }

      try {
        const result = await batched_bulk_update(
          { ids, is_trashed: true },
          {
            signal: bulk_abort_ref.current.signal,
            on_progress: (completed, total) => {
              if (show_progress) update_progress_toast(completed, total);
            },
          },
        );

        if (show_progress) hide_action_toast();

        if (result.failed_ids.length > 0) {
          for (const id of result.failed_ids) {
            rollback_action(id, "delete");
          }
        }

        for (const id of ids.filter((i) => !result.failed_ids.includes(i))) {
          remove_pending_action(id, "delete");
        }
        clear_action_state("delete");
        emit_mail_changed();
        emit_mail_action(
          "delete",
          ids.filter((i) => !result.failed_ids.includes(i)),
        );
        on_success?.("delete");

        const success_count = ids.length - result.failed_ids.length;

        if (success_count > 0) {
          show_action_toast({
            message: `${success_count} conversation${success_count > 1 ? "s" : ""} moved to trash`,
            action_type: "trash",
            email_ids: ids.filter((i) => !result.failed_ids.includes(i)),
            on_undo: async () => {
              await batched_bulk_update({
                ids: ids.filter((i) => !result.failed_ids.includes(i)),
                is_trashed: false,
              });
              emit_mail_changed();
            },
          });
        }

        return result.success;
      } catch {
        for (const id of ids) {
          rollback_action(id, "delete");
        }
        set_action_error("delete", "Failed to delete emails");

        return false;
      }
    },
    [
      create_pending_action,
      set_action_loading,
      on_bulk_optimistic_update,
      on_bulk_remove_from_list,
      rollback_action,
      remove_pending_action,
      clear_action_state,
      on_success,
      set_action_error,
    ],
  );

  const bulk_mark_read_action = useCallback(
    async (emails: InboxEmail[], is_read: boolean): Promise<boolean> => {
      const ids = emails.map((e) => e.id);
      const action_type = is_read ? "read" : "unread";
      const show_progress =
        ids.length >= PROGRESS_THRESHOLDS.SHOW_TOAST_PROGRESS;

      for (const email of emails) {
        create_pending_action(email.id, action_type, {
          is_read: email.is_read,
        });
      }
      set_action_loading(action_type, true);
      on_bulk_optimistic_update?.(ids, { is_read });

      bulk_abort_ref.current = new AbortController();

      if (show_progress) {
        show_action_toast({
          message: `Processing 0 of ${ids.length}...`,
          action_type: "progress",
          email_ids: ids,
          progress: { completed: 0, total: ids.length },
          on_cancel: () => bulk_abort_ref.current.abort(),
        });
      }

      try {
        const result = await batched_bulk_update(
          { ids, is_read },
          {
            signal: bulk_abort_ref.current.signal,
            on_progress: (completed, total) => {
              if (show_progress) update_progress_toast(completed, total);
            },
          },
        );

        if (show_progress) hide_action_toast();

        if (result.failed_ids.length > 0) {
          for (const id of result.failed_ids) {
            rollback_action(id, action_type);
          }
        }

        for (const id of ids.filter((i) => !result.failed_ids.includes(i))) {
          remove_pending_action(id, action_type);
        }
        clear_action_state(action_type);

        for (const email of emails.filter(
          (e) => !result.failed_ids.includes(e.id),
        )) {
          emit_mail_item_updated({
            id: email.id,
            is_read,
          } as MailItemUpdatedEventDetail);
        }
        emit_mail_action(
          action_type,
          ids.filter((i) => !result.failed_ids.includes(i)),
        );
        on_success?.(action_type);

        return result.success;
      } catch {
        for (const id of ids) {
          rollback_action(id, action_type);
        }
        set_action_error(
          action_type,
          `Failed to mark emails as ${is_read ? "read" : "unread"}`,
        );

        return false;
      }
    },
    [
      create_pending_action,
      set_action_loading,
      on_bulk_optimistic_update,
      rollback_action,
      remove_pending_action,
      clear_action_state,
      on_success,
      set_action_error,
    ],
  );

  const bulk_mark_spam_action = useCallback(
    async (emails: InboxEmail[]): Promise<boolean> => {
      const ids = emails.map((e) => e.id);
      const show_progress =
        ids.length >= PROGRESS_THRESHOLDS.SHOW_TOAST_PROGRESS;

      for (const email of emails) {
        create_pending_action(email.id, "spam", { is_spam: email.is_spam });
      }
      set_action_loading("spam", true);
      on_bulk_optimistic_update?.(ids, { is_spam: true });
      on_bulk_remove_from_list?.(ids);

      bulk_abort_ref.current = new AbortController();

      if (show_progress) {
        show_action_toast({
          message: `Processing 0 of ${ids.length}...`,
          action_type: "progress",
          email_ids: ids,
          progress: { completed: 0, total: ids.length },
          on_cancel: () => bulk_abort_ref.current.abort(),
        });
      }

      try {
        const result = await batched_bulk_update(
          { ids, is_spam: true },
          {
            signal: bulk_abort_ref.current.signal,
            on_progress: (completed, total) => {
              if (show_progress) update_progress_toast(completed, total);
            },
          },
        );

        if (show_progress) hide_action_toast();

        if (result.failed_ids.length > 0) {
          for (const id of result.failed_ids) {
            rollback_action(id, "spam");
          }
        }

        for (const id of ids.filter((i) => !result.failed_ids.includes(i))) {
          remove_pending_action(id, "spam");
        }
        clear_action_state("spam");
        emit_mail_changed();
        emit_mail_action(
          "spam",
          ids.filter((i) => !result.failed_ids.includes(i)),
        );
        on_success?.("spam");

        const success_count = ids.length - result.failed_ids.length;

        if (success_count > 0) {
          show_action_toast({
            message: `${success_count} conversation${success_count > 1 ? "s" : ""} marked as spam`,
            action_type: "spam",
            email_ids: ids.filter((i) => !result.failed_ids.includes(i)),
            on_undo: async () => {
              await batched_bulk_update({
                ids: ids.filter((i) => !result.failed_ids.includes(i)),
                is_spam: false,
              });
              emit_mail_changed();
            },
          });
        }

        return result.success;
      } catch {
        for (const id of ids) {
          rollback_action(id, "spam");
        }
        set_action_error("spam", "Failed to mark emails as spam");

        return false;
      }
    },
    [
      create_pending_action,
      set_action_loading,
      on_bulk_optimistic_update,
      on_bulk_remove_from_list,
      rollback_action,
      remove_pending_action,
      clear_action_state,
      on_success,
      set_action_error,
    ],
  );

  const bulk_add_folder_action = useCallback(
    async (emails: InboxEmail[], folder_token: string): Promise<boolean> => {
      const ids = emails.map((e) => e.id);
      const show_progress =
        ids.length >= PROGRESS_THRESHOLDS.SHOW_TOAST_PROGRESS;

      set_action_loading("label", true);

      bulk_abort_ref.current = new AbortController();

      if (show_progress) {
        show_action_toast({
          message: `Processing 0 of ${ids.length}...`,
          action_type: "progress",
          email_ids: ids,
          progress: { completed: 0, total: ids.length },
          on_cancel: () => bulk_abort_ref.current.abort(),
        });
      }

      try {
        const result = await batched_bulk_add_folder(ids, folder_token, {
          signal: bulk_abort_ref.current.signal,
          on_progress: (completed, total) => {
            if (show_progress) update_progress_toast(completed, total);
          },
        });

        if (show_progress) hide_action_toast();

        clear_action_state("label");
        emit_mail_changed();
        emit_mail_action(
          "label",
          ids.filter((i) => !result.failed_ids.includes(i)),
        );
        on_success?.("label");

        return result.success;
      } catch (err) {
        if (show_progress) hide_action_toast();
        const error_message =
          err instanceof Error ? err.message : "Failed to add labels";

        set_action_error("label", error_message);

        return false;
      }
    },
    [set_action_loading, clear_action_state, on_success, set_action_error],
  );

  const bulk_remove_folder_action = useCallback(
    async (emails: InboxEmail[], folder_token: string): Promise<boolean> => {
      const ids = emails.map((e) => e.id);
      const show_progress =
        ids.length >= PROGRESS_THRESHOLDS.SHOW_TOAST_PROGRESS;

      set_action_loading("label", true);

      bulk_abort_ref.current = new AbortController();

      if (show_progress) {
        show_action_toast({
          message: `Processing 0 of ${ids.length}...`,
          action_type: "progress",
          email_ids: ids,
          progress: { completed: 0, total: ids.length },
          on_cancel: () => bulk_abort_ref.current.abort(),
        });
      }

      try {
        const result = await batched_bulk_remove_folder(ids, folder_token, {
          signal: bulk_abort_ref.current.signal,
          on_progress: (completed, total) => {
            if (show_progress) update_progress_toast(completed, total);
          },
        });

        if (show_progress) hide_action_toast();

        clear_action_state("label");
        emit_mail_changed();
        emit_mail_action(
          "label",
          ids.filter((i) => !result.failed_ids.includes(i)),
        );
        on_success?.("label");

        return result.success;
      } catch (err) {
        if (show_progress) hide_action_toast();
        const error_message =
          err instanceof Error ? err.message : "Failed to remove labels";

        set_action_error("label", error_message);

        return false;
      }
    },
    [set_action_loading, clear_action_state, on_success, set_action_error],
  );

  const copy_email_id = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(email.id);

        return true;
      } catch {
        on_error?.("Failed to copy to clipboard", "read");

        return false;
      }
    },
    [on_error],
  );

  const copy_sender_email = useCallback(
    async (email: InboxEmail): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(email.sender_email);

        return true;
      } catch {
        on_error?.("Failed to copy to clipboard", "read");

        return false;
      }
    },
    [on_error],
  );

  const is_any_action_loading = Object.values(action_states).some(
    (state) => state.is_loading,
  );

  return {
    action_states,
    is_any_action_loading,
    toggle_star,
    toggle_pin,
    toggle_read,
    mark_as_read,
    mark_as_unread,
    archive_email,
    unarchive_email,
    delete_email,
    mark_as_spam,
    unmark_spam,
    add_folder,
    remove_folder,
    move_to_folder,
    restore_from_trash,
    permanently_delete,
    bulk_star,
    bulk_archive: bulk_archive_action,
    bulk_delete: bulk_delete_action,
    bulk_mark_read: bulk_mark_read_action,
    bulk_mark_spam: bulk_mark_spam_action,
    bulk_add_folder: bulk_add_folder_action,
    bulk_remove_folder: bulk_remove_folder_action,
    copy_email_id,
    copy_sender_email,
  };
}
