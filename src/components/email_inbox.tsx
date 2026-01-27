import type {
  InboxEmail,
  InboxFilterType,
  ConfirmationDialogState,
} from "@/types/email";
import type { ScheduledEmailWithContent } from "@/services/api/scheduled";
import type { DraftType } from "@/services/api/multi_drafts";

import {
  useState,
  useMemo,
  useCallback,
  useRef,
  useLayoutEffect,
  useEffect,
} from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUturnLeftIcon,
  EnvelopeOpenIcon,
  FolderPlusIcon,
  ArchiveBoxArrowDownIcon,
  ShieldExclamationIcon,
  TrashIcon,
  EllipsisHorizontalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EnvelopeIcon,
  MapPinIcon,
  CheckIcon,
  MinusIcon,
  LockClosedIcon,
  InboxIcon,
  PaperClipIcon,
  PencilSquareIcon,
  PaperAirplaneIcon,
  FolderIcon,
  ClockIcon,
  CalendarIcon,
  StarIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { InboxHeader } from "@/components/inbox_header";
import { InboxEmailListItem } from "@/components/inbox_email_list_item";
import { EmailContextMenu } from "@/components/email_context_menu";
import { show_action_toast } from "@/components/action_toast";
import { show_toast } from "@/components/simple_toast";
import { use_auth } from "@/contexts/auth_context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_email_list } from "@/hooks/use_email_list";
import { use_drafts_list, type DraftListItem } from "@/hooks/use_drafts_list";
import { use_scheduled_emails } from "@/hooks/use_scheduled_emails";
import { use_snoozed_emails } from "@/hooks/use_snoozed_emails";
import { use_email_selection } from "@/hooks/use_email_selection";
import { use_folders, type DecryptedFolder } from "@/hooks/use_folders";
import { is_folder_unlocked } from "@/hooks/use_protected_folder";
import { use_snooze } from "@/hooks/use_snooze";
import { MAIL_EVENTS, emit_mail_item_updated } from "@/hooks/mail_events";
import { adjust_unread_count } from "@/hooks/use_mail_counts";
import {
  bulk_add_folder,
  bulk_remove_folder,
  permanent_delete_mail_item,
  batched_bulk_permanent_delete,
} from "@/services/api/mail";
import { update_item_metadata } from "@/services/crypto/mail_metadata";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ui/error_boundary";
import { SplitEmailViewer } from "@/components/split_email_viewer";
import { SplitScheduledViewer } from "@/components/split_scheduled_viewer";
import { FullEmailViewer } from "@/components/full_email_viewer";
import { CustomSnoozeModal } from "@/components/custom_snooze_modal";

interface ReplyData {
  recipient_name: string;
  recipient_email: string;
  recipient_avatar: string;
  original_subject: string;
  original_body: string;
  original_timestamp: string;
  original_email_id?: string;
  thread_token?: string;
}

interface ForwardData {
  sender_name: string;
  sender_email: string;
  sender_avatar: string;
  email_subject: string;
  email_body: string;
  email_timestamp: string;
}

interface DraftClickData {
  id: string;
  version: number;
  draft_type: DraftType;
  reply_to_id?: string;
  forward_from_id?: string;
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  message: string;
  updated_at: string;
}

interface ScheduledClickData {
  id: string;
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  body: string;
  scheduled_at: string;
}

interface EmailInboxProps {
  on_settings_click: () => void;
  current_view: string;
  on_compose?: () => void;
  on_reply?: (data: ReplyData) => void;
  on_forward?: (data: ForwardData) => void;
  on_draft_click?: (data: DraftClickData) => void;
  on_scheduled_click?: (data: ScheduledClickData) => void;
  on_email_click?: (id: string) => void;
  split_email_id?: string | null;
  on_split_close?: () => void;
  split_scheduled_data?: ScheduledClickData | null;
  active_email_id?: string | null;
  on_split_scheduled_close?: () => void;
  on_scheduled_edit?: (email: ScheduledEmailWithContent) => void;
  on_email_list_change?: (
    ids: string[],
    snooze_info?: Record<string, string | undefined>,
  ) => void;
  on_search_click?: () => void;
  focused_email_id?: string | null;
}

export type { ReplyData, ForwardData, DraftClickData, ScheduledClickData };

function get_view_title(
  current_view: string,
  folders: DecryptedFolder[],
): string {
  const static_titles: Record<string, string> = {
    all: "All Mail",
    starred: "Starred",
    sent: "Sent",
    drafts: "Drafts",
    scheduled: "Scheduled",
    snoozed: "Snoozed",
    archive: "Archive",
    spam: "Spam",
    trash: "Trash",
  };

  if (current_view.startsWith("folder-")) {
    const folder_token = current_view.replace("folder-", "");
    const folder = folders.find((f) => f.folder_token === folder_token);

    return folder?.name || "Folder";
  }

  return static_titles[current_view] || "Inbox";
}

function filter_emails_by_view(
  emails: InboxEmail[],
  current_view: string,
): InboxEmail[] {
  if (current_view.startsWith("folder-")) {
    const folder_token = current_view.replace("folder-", "");

    return emails.filter(
      (e) =>
        e.folders?.some((f) => f.folder_token === folder_token) &&
        !e.is_trashed &&
        !e.is_archived,
    );
  }

  switch (current_view) {
    case "all":
      return emails.filter((e) => !e.is_trashed && !e.is_spam);
    case "starred":
      return emails.filter((e) => e.is_starred);
    case "sent":
      return emails.filter((e) => e.item_type === "sent" && !e.is_archived);
    case "drafts":
      return emails.filter((e) => e.item_type === "draft");
    case "scheduled":
      return emails.filter((e) => e.item_type === "scheduled");
    case "archive":
      return emails.filter((e) => e.is_archived);
    case "spam":
      return emails.filter((e) => e.is_spam);
    case "trash":
      return emails.filter((e) => e.is_trashed);
    default:
      return emails.filter(
        (e) =>
          e.item_type === "received" &&
          !e.is_trashed &&
          !e.is_archived &&
          !e.is_spam,
      );
  }
}

function apply_active_filter(
  emails: InboxEmail[],
  filter: InboxFilterType,
): InboxEmail[] {
  switch (filter) {
    case "read":
      return emails.filter((e) => e.is_read);
    case "unread":
      return emails.filter((e) => !e.is_read);
    case "attachments":
      return emails.filter((e) => e.has_attachment);
    default:
      return emails;
  }
}

export function EmailInbox({
  on_settings_click,
  current_view,
  on_compose,
  on_reply,
  on_forward,
  on_draft_click,
  on_scheduled_click,
  on_email_click,
  split_email_id,
  on_split_close,
  split_scheduled_data,
  on_split_scheduled_close,
  on_scheduled_edit,
  on_email_list_change,
  on_search_click,
  focused_email_id,
  active_email_id,
}: EmailInboxProps): React.ReactElement {
  const navigate = useNavigate();
  const { user } = use_auth();
  const { preferences, update_preference } = use_preferences();
  const {
    state: folders_state,
    add_folder_to_email,
    remove_folder_from_email,
  } = use_folders();

  const is_drafts_view = current_view === "drafts";
  const is_scheduled_view = current_view === "scheduled";
  const is_snoozed_view = current_view === "snoozed";
  const [folder_unlock_key, set_folder_unlock_key] = useState(0);

  useEffect(() => {
    const handle_folders_changed = () => {
      set_folder_unlock_key((prev) => prev + 1);
    };

    window.addEventListener(
      MAIL_EVENTS.FOLDERS_CHANGED,
      handle_folders_changed,
    );

    return () => {
      window.removeEventListener(
        MAIL_EVENTS.FOLDERS_CHANGED,
        handle_folders_changed,
      );
    };
  }, []);

  const is_folder_view = current_view.startsWith("folder-");
  const folder_view_token = is_folder_view
    ? current_view.replace("folder-", "")
    : null;
  const current_folder = is_folder_view
    ? folders_state.folders.find((f) => f.folder_token === folder_view_token)
    : null;
  const folders_loading_for_view =
    is_folder_view && folders_state.is_loading && !current_folder;
  const folder_not_found =
    is_folder_view && !folders_state.is_loading && !current_folder;

  const locked_folder = useMemo(() => {
    if (!current_folder) return null;
    if (
      current_folder.is_password_protected &&
      current_folder.password_set &&
      !is_folder_unlocked(current_folder.id)
    ) {
      return current_folder;
    }

    return null;
  }, [current_folder, folder_unlock_key]);

  const {
    state: mail_state,
    update_email,
    remove_email,
    bulk_delete,
    bulk_archive,
    bulk_unarchive,
  } = use_email_list(current_view);

  const { state: drafts_state, update_draft } = use_drafts_list(is_drafts_view);

  const { state: scheduled_state, update_scheduled } =
    use_scheduled_emails(is_scheduled_view);

  const {
    state: snoozed_state,
    fetch_snoozed,
    unsnooze: unsnooze_snoozed,
  } = use_snoozed_emails();
  const {
    snooze: snooze_email_action,
    bulk_snooze: bulk_snooze_action,
    unsnooze_mail,
  } = use_snooze();

  useEffect(() => {
    if (is_snoozed_view) {
      fetch_snoozed();
    }
  }, [is_snoozed_view, fetch_snoozed]);

  const handle_snooze = useCallback(
    async (email_id: string, snooze_until: Date) => {
      try {
        await snooze_email_action(email_id, snooze_until);
        update_email(email_id, { snoozed_until: snooze_until.toISOString() });
        show_action_toast({
          message: "Email snoozed",
          action_type: "snooze",
          email_ids: [email_id],
        });
      } catch {
        return;
      }
    },
    [snooze_email_action, update_email],
  );

  const handle_unsnooze = useCallback(
    async (email_id: string) => {
      try {
        if (is_snoozed_view) {
          await unsnooze_snoozed(email_id);
        } else {
          await unsnooze_mail(email_id);
          update_email(email_id, { snoozed_until: undefined });
        }
        show_action_toast({
          message: "Email unsnoozed",
          action_type: "snooze",
          email_ids: [email_id],
        });
      } catch {
        return;
      }
    },
    [is_snoozed_view, unsnooze_snoozed, unsnooze_mail, update_email],
  );

  const raw_email_state = useMemo(() => {
    if (is_drafts_view) {
      return {
        emails: drafts_state.drafts as InboxEmail[],
        is_loading: drafts_state.is_loading,
        total_messages: drafts_state.total_count,
      };
    }
    if (is_scheduled_view) {
      return {
        emails: scheduled_state.emails as InboxEmail[],
        is_loading: scheduled_state.is_loading,
        total_messages: scheduled_state.total_count,
      };
    }
    if (is_snoozed_view) {
      return {
        emails: snoozed_state.emails,
        is_loading: snoozed_state.is_loading,
        total_messages: snoozed_state.total,
      };
    }

    return mail_state;
  }, [
    is_drafts_view,
    is_scheduled_view,
    is_snoozed_view,
    drafts_state,
    scheduled_state,
    snoozed_state,
    mail_state,
  ]);

  const email_state = raw_email_state;

  const { toggle_select, get_selected_ids, get_selection_state } =
    use_email_selection();

  const handle_open_compose = useCallback(
    (mode: "reply" | "forward", email: InboxEmail) => {
      if (mode === "reply" && on_reply) {
        on_reply({
          recipient_name: email.sender_name,
          recipient_email: email.sender_email,
          recipient_avatar: email.avatar_url,
          original_subject: email.subject,
          original_body: email.preview,
          original_timestamp: email.timestamp,
          thread_token: email.thread_token,
          original_email_id: email.id,
        });
      }
    },
    [on_reply],
  );

  const folders_lookup = useMemo(() => {
    const lookup = new Map<string, { name: string; color?: string }>();

    for (const folder of folders_state.folders) {
      lookup.set(folder.folder_token, {
        name: folder.name,
        color: folder.color,
      });
    }

    return lookup;
  }, [folders_state.folders]);

  const context_menu_actions = useMemo(() => {
    const is_trash_view = current_view === "trash";

    const handle_delete = async (email: InboxEmail) => {
      const should_adjust_unread =
        email.item_type === "received" && !email.is_read;

      if (is_trash_view) {
        remove_email(email.id);
        const result = await permanent_delete_mail_item(email.id);

        if (result.data) {
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
          show_action_toast({
            message: "Email permanently deleted",
            action_type: "trash",
            email_ids: [email.id],
          });
        }

        return;
      }

      remove_email(email.id);
      if (should_adjust_unread) {
        adjust_unread_count(-1);
      }
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
        { is_trashed: true },
      );

      if (result.success) {
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
        show_action_toast({
          message: "Conversation moved to trash",
          action_type: "trash",
          email_ids: [email.id],
          on_undo: async () => {
            if (should_adjust_unread) {
              adjust_unread_count(1);
            }
            await update_item_metadata(
              email.id,
              {
                encrypted_metadata: result.encrypted?.encrypted_metadata,
                metadata_nonce: result.encrypted?.metadata_nonce,
                is_read: email.is_read,
                is_starred: email.is_starred,
                is_pinned: email.is_pinned,
                is_trashed: true,
                is_archived: email.is_archived,
                is_spam: email.is_spam,
              },
              { is_trashed: false },
            );
            window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
          },
        });
      }
    };

    const handle_archive = async (email: InboxEmail) => {
      const should_adjust_unread =
        email.item_type === "received" && !email.is_read;

      remove_email(email.id);
      if (should_adjust_unread) {
        adjust_unread_count(-1);
      }
      const result = await batch_archive({ ids: [email.id], tier: "hot" });

      if (result.data?.success) {
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
        show_action_toast({
          message: "Conversation archived",
          action_type: "archive",
          email_ids: [email.id],
          on_undo: async () => {
            if (should_adjust_unread) {
              adjust_unread_count(1);
            }
            await batch_unarchive({ ids: [email.id] });
            window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
          },
        });
      }
    };

    const handle_spam = async (email: InboxEmail) => {
      const should_adjust_unread =
        email.item_type === "received" && !email.is_read;

      remove_email(email.id);
      if (should_adjust_unread) {
        adjust_unread_count(-1);
      }
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
        { is_spam: true },
      );

      if (result.success) {
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
        show_action_toast({
          message: "Conversation marked as spam",
          action_type: "spam",
          email_ids: [email.id],
          on_undo: async () => {
            if (should_adjust_unread) {
              adjust_unread_count(1);
            }
            await update_item_metadata(
              email.id,
              {
                encrypted_metadata: result.encrypted?.encrypted_metadata,
                metadata_nonce: result.encrypted?.metadata_nonce,
                is_read: email.is_read,
                is_starred: email.is_starred,
                is_pinned: email.is_pinned,
                is_trashed: email.is_trashed,
                is_archived: email.is_archived,
                is_spam: true,
              },
              { is_spam: false },
            );
            window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
          },
        });
      } else {
        if (should_adjust_unread) {
          adjust_unread_count(1);
        }
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
        show_toast("Failed to mark as spam", "error");
      }
    };

    const handle_toggle_read = async (email: InboxEmail) => {
      const new_state = !email.is_read;
      const is_received = email.item_type === "received";

      update_email(email.id, { is_read: new_state });
      if (is_received) {
        adjust_unread_count(new_state ? -1 : 1);
      }
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
        { is_read: new_state },
      );

      if (result.success) {
        emit_mail_item_updated({ id: email.id, is_read: new_state });
        show_action_toast({
          message: new_state ? "Marked as read" : "Marked as unread",
          action_type: "read",
          email_ids: [email.id],
          on_undo: async () => {
            if (is_received) {
              adjust_unread_count(new_state ? 1 : -1);
            }
            await update_item_metadata(
              email.id,
              {
                encrypted_metadata: result.encrypted?.encrypted_metadata,
                metadata_nonce: result.encrypted?.metadata_nonce,
                is_read: new_state,
                is_starred: email.is_starred,
                is_pinned: email.is_pinned,
                is_trashed: email.is_trashed,
                is_archived: email.is_archived,
                is_spam: email.is_spam,
              },
              { is_read: !new_state },
            );
            emit_mail_item_updated({ id: email.id, is_read: !new_state });
          },
        });
      }
    };

    const handle_toggle_pin = async (email: InboxEmail) => {
      if (is_drafts_view || is_scheduled_view) return;

      const new_state = !email.is_pinned;

      update_email(email.id, { is_pinned: new_state });
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
        { is_pinned: new_state },
      );

      if (result.success) {
        emit_mail_item_updated({ id: email.id, is_pinned: new_state });
        show_action_toast({
          message: new_state ? "Pinned" : "Unpinned",
          action_type: "pin",
          email_ids: [email.id],
          on_undo: async () => {
            await update_item_metadata(
              email.id,
              {
                encrypted_metadata: result.encrypted?.encrypted_metadata,
                metadata_nonce: result.encrypted?.metadata_nonce,
                is_read: email.is_read,
                is_starred: email.is_starred,
                is_pinned: new_state,
                is_trashed: email.is_trashed,
                is_archived: email.is_archived,
                is_spam: email.is_spam,
              },
              { is_pinned: !new_state },
            );
            emit_mail_item_updated({ id: email.id, is_pinned: !new_state });
          },
        });
      }
    };

    const handle_reply = (email: InboxEmail) => {
      handle_open_compose("reply", email);
    };

    const handle_forward = (email: InboxEmail) => {
      handle_open_compose("forward", email);
    };

    const handle_folder_toggle = async (
      email: InboxEmail,
      folder_token: string,
    ) => {
      const folder_data = folders_lookup.get(folder_token);
      const folder_name = folder_data?.name || "folder";
      const previous_folders = email.folders || [];
      const is_already_assigned = previous_folders.some(
        (f) => f.folder_token === folder_token,
      );

      if (is_already_assigned) {
        update_email(email.id, { folders: [] });
        const success = await remove_folder_from_email(email.id, folder_token);

        if (success) {
          emit_mail_item_updated({ id: email.id, folders: [] });
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
          show_action_toast({
            message: `Removed from ${folder_name}`,
            action_type: "folder",
            email_ids: [email.id],
            on_undo: async () => {
              await add_folder_to_email(email.id, folder_token);
              window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
            },
          });
        } else {
          update_email(email.id, { folders: previous_folders });
        }

        return;
      }

      const new_folder = {
        folder_token,
        name: folder_name,
        color: folder_data?.color,
      };
      const new_folders = [new_folder];

      update_email(email.id, { folders: new_folders });
      const success = await add_folder_to_email(email.id, folder_token);

      if (success) {
        emit_mail_item_updated({ id: email.id, folders: new_folders });
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
        show_action_toast({
          message: `Moved to ${folder_name}`,
          action_type: "folder",
          email_ids: [email.id],
          on_undo: async () => {
            if (previous_folders.length > 0) {
              await add_folder_to_email(
                email.id,
                previous_folders[0].folder_token,
              );
            } else {
              await remove_folder_from_email(email.id, folder_token);
            }
            window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
          },
        });
      } else {
        update_email(email.id, { folders: previous_folders });
      }
    };

    const handle_restore = async (email: InboxEmail) => {
      const should_adjust_unread =
        email.item_type === "received" && !email.is_read;

      update_email(email.id, { is_trashed: false });
      if (should_adjust_unread) {
        adjust_unread_count(1);
      }
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
        { is_trashed: false },
      );

      if (result.success) {
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
        show_action_toast({
          message: "Restored from trash",
          action_type: "restore",
          email_ids: [email.id],
          on_undo: async () => {
            if (should_adjust_unread) {
              adjust_unread_count(-1);
            }
            await update_item_metadata(
              email.id,
              {
                encrypted_metadata: result.encrypted?.encrypted_metadata,
                metadata_nonce: result.encrypted?.metadata_nonce,
                is_read: email.is_read,
                is_starred: email.is_starred,
                is_pinned: email.is_pinned,
                is_trashed: false,
                is_archived: email.is_archived,
                is_spam: email.is_spam,
              },
              { is_trashed: true },
            );
            window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
          },
        });
      }
    };

    const handle_mark_not_spam = async (email: InboxEmail) => {
      const should_adjust_unread =
        email.item_type === "received" && !email.is_read;

      update_email(email.id, { is_spam: false });
      if (should_adjust_unread) {
        adjust_unread_count(1);
      }
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
        { is_spam: false },
      );

      if (result.success) {
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
        show_action_toast({
          message: "Marked as not spam",
          action_type: "not_spam",
          email_ids: [email.id],
          on_undo: async () => {
            if (should_adjust_unread) {
              adjust_unread_count(-1);
            }
            await update_item_metadata(
              email.id,
              {
                encrypted_metadata: result.encrypted?.encrypted_metadata,
                metadata_nonce: result.encrypted?.metadata_nonce,
                is_read: email.is_read,
                is_starred: email.is_starred,
                is_pinned: email.is_pinned,
                is_trashed: email.is_trashed,
                is_archived: email.is_archived,
                is_spam: false,
              },
              { is_spam: true },
            );
            window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
          },
        });
      }
    };

    const handle_move_to_inbox = async (email: InboxEmail) => {
      const should_adjust_unread =
        email.item_type === "received" && !email.is_read;

      remove_email(email.id);
      if (should_adjust_unread) {
        adjust_unread_count(1);
      }
      const result = await batch_unarchive({ ids: [email.id] });

      if (result.data?.success) {
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
        show_action_toast({
          message: "Moved to inbox",
          action_type: "restore",
          email_ids: [email.id],
          on_undo: async () => {
            if (should_adjust_unread) {
              adjust_unread_count(-1);
            }
            await batch_archive({ ids: [email.id], tier: "hot" });
            window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
          },
        });
      }
    };

    return {
      handle_delete,
      handle_archive,
      handle_spam,
      handle_toggle_read,
      handle_toggle_pin,
      handle_reply,
      handle_forward,
      handle_folder_toggle,
      handle_restore,
      handle_mark_not_spam,
      handle_move_to_inbox,
    };
  }, [
    current_view,
    update_email,
    remove_email,
    handle_open_compose,
    folders_lookup,
    add_folder_to_email,
    remove_folder_from_email,
  ]);

  const [active_filter, set_active_filter] = useState<InboxFilterType>("all");
  const [current_page, set_current_page] = useState(0);
  const page_size = 25;
  const [confirmations, set_confirmations] = useState<ConfirmationDialogState>({
    show_delete: false,
    show_archive: false,
    skip_delete: false,
    skip_archive: false,
  });
  const [dont_ask_delete, set_dont_ask_delete] = useState(false);
  const [dont_ask_archive, set_dont_ask_archive] = useState(false);
  const [show_empty_spam_dialog, set_show_empty_spam_dialog] = useState(false);
  const [is_emptying_spam, set_is_emptying_spam] = useState(false);
  const [custom_snooze_email, set_custom_snooze_email] =
    useState<InboxEmail | null>(null);
  const [show_toolbar_custom_snooze, set_show_toolbar_custom_snooze] =
    useState(false);

  useEffect(() => {
    const find_email = (id: string) =>
      email_state.emails.find((e) => e.id === id);

    const handle_archive = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      const email = find_email(detail.id);

      if (email) context_menu_actions.handle_archive(email);
    };

    const handle_delete = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      const email = find_email(detail.id);

      if (email) context_menu_actions.handle_delete(email);
    };

    const handle_spam = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      const email = find_email(detail.id);

      if (email) context_menu_actions.handle_spam(email);
    };

    const handle_mark_read = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      const email = find_email(detail.id);

      if (email && !email.is_read)
        context_menu_actions.handle_toggle_read(email);
    };

    const handle_mark_unread = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      const email = find_email(detail.id);

      if (email && email.is_read)
        context_menu_actions.handle_toggle_read(email);
    };

    window.addEventListener("astermail:keyboard-archive", handle_archive);
    window.addEventListener("astermail:keyboard-delete", handle_delete);
    window.addEventListener("astermail:keyboard-spam", handle_spam);
    window.addEventListener("astermail:keyboard-mark-read", handle_mark_read);
    window.addEventListener(
      "astermail:keyboard-mark-unread",
      handle_mark_unread,
    );

    return () => {
      window.removeEventListener("astermail:keyboard-archive", handle_archive);
      window.removeEventListener("astermail:keyboard-delete", handle_delete);
      window.removeEventListener("astermail:keyboard-spam", handle_spam);
      window.removeEventListener(
        "astermail:keyboard-mark-read",
        handle_mark_read,
      );
      window.removeEventListener(
        "astermail:keyboard-mark-unread",
        handle_mark_unread,
      );
    };
  }, [email_state.emails, context_menu_actions]);

  const enrich_email_folders = useCallback(
    (email: InboxEmail): InboxEmail => {
      if (!email.folders || email.folders.length === 0) return email;
      const enriched_folders = email.folders.map((folder) => {
        const full_data = folders_lookup.get(folder.folder_token);

        return full_data
          ? { ...folder, name: full_data.name, color: full_data.color }
          : folder;
      });

      return { ...email, folders: enriched_folders };
    },
    [folders_lookup],
  );

  const view_filtered_emails = useMemo(
    () => filter_emails_by_view(email_state.emails, current_view),
    [email_state.emails, current_view],
  );

  const filtered_emails = useMemo(
    () =>
      apply_active_filter(view_filtered_emails, active_filter).map(
        enrich_email_folders,
      ),
    [view_filtered_emails, active_filter, enrich_email_folders],
  );

  const pinned_emails = useMemo(
    () => filtered_emails.filter((e) => e.is_pinned),
    [filtered_emails],
  );

  const all_primary_emails = useMemo(
    () => filtered_emails.filter((e) => !e.is_pinned),
    [filtered_emails],
  );

  const primary_emails = useMemo(() => {
    const start = current_page * page_size;
    const end = start + page_size;

    return all_primary_emails.slice(start, end);
  }, [all_primary_emails, current_page, page_size]);

  useEffect(() => {
    if (on_email_list_change) {
      const all_visible = [...pinned_emails, ...primary_emails];
      const snooze_info: Record<string, string | undefined> = {};

      all_visible.forEach((e) => {
        if (e.snoozed_until) {
          snooze_info[e.id] = e.snoozed_until;
        }
      });
      on_email_list_change(
        all_visible.map((e) => e.id),
        snooze_info,
      );
    }
  }, [pinned_emails, primary_emails, on_email_list_change]);

  const { all_selected, some_selected } = get_selection_state(filtered_emails);

  const get_update_fn = useCallback(() => {
    if (is_drafts_view)
      return update_draft as (id: string, updates: Partial<InboxEmail>) => void;
    if (is_scheduled_view)
      return update_scheduled as (
        id: string,
        updates: Partial<InboxEmail>,
      ) => void;

    return update_email;
  }, [
    is_drafts_view,
    is_scheduled_view,
    update_draft,
    update_scheduled,
    update_email,
  ]);

  const handle_toggle_select = useCallback(
    (id: string): void => {
      toggle_select(id, email_state.emails, get_update_fn());
    },
    [toggle_select, email_state.emails, get_update_fn],
  );

  const handle_toggle_select_all = useCallback((): void => {
    const visible_ids = new Set(filtered_emails.map((e) => e.id));
    const all_visible_selected = filtered_emails.every((e) => e.is_selected);
    const update_fn = get_update_fn();

    email_state.emails.forEach((e) => {
      if (visible_ids.has(e.id)) {
        update_fn(e.id, { is_selected: !all_visible_selected });
      }
    });
  }, [filtered_emails, email_state.emails, get_update_fn]);

  const handle_email_click = useCallback(
    (id: string): void => {
      const email = email_state.emails.find((e) => e.id === id);

      if (email?.item_type === "draft" && on_draft_click) {
        const draft = email as DraftListItem;

        on_draft_click({
          id: email.id,
          version: draft.version || 1,
          draft_type: (draft.draft_type as DraftType) || "new",
          reply_to_id: draft.reply_to_id,
          forward_from_id: draft.forward_from_id,
          to_recipients: draft.to_recipients || [],
          cc_recipients: draft.cc_recipients || [],
          bcc_recipients: draft.bcc_recipients || [],
          subject: draft.subject || "",
          message: draft.full_message || "",
          updated_at: draft.updated_at || new Date().toISOString(),
        });

        return;
      }

      if (email?.item_type === "scheduled") {
        if (on_scheduled_click) {
          const scheduled = scheduled_state.emails.find((e) => e.id === id);

          if (scheduled) {
            on_scheduled_click({
              id: scheduled.id,
              to_recipients: scheduled.to_recipients,
              cc_recipients: scheduled.cc_recipients,
              bcc_recipients: scheduled.bcc_recipients,
              subject: scheduled.subject,
              body: scheduled.full_body,
              scheduled_at: scheduled.scheduled_at,
            });
          }
        }

        return;
      }

      if (on_email_click) {
        on_email_click(id);
      } else {
        navigate(`/email/${id}`, { state: { from_view: current_view } });
      }
    },
    [
      navigate,
      current_view,
      email_state.emails,
      scheduled_state.emails,
      on_draft_click,
      on_scheduled_click,
      on_email_click,
    ],
  );

  const handle_toolbar_delete = useCallback((): void => {
    if (confirmations.skip_delete) {
      const ids = get_selected_ids(email_state.emails);

      bulk_delete(ids);
    } else {
      set_confirmations((prev) => ({ ...prev, show_delete: true }));
    }
  }, [
    confirmations.skip_delete,
    get_selected_ids,
    email_state.emails,
    bulk_delete,
  ]);

  const handle_toolbar_archive = useCallback((): void => {
    if (confirmations.skip_archive) {
      const ids = get_selected_ids(email_state.emails);

      bulk_archive(ids);
    } else {
      set_confirmations((prev) => ({ ...prev, show_archive: true }));
    }
  }, [
    confirmations.skip_archive,
    get_selected_ids,
    email_state.emails,
    bulk_archive,
  ]);

  const handle_toolbar_unarchive = useCallback((): void => {
    const ids = get_selected_ids(email_state.emails);

    bulk_unarchive(ids);
  }, [get_selected_ids, email_state.emails, bulk_unarchive]);

  const handle_toolbar_reply = useCallback((): void => {
    if (!on_reply) return;
    const selected = email_state.emails.find((e) => e.is_selected);

    if (selected) {
      on_reply({
        recipient_name: selected.sender_name,
        recipient_email: selected.sender_email,
        recipient_avatar: selected.avatar_url,
        original_subject: selected.subject,
        original_body: selected.preview,
        original_timestamp: selected.timestamp,
        thread_token: selected.thread_token,
        original_email_id: selected.id,
      });
    }
  }, [on_reply, email_state.emails]);

  const handle_toolbar_toggle_folder = useCallback(
    async (folder_token: string, should_remove: boolean): Promise<void> => {
      const selected = email_state.emails.filter((e) => e.is_selected);

      if (selected.length === 0) return;

      const folder_data = folders_lookup.get(folder_token);
      const folder_name = folder_data?.name || "folder";
      const ids = selected.map((e) => e.id);
      const previous_states = selected.map((e) => ({
        id: e.id,
        folders: e.folders || [],
      }));

      for (const email of selected) {
        if (should_remove) {
          update_email(email.id, { folders: [] });
        } else {
          const new_folder = {
            folder_token,
            name: folder_name,
            color: folder_data?.color,
          };

          update_email(email.id, { folders: [new_folder] });
        }
      }

      const result = should_remove
        ? await bulk_remove_folder(ids, folder_token)
        : await bulk_add_folder(ids, folder_token);

      if (result.error) {
        for (const prev of previous_states) {
          update_email(prev.id, { folders: prev.folders });
        }

        return;
      }

      for (const email of selected) {
        emit_mail_item_updated({
          id: email.id,
          folders: should_remove
            ? []
            : [{ folder_token, name: folder_name, color: folder_data?.color }],
        });
      }

      window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));

      show_action_toast({
        message: should_remove
          ? `${selected.length} conversation${selected.length > 1 ? "s" : ""} removed from ${folder_name}`
          : `${selected.length} conversation${selected.length > 1 ? "s" : ""} moved to ${folder_name}`,
        action_type: "folder",
        email_ids: ids,
        on_undo: async () => {
          if (should_remove) {
            await bulk_add_folder(ids, folder_token);
          } else {
            await bulk_remove_folder(ids, folder_token);
          }
          window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
        },
      });
    },
    [email_state.emails, folders_lookup, update_email],
  );

  const selected_emails = useMemo(
    () => email_state.emails.filter((e) => e.is_selected),
    [email_state.emails],
  );

  const confirm_delete = useCallback(async (): Promise<void> => {
    if (dont_ask_delete) {
      set_confirmations((prev) => ({ ...prev, skip_delete: true }));
    }
    const ids = get_selected_ids(email_state.emails);

    await bulk_delete(ids);
    set_confirmations((prev) => ({ ...prev, show_delete: false }));
    set_dont_ask_delete(false);
  }, [dont_ask_delete, get_selected_ids, email_state.emails, bulk_delete]);

  const confirm_archive = useCallback(async (): Promise<void> => {
    if (dont_ask_archive) {
      set_confirmations((prev) => ({ ...prev, skip_archive: true }));
    }
    const ids = get_selected_ids(email_state.emails);

    await bulk_archive(ids);
    set_confirmations((prev) => ({ ...prev, show_archive: false }));
    set_dont_ask_archive(false);
  }, [dont_ask_archive, get_selected_ids, email_state.emails, bulk_archive]);

  const cancel_delete = useCallback((): void => {
    set_confirmations((prev) => ({ ...prev, show_delete: false }));
    set_dont_ask_delete(false);
  }, []);

  const cancel_archive = useCallback((): void => {
    set_confirmations((prev) => ({ ...prev, show_archive: false }));
    set_dont_ask_archive(false);
  }, []);

  const handle_empty_spam = useCallback((): void => {
    set_show_empty_spam_dialog(true);
  }, []);

  const confirm_empty_spam = useCallback(async (): Promise<void> => {
    set_is_emptying_spam(true);
    try {
      const spam_emails = email_state.emails.filter((e) => e.is_spam);
      const spam_ids = spam_emails.map((e) => e.id);

      if (spam_ids.length === 0) {
        set_show_empty_spam_dialog(false);

        return;
      }

      const result = await batched_bulk_permanent_delete(spam_ids);

      if (result.success) {
        for (const id of spam_ids) {
          remove_email(id);
        }
        show_action_toast({
          message: `${spam_ids.length} spam email${spam_ids.length > 1 ? "s" : ""} permanently deleted`,
          action_type: "trash",
          email_ids: spam_ids,
        });
      }
    } finally {
      set_is_emptying_spam(false);
      set_show_empty_spam_dialog(false);
    }
  }, [email_state.emails, remove_email]);

  const cancel_empty_spam = useCallback((): void => {
    set_show_empty_spam_dialog(false);
  }, []);

  const handle_toolbar_mark_read = useCallback(async (): Promise<void> => {
    const selected = email_state.emails.filter((e) => e.is_selected);

    if (selected.length === 0) return;

    const has_unread = selected.some((e) => !e.is_read);
    const new_state = has_unread;

    const unread_count_delta = selected.reduce((acc, email) => {
      if (email.item_type !== "received") return acc;
      if (new_state && !email.is_read) return acc - 1;
      if (!new_state && email.is_read) return acc + 1;

      return acc;
    }, 0);

    for (const email of selected) {
      update_email(email.id, { is_read: new_state });
    }

    if (unread_count_delta !== 0) {
      adjust_unread_count(unread_count_delta);
    }

    await Promise.all(
      selected.map((email) =>
        update_item_metadata(
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
          { is_read: new_state },
        ),
      ),
    );

    for (const email of selected) {
      emit_mail_item_updated({ id: email.id, is_read: new_state });
    }

    show_action_toast({
      message: new_state
        ? `${selected.length} conversation${selected.length > 1 ? "s" : ""} marked as read`
        : `${selected.length} conversation${selected.length > 1 ? "s" : ""} marked as unread`,
      action_type: "read",
      email_ids: selected.map((e) => e.id),
    });
  }, [email_state.emails, update_email]);

  const handle_toolbar_spam = useCallback(async (): Promise<void> => {
    const selected = email_state.emails.filter((e) => e.is_selected);

    if (selected.length === 0) return;

    const ids = selected.map((e) => e.id);

    const results = await Promise.all(
      selected.map((email) =>
        update_item_metadata(
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
          { is_spam: true },
        ),
      ),
    );

    const has_error = results.some((r) => !r.success);

    if (has_error) {
      return;
    }

    for (const email of selected) {
      remove_email(email.id);
    }

    window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
    show_action_toast({
      message: `${selected.length} conversation${selected.length > 1 ? "s" : ""} marked as spam`,
      action_type: "spam",
      email_ids: ids,
      on_undo: async () => {
        await Promise.all(
          selected.map((email, index) =>
            update_item_metadata(
              email.id,
              {
                encrypted_metadata:
                  results[index].encrypted?.encrypted_metadata,
                metadata_nonce: results[index].encrypted?.metadata_nonce,
                is_read: email.is_read,
                is_starred: email.is_starred,
                is_pinned: email.is_pinned,
                is_trashed: email.is_trashed,
                is_archived: email.is_archived,
                is_spam: true,
              },
              { is_spam: false },
            ),
          ),
        );
        window.dispatchEvent(new CustomEvent(MAIL_EVENTS.MAIL_CHANGED));
      },
    });
  }, [email_state.emails, remove_email]);

  const handle_toolbar_snooze = useCallback(
    async (snooze_until: Date): Promise<void> => {
      const selected = email_state.emails.filter((e) => e.is_selected);

      if (selected.length === 0) return;

      const snooze_iso = snooze_until.toISOString();
      const ids = selected.map((e) => e.id);

      for (const email of selected) {
        update_email(email.id, {
          snoozed_until: snooze_iso,
          is_selected: false,
        });
      }

      try {
        await bulk_snooze_action(ids, snooze_until);

        show_action_toast({
          message: `${selected.length} conversation${selected.length > 1 ? "s" : ""} snoozed`,
          action_type: "snooze",
          email_ids: ids,
        });
      } catch {
        for (const email of selected) {
          update_email(email.id, {
            snoozed_until: email.snoozed_until,
            is_selected: true,
          });
        }
      }
    },
    [email_state.emails, bulk_snooze_action, update_email],
  );

  const handle_page_change = useCallback((page: number): void => {
    set_current_page(page);
  }, []);

  const handle_filter_change = useCallback((filter: InboxFilterType): void => {
    set_active_filter(filter);
    set_current_page(0);
  }, []);

  const is_split_view = !!split_email_id || !!split_scheduled_data;
  const is_full_view_mode = preferences.inbox_format === "full";
  const show_full_email_viewer = is_full_view_mode && !!split_email_id && !split_scheduled_data;

  const split_email_snoozed_until = useMemo(() => {
    if (!split_email_id) return undefined;
    const email = email_state.emails.find((e) => e.id === split_email_id);

    return email?.snoozed_until;
  }, [split_email_id, email_state.emails]);

  const SIDEBAR_WIDTH = 256;
  const MIN_EMAIL_VIEWER_WIDTH = 450;
  const MIN_LIST_WIDTH = 320;

  const [is_dragging, set_is_dragging] = useState(false);
  const [drag_width, set_drag_width] = useState<number | null>(null);
  const drag_start_ref = useRef<{ x: number; width: number } | null>(null);
  const has_initialized_width = useRef(false);

  useEffect(() => {
    if (has_initialized_width.current) return;

    const content_width = window.innerWidth - SIDEBAR_WIDTH;
    const max_width = Math.max(
      MIN_LIST_WIDTH,
      content_width - MIN_EMAIL_VIEWER_WIDTH,
    );
    const ideal_width = Math.floor(content_width * 0.5);
    const safe_width = Math.max(
      MIN_LIST_WIDTH,
      Math.min(max_width, ideal_width),
    );

    if (
      preferences.split_pane_width > max_width ||
      preferences.split_pane_width < MIN_LIST_WIDTH
    ) {
      update_preference("split_pane_width", safe_width);
    }

    has_initialized_width.current = true;
  }, [preferences.split_pane_width, update_preference]);

  const pane_width = drag_width ?? preferences.split_pane_width;

  useEffect(() => {
    if (!is_split_view) return;

    const handle_resize = () => {
      const viewport_width = window.innerWidth;

      if (viewport_width < 900 && on_split_close) {
        on_split_close();
      } else if (viewport_width < 900 && on_split_scheduled_close) {
        on_split_scheduled_close();
      }
    };

    window.addEventListener("resize", handle_resize);
    handle_resize();

    return () => window.removeEventListener("resize", handle_resize);
  }, [is_split_view, on_split_close, on_split_scheduled_close]);

  const handle_drag_start = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      drag_start_ref.current = {
        x: e.clientX,
        width: preferences.split_pane_width,
      };
      set_is_dragging(true);
    },
    [preferences.split_pane_width],
  );

  useEffect(() => {
    if (!is_dragging || !drag_start_ref.current) return;

    const handle_mouse_move = (e: MouseEvent) => {
      if (!drag_start_ref.current) return;
      const delta = e.clientX - drag_start_ref.current.x;
      const max_pane_width = Math.max(
        MIN_LIST_WIDTH,
        window.innerWidth - SIDEBAR_WIDTH - MIN_EMAIL_VIEWER_WIDTH,
      );
      const new_width = Math.max(
        MIN_LIST_WIDTH,
        Math.min(max_pane_width, drag_start_ref.current.width + delta),
      );

      set_drag_width(new_width);
    };

    const handle_mouse_up = () => {
      set_is_dragging(false);
      if (drag_width !== null) {
        update_preference("split_pane_width", drag_width);
      }
      set_drag_width(null);
      drag_start_ref.current = null;
    };

    document.addEventListener("mousemove", handle_mouse_move);
    document.addEventListener("mouseup", handle_mouse_up);

    return () => {
      document.removeEventListener("mousemove", handle_mouse_move);
      document.removeEventListener("mouseup", handle_mouse_up);
    };
  }, [is_dragging, drag_width, update_preference]);

  const email_list_content = (
    <>
      {folder_not_found ? (
        <FolderNotFoundState />
      ) : locked_folder ? (
        <LockedFolderState folder_name={locked_folder.name} />
      ) : folders_loading_for_view || email_state.is_loading ? (
        <LoadingState />
      ) : filtered_emails.length === 0 ? (
        <EmptyState
          current_view={current_view}
          user_email={user?.email}
          view_title={get_view_title(current_view, folders_state.folders)}
        />
      ) : (
        <EmailList
          current_view={current_view}
          density={preferences.density}
          disable_layout_animation={is_dragging}
          focused_email_id={focused_email_id}
          folders={folders_state.folders.map((f) => ({
            id: f.folder_token,
            name: f.name,
            color: f.color || "#6366f1",
          }))}
          on_archive={context_menu_actions.handle_archive}
          on_custom_snooze={(email) => set_custom_snooze_email(email)}
          on_delete={context_menu_actions.handle_delete}
          on_email_click={handle_email_click}
          on_folder_toggle={context_menu_actions.handle_folder_toggle}
          on_forward={context_menu_actions.handle_forward}
          on_mark_not_spam={context_menu_actions.handle_mark_not_spam}
          on_move_to_inbox={context_menu_actions.handle_move_to_inbox}
          on_reply={context_menu_actions.handle_reply}
          on_restore={context_menu_actions.handle_restore}
          on_snooze={(email, snooze_until) =>
            handle_snooze(email.id, snooze_until)
          }
          on_spam={context_menu_actions.handle_spam}
          on_toggle_pin={context_menu_actions.handle_toggle_pin}
          on_toggle_read={context_menu_actions.handle_toggle_read}
          on_toggle_select={handle_toggle_select}
          on_unsnooze={(email) => handle_unsnooze(email.id)}
          pinned_emails={pinned_emails}
          primary_emails={primary_emails}
          selected_email_id={active_email_id ?? split_scheduled_data?.id}
          show_email_preview={!is_split_view && preferences.show_email_preview}
          show_profile_pictures={preferences.show_profile_pictures}
        />
      )}
    </>
  );

  return (
    <ErrorBoundary>
      <div
        className="flex flex-col h-full"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        {!show_full_email_viewer && (
          <>
            <InboxHeader
              active_filter={active_filter}
              on_compose={on_compose}
              on_filter_change={handle_filter_change}
              on_search_click={on_search_click}
              on_settings_click={on_settings_click}
              view_title={get_view_title(current_view, folders_state.folders)}
            />

            <InboxToolbar
              active_filter={active_filter}
              all_selected={all_selected}
              current_page={current_page}
              current_view={current_view}
              filtered_count={filtered_emails.length}
              folders={folders_state.folders.map((f) => ({
                folder_token: f.folder_token,
                name: f.name,
                color: f.color || "#6366f1",
              }))}
              on_archive={handle_toolbar_archive}
              on_custom_snooze={() => set_show_toolbar_custom_snooze(true)}
              on_delete={handle_toolbar_delete}
              on_empty_spam={handle_empty_spam}
              on_filter_change={handle_filter_change}
              on_mark_read={handle_toolbar_mark_read}
              on_page_change={handle_page_change}
              on_reply={handle_toolbar_reply}
              on_snooze={handle_toolbar_snooze}
              on_spam={handle_toolbar_spam}
              on_toggle_folder={handle_toolbar_toggle_folder}
              on_toggle_select_all={handle_toggle_select_all}
              on_unarchive={handle_toolbar_unarchive}
              page_size={page_size}
              selected_emails={selected_emails}
              some_selected={some_selected}
              total_messages={email_state.total_messages}
            />
          </>
        )}

        {show_full_email_viewer && split_email_id ? (
          <div className="flex-1 overflow-hidden">
            <FullEmailViewer
              email_id={split_email_id}
              on_back={on_split_close || (() => {})}
              on_forward={on_forward}
              snoozed_until={split_email_snoozed_until}
            />
          </div>
        ) : is_split_view && !is_full_view_mode ? (
          <div
            className="flex-1 flex min-h-0"
            style={{
              cursor: is_dragging ? "col-resize" : undefined,
              userSelect: is_dragging ? "none" : undefined,
            }}
          >
            <div
              className="overflow-y-auto overflow-x-hidden"
              style={{
                width: pane_width,
                minWidth: MIN_LIST_WIDTH,
                flexShrink: 0,
                flexGrow: 0,
              }}
            >
              {email_list_content}
            </div>
            <div
              className="w-px cursor-col-resize relative transition-colors hover:bg-blue-500"
              role="presentation"
              style={{
                backgroundColor: is_dragging
                  ? "var(--accent-blue)"
                  : "var(--border-primary)",
                flexShrink: 0,
              }}
              onMouseDown={handle_drag_start}
            >
              <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
            </div>
            <div className="overflow-hidden" style={{ flex: 1, minWidth: 0 }}>
              {split_scheduled_data ? (
                <SplitScheduledViewer
                  on_close={on_split_scheduled_close || (() => {})}
                  on_edit={on_scheduled_edit}
                  scheduled_data={split_scheduled_data}
                />
              ) : split_email_id ? (
                <SplitEmailViewer
                  email_id={split_email_id}
                  on_close={on_split_close || (() => {})}
                  on_forward={on_forward}
                  snoozed_until={split_email_snoozed_until}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">{email_list_content}</div>
        )}

        <ConfirmModal
          confirm_text="Delete"
          confirm_variant="destructive"
          description="Are you sure you want to delete the selected messages? This action cannot be undone."
          dont_ask={dont_ask_delete}
          on_cancel={cancel_delete}
          on_confirm={confirm_delete}
          on_dont_ask_change={set_dont_ask_delete}
          show={confirmations.show_delete}
          title="Delete Messages"
        />

        <ConfirmModal
          confirm_text="Archive"
          confirm_variant="default"
          description="Are you sure you want to archive the selected messages?"
          dont_ask={dont_ask_archive}
          on_cancel={cancel_archive}
          on_confirm={confirm_archive}
          on_dont_ask_change={set_dont_ask_archive}
          show={confirmations.show_archive}
          title="Archive Messages"
        />

        <AlertDialog open={show_empty_spam_dialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Empty spam folder?</AlertDialogTitle>
              <AlertDialogDescription>
                All {email_state.emails.filter((e) => e.is_spam).length}{" "}
                messages in the spam folder will be permanently deleted. This
                action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={is_emptying_spam}
                onClick={cancel_empty_spam}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={is_emptying_spam}
                onClick={confirm_empty_spam}
              >
                {is_emptying_spam ? "Deleting..." : "Delete all"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <CustomSnoozeModal
          is_open={custom_snooze_email !== null || show_toolbar_custom_snooze}
          on_close={() => {
            set_custom_snooze_email(null);
            set_show_toolbar_custom_snooze(false);
          }}
          on_snooze={async (snooze_until) => {
            if (custom_snooze_email) {
              await handle_snooze(custom_snooze_email.id, snooze_until);
            } else if (show_toolbar_custom_snooze) {
              await handle_toolbar_snooze(snooze_until);
            }
          }}
        />

        {on_compose && (
          <motion.button
            className="md:hidden fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center z-40"
            style={{
              background:
                "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
              boxShadow: "0 4px 14px rgba(59, 130, 246, 0.4)",
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={on_compose}
          >
            <PencilSquareIcon className="w-6 h-6 text-white" />
          </motion.button>
        )}
      </div>
    </ErrorBoundary>
  );
}

interface ToolbarFolderOption {
  folder_token: string;
  name: string;
  color: string;
}

interface InboxToolbarProps {
  active_filter: InboxFilterType;
  on_filter_change: (filter: InboxFilterType) => void;
  all_selected: boolean;
  some_selected: boolean;
  on_toggle_select_all: () => void;
  on_archive: () => void;
  on_unarchive?: () => void;
  on_delete: () => void;
  on_reply: () => void;
  on_mark_read: () => void;
  on_spam: () => void;
  on_snooze?: (snooze_until: Date) => void;
  on_custom_snooze?: () => void;
  on_empty_spam?: () => void;
  filtered_count: number;
  total_messages: number;
  folders?: ToolbarFolderOption[];
  on_toggle_folder?: (folder_token: string, should_remove: boolean) => void;
  selected_emails?: InboxEmail[];
  current_page: number;
  page_size: number;
  on_page_change: (page: number) => void;
  current_view?: string;
}

type FolderAssignmentStatus = "all" | "some" | "none";

function InboxToolbar({
  active_filter,
  on_filter_change,
  all_selected,
  some_selected,
  on_toggle_select_all,
  on_archive,
  on_unarchive,
  on_delete,
  on_reply,
  on_mark_read,
  on_spam,
  on_snooze,
  on_custom_snooze,
  on_empty_spam,
  filtered_count,
  total_messages,
  folders = [],
  on_toggle_folder,
  selected_emails = [],
  current_page,
  page_size,
  on_page_change,
  current_view = "inbox",
}: InboxToolbarProps): React.ReactElement {
  const is_archive_view = current_view === "archive";
  const is_spam_view = current_view === "spam";
  const filters = [
    { key: "all" as InboxFilterType, label: "All", icon: InboxIcon },
    { key: "unread" as InboxFilterType, label: "Unread", icon: EnvelopeIcon },
    { key: "read" as InboxFilterType, label: "Read", icon: EnvelopeOpenIcon },
    {
      key: "attachments" as InboxFilterType,
      label: "Attachments",
      icon: PaperClipIcon,
    },
  ];

  const has_selection = all_selected || some_selected;

  const get_folder_assignment_status = useCallback(
    (folder_token: string): FolderAssignmentStatus => {
      if (selected_emails.length === 0) return "none";
      const emails_with_folder = selected_emails.filter((email) =>
        email.folders?.some((f) => f.folder_token === folder_token),
      );

      if (emails_with_folder.length === 0) return "none";
      if (emails_with_folder.length === selected_emails.length) return "all";

      return "some";
    },
    [selected_emails],
  );

  const handle_folder_click = useCallback(
    (folder_token: string) => {
      const status = get_folder_assignment_status(folder_token);
      const should_remove = status === "all";

      on_toggle_folder?.(folder_token, should_remove);
    },
    [get_folder_assignment_status, on_toggle_folder],
  );

  return (
    <div
      className="flex-shrink-0 border-b"
      style={{ borderColor: "var(--border-primary)" }}
    >
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={cn(
                  "w-[18px] h-[18px] rounded-[4px] border-[1.5px] flex items-center justify-center flex-shrink-0",
                  has_selection
                    ? "bg-blue-500 border-blue-500"
                    : "bg-transparent border-[var(--text-muted)] hover:border-[var(--text-tertiary)]",
                )}
                onClick={on_toggle_select_all}
              >
                {all_selected ? (
                  <CheckIcon className="w-3 h-3 text-white" />
                ) : some_selected ? (
                  <MinusIcon className="w-3 h-3 text-white" />
                ) : null}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Select all</TooltipContent>
          </Tooltip>

          <Separator
            className="h-4 bg-[var(--border-secondary)]"
            orientation="vertical"
          />

          <div className="flex items-center gap-0.5 overflow-x-auto">
            {filters.map(({ key, label, icon: Icon }) => {
              const is_active = active_filter === key;

              return (
                <button
                  key={key}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 text-[13px] font-medium rounded-md transition-colors duration-150 whitespace-nowrap border",
                    is_active
                      ? "text-[var(--text-primary)] bg-[var(--indicator-bg)] border-[var(--border-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] border-transparent",
                  )}
                  onClick={() => on_filter_change(key)}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              );
            })}
          </div>

          <Separator
            className="h-4 mx-1 bg-[var(--border-secondary)] hidden sm:block"
            orientation="vertical"
          />

          <div className="hidden sm:flex items-center gap-0.5">
            <ToolbarButton
              icon={ArrowUturnLeftIcon}
              label="Reply"
              on_click={on_reply}
            />
            <ToolbarButton
              icon={EnvelopeOpenIcon}
              label="Mark as read"
              on_click={on_mark_read}
            />

            <Tooltip>
              <DropdownMenu>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button className="h-8 w-8" size="icon" variant="ghost">
                      <FolderPlusIcon className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Move to folder</TooltipContent>
                <DropdownMenuContent align="start" className="w-48">
                  {folders.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-[var(--text-muted)]">
                      No folders
                    </div>
                  ) : (
                    folders.map((folder) => {
                      const status = get_folder_assignment_status(
                        folder.folder_token,
                      );

                      return (
                        <DropdownMenuItem
                          key={folder.folder_token}
                          onClick={() =>
                            handle_folder_click(folder.folder_token)
                          }
                        >
                          <span className="w-4 h-4 flex items-center justify-center">
                            {status === "all" && (
                              <CheckIcon className="w-3.5 h-3.5 text-blue-500" />
                            )}
                            {status === "some" && (
                              <MinusIcon className="w-3.5 h-3.5 text-blue-400" />
                            )}
                          </span>
                          <span
                            className="w-2.5 h-2.5 rounded-full ml-1"
                            style={{ backgroundColor: folder.color }}
                          />
                          <span className="ml-2 truncate">{folder.name}</span>
                        </DropdownMenuItem>
                      );
                    })
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </Tooltip>

            {on_snooze && (
              <Tooltip>
                <DropdownMenu>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button className="h-8 w-8" size="icon" variant="ghost">
                        <ClockIcon className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Snooze</TooltipContent>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem
                      onClick={() => {
                        const date = new Date();

                        date.setHours(date.getHours() + 4);
                        on_snooze(date);
                      }}
                    >
                      Later today (4 hours)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const date = new Date();

                        date.setDate(date.getDate() + 1);
                        date.setHours(9, 0, 0, 0);
                        on_snooze(date);
                      }}
                    >
                      Tomorrow (9 AM)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const date = new Date();
                        const day = date.getDay();
                        const days_until_saturday =
                          day === 6 ? 7 : (6 - day + 7) % 7;

                        date.setDate(date.getDate() + days_until_saturday);
                        date.setHours(9, 0, 0, 0);
                        on_snooze(date);
                      }}
                    >
                      This weekend
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const date = new Date();

                        date.setDate(date.getDate() + 7);
                        date.setHours(9, 0, 0, 0);
                        on_snooze(date);
                      }}
                    >
                      Next week
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const date = new Date();

                        date.setMonth(date.getMonth() + 1);
                        date.setHours(9, 0, 0, 0);
                        on_snooze(date);
                      }}
                    >
                      Next month
                    </DropdownMenuItem>
                    {on_custom_snooze && (
                      <>
                        <Separator className="my-1" />
                        <DropdownMenuItem onClick={on_custom_snooze}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          Pick date & time
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </Tooltip>
            )}

            {is_archive_view ? (
              <ToolbarButton
                icon={InboxIcon}
                label="Move to inbox"
                on_click={on_unarchive}
              />
            ) : (
              <ToolbarButton
                icon={ArchiveBoxArrowDownIcon}
                label="Archive"
                on_click={on_archive}
              />
            )}
            <ToolbarButton
              icon={ShieldExclamationIcon}
              label="Report spam"
              on_click={on_spam}
            />
            <ToolbarButton
              icon={TrashIcon}
              label="Delete"
              on_click={on_delete}
            />
            {is_spam_view && on_empty_spam && filtered_count > 0 && (
              <>
                <Separator
                  className="h-4 mx-1 bg-[var(--border-secondary)]"
                  orientation="vertical"
                />
                <Button
                  className="h-8 px-3 text-xs font-medium"
                  size="sm"
                  variant="outline"
                  onClick={on_empty_spam}
                >
                  Empty spam
                </Button>
              </>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-8 w-8 sm:hidden" size="icon" variant="ghost">
                <EllipsisHorizontalIcon className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={on_reply}>
                <ArrowUturnLeftIcon className="w-4 h-4 mr-2" />
                Reply
              </DropdownMenuItem>
              <DropdownMenuItem onClick={on_mark_read}>
                <EnvelopeOpenIcon className="w-4 h-4 mr-2" />
                Mark as read
              </DropdownMenuItem>
              {on_snooze && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <ClockIcon className="w-4 h-4 mr-2" />
                    Snooze
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      onClick={() => {
                        const date = new Date();

                        date.setHours(date.getHours() + 4);
                        on_snooze(date);
                      }}
                    >
                      Later today
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const date = new Date();

                        date.setDate(date.getDate() + 1);
                        date.setHours(9, 0, 0, 0);
                        on_snooze(date);
                      }}
                    >
                      Tomorrow
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const date = new Date();

                        date.setDate(date.getDate() + 7);
                        date.setHours(9, 0, 0, 0);
                        on_snooze(date);
                      }}
                    >
                      Next week
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {is_archive_view ? (
                <DropdownMenuItem onClick={on_unarchive}>
                  <InboxIcon className="w-4 h-4 mr-2" />
                  Move to inbox
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={on_archive}>
                  <ArchiveBoxArrowDownIcon className="w-4 h-4 mr-2" />
                  Archive
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={on_spam}>
                <ShieldExclamationIcon className="w-4 h-4 mr-2" />
                Report spam
              </DropdownMenuItem>
              <DropdownMenuItem onClick={on_delete}>
                <TrashIcon className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipProvider>

        <div className="ml-auto flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
          {(() => {
            const start = filtered_count > 0 ? current_page * page_size + 1 : 0;
            const end = Math.min(
              (current_page + 1) * page_size,
              filtered_count,
            );
            const total_pages = Math.ceil(filtered_count / page_size);
            const can_go_prev = current_page > 0;
            const can_go_next = current_page < total_pages - 1;

            return (
              <>
                <span className="hidden sm:inline tabular-nums">
                  {filtered_count > 0 ? `${start}-${end}` : "0"} of{" "}
                  {total_messages}
                </span>
                <span className="sm:hidden tabular-nums">
                  {end}/{total_messages}
                </span>
                <Button
                  className="h-6 w-6"
                  disabled={!can_go_prev}
                  size="icon"
                  variant="ghost"
                  onClick={() => on_page_change(current_page - 1)}
                >
                  <ChevronLeftIcon className="w-3.5 h-3.5" />
                </Button>
                <Button
                  className="h-6 w-6"
                  disabled={!can_go_next}
                  size="icon"
                  variant="ghost"
                  onClick={() => on_page_change(current_page + 1)}
                >
                  <ChevronRightIcon className="w-3.5 h-3.5" />
                </Button>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

interface ToolbarButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  on_click?: () => void;
}

function ToolbarButton({
  icon: Icon,
  label,
  on_click,
}: ToolbarButtonProps): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className="h-8 w-8"
          size="icon"
          variant="ghost"
          onClick={on_click}
        >
          <Icon className="w-[18px] h-[18px] text-[var(--text-secondary)]" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function LoadingState(): React.ReactElement {
  const container_ref = useRef<HTMLDivElement>(null);
  const [row_count, set_row_count] = useState(10);

  useLayoutEffect(() => {
    const calculate_rows = () => {
      if (container_ref.current) {
        const parent = container_ref.current.parentElement;
        const container_height = parent
          ? parent.clientHeight
          : container_ref.current.clientHeight;
        const row_height = 52;
        const header_height = 41;

        set_row_count(
          Math.max(
            Math.ceil((container_height - header_height) / row_height) + 1,
            1,
          ),
        );
      }
    };

    calculate_rows();
    window.addEventListener("resize", calculate_rows);

    return () => window.removeEventListener("resize", calculate_rows);
  }, []);

  return (
    <div ref={container_ref}>
      <div className="flex flex-col">
        <div className="px-3 sm:px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Skeleton className="w-3.5 h-3.5" />
            <Skeleton className="w-14 h-3" />
          </div>
        </div>
        <Separator className="bg-[var(--border-primary)]" />
      </div>
      {Array.from({ length: row_count }).map((_, i) => (
        <SkeletonEmailRow key={i} />
      ))}
    </div>
  );
}

function SkeletonEmailRow(): React.ReactElement {
  return (
    <div
      className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 border-b"
      style={{ borderColor: "var(--border-secondary)" }}
    >
      <Skeleton className="w-[18px] h-[18px] flex-shrink-0" />
      <Skeleton className="w-[18px] h-[18px] flex-shrink-0 hidden sm:block" />
      <Skeleton className="w-8 h-8 rounded-full flex-shrink-0 hidden sm:block" />
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="w-24 sm:w-28 h-4" />
          <Skeleton className="w-10 h-3 sm:hidden ml-auto" />
        </div>
        <div className="flex items-center gap-2 sm:contents">
          <Skeleton className="w-16 h-5 rounded-full hidden md:block" />
          <Skeleton className="w-32 sm:w-40 h-4" />
          <Skeleton className="flex-1 max-w-48 h-3 hidden lg:block" />
        </div>
      </div>
      <Skeleton className="w-12 h-3 hidden sm:block" />
    </div>
  );
}

interface EmptyStateProps {
  current_view: string;
  user_email: string | undefined;
  view_title: string;
}

function EmptyState({
  current_view,
  user_email,
  view_title,
}: EmptyStateProps): React.ReactElement {
  const get_empty_config = () => {
    if (current_view === "inbox" || current_view === "") {
      return {
        icon: InboxIcon,
        title: "Your inbox is empty",
        subtitle: "New messages will appear here",
        icon_color: "text-[var(--text-muted)]",
      };
    }
    if (current_view === "sent") {
      return {
        icon: PaperAirplaneIcon,
        title: "No sent messages",
        subtitle: "Messages you send will appear here",
        icon_color: "text-[var(--text-muted)]",
      };
    }
    if (current_view === "drafts") {
      return {
        icon: PencilSquareIcon,
        title: "No drafts",
        subtitle: "Drafts you're working on will appear here",
        icon_color: "text-[var(--text-muted)]",
      };
    }
    if (current_view === "starred") {
      return {
        icon: StarIcon,
        title: "No starred messages",
        subtitle: "Star important emails to find them quickly",
        icon_color: "text-[var(--text-muted)]",
      };
    }
    if (current_view === "archived") {
      return {
        icon: ArchiveBoxArrowDownIcon,
        title: "Nothing archived",
        subtitle: "Archive emails to keep your inbox clean",
        icon_color: "text-[var(--text-muted)]",
      };
    }
    if (current_view === "spam") {
      return {
        icon: ShieldExclamationIcon,
        title: "No spam",
        subtitle: "Suspicious emails will be caught here",
        icon_color: "text-[var(--text-muted)]",
      };
    }
    if (current_view === "trash") {
      return {
        icon: TrashIcon,
        title: "Trash is empty",
        subtitle: "Deleted emails will appear here",
        icon_color: "text-[var(--text-muted)]",
      };
    }
    if (current_view.startsWith("folder-")) {
      return {
        icon: FolderIcon,
        title: "This folder is empty",
        subtitle: "Move emails here to organize them",
        icon_color: "text-[var(--text-muted)]",
      };
    }

    return {
      icon: EnvelopeIcon,
      title: `No ${view_title.toLowerCase()}`,
      subtitle: "Nothing to show here yet",
      icon_color: "text-[var(--text-muted)]",
    };
  };

  const config = get_empty_config();
  const IconComponent = config.icon;

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <IconComponent
        className={cn("w-12 h-12 sm:w-14 sm:h-14 mb-4", config.icon_color)}
        strokeWidth={1}
      />
      <div className="text-center">
        <p className="text-sm sm:text-base font-medium text-[var(--text-primary)] mb-1">
          {config.title}
        </p>
        <p className="text-xs sm:text-sm text-[var(--text-muted)]">
          {config.subtitle}
        </p>
        {(current_view === "inbox" || current_view === "") && user_email && (
          <p className="text-[10px] sm:text-xs mt-3 text-[var(--text-muted)] opacity-60 truncate max-w-full">
            {user_email}
          </p>
        )}
      </div>
    </div>
  );
}

interface LockedFolderStateProps {
  folder_name: string;
}

function FolderNotFoundState(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <FolderIcon
        className="w-12 h-12 sm:w-14 sm:h-14 mb-4 text-[var(--text-muted)]"
        strokeWidth={1}
      />
      <div className="text-center">
        <p className="text-sm sm:text-base font-medium text-[var(--text-primary)] mb-1">
          Folder not found
        </p>
        <p className="text-xs sm:text-sm text-[var(--text-muted)]">
          This folder may have been deleted or doesn&apos;t exist
        </p>
      </div>
    </div>
  );
}

function LockedFolderState({
  folder_name,
}: LockedFolderStateProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <LockClosedIcon
        className="w-12 h-12 sm:w-14 sm:h-14 mb-4 text-[var(--text-muted)]"
        strokeWidth={1}
      />
      <div className="text-center">
        <p className="text-sm sm:text-base font-medium text-[var(--text-primary)] mb-1">
          This folder is locked
        </p>
        <p className="text-xs sm:text-sm text-[var(--text-muted)]">
          Click on &quot;<span className="font-medium">{folder_name}</span>
          &quot; in the sidebar to unlock
        </p>
      </div>
    </div>
  );
}

interface EmailListProps {
  pinned_emails: InboxEmail[];
  primary_emails: InboxEmail[];
  density: string;
  show_profile_pictures: boolean;
  show_email_preview: boolean;
  on_toggle_select: (id: string) => void;
  on_email_click: (id: string) => void;
  current_view: string;
  folders: { id: string; name: string; color: string }[];
  on_reply: (email: InboxEmail) => void;
  on_forward: (email: InboxEmail) => void;
  on_toggle_read: (email: InboxEmail) => void;
  on_toggle_pin: (email: InboxEmail) => void;
  on_snooze: (email: InboxEmail, snooze_until: Date) => Promise<void>;
  on_custom_snooze: (email: InboxEmail) => void;
  on_unsnooze: (email: InboxEmail) => Promise<void>;
  on_archive: (email: InboxEmail) => void;
  on_spam: (email: InboxEmail) => void;
  on_delete: (email: InboxEmail) => void;
  on_folder_toggle: (email: InboxEmail, folder_id: string) => void;
  on_restore: (email: InboxEmail) => void;
  on_mark_not_spam: (email: InboxEmail) => void;
  on_move_to_inbox: (email: InboxEmail) => void;
  selected_email_id?: string | null;
  disable_layout_animation?: boolean;
  focused_email_id?: string | null;
}

function EmailList({
  pinned_emails,
  primary_emails,
  density,
  show_profile_pictures,
  show_email_preview,
  on_toggle_select,
  on_email_click,
  current_view,
  folders,
  focused_email_id,
  on_reply,
  on_forward,
  on_toggle_read,
  on_toggle_pin,
  on_snooze,
  on_custom_snooze,
  on_unsnooze,
  on_archive,
  on_spam,
  on_delete,
  on_folder_toggle,
  on_restore,
  on_mark_not_spam,
  on_move_to_inbox,
  selected_email_id,
  disable_layout_animation,
}: EmailListProps): React.ReactElement {
  const is_special_view =
    current_view === "drafts" || current_view === "scheduled";
  const show_hover_actions = !is_special_view;

  const render_email_item = (email: InboxEmail) => (
    <EmailContextMenu
      current_view={current_view}
      email={email}
      folders={folders}
      on_archive={() => on_archive(email)}
      on_custom_snooze={() => on_custom_snooze(email)}
      on_delete={() => on_delete(email)}
      on_folder_toggle={(folder_id) => on_folder_toggle(email, folder_id)}
      on_forward={() => on_forward(email)}
      on_mark_not_spam={() => on_mark_not_spam(email)}
      on_move_to_inbox={() => on_move_to_inbox(email)}
      on_reply={() => on_reply(email)}
      on_restore={() => on_restore(email)}
      on_snooze={(snooze_until) => on_snooze(email, snooze_until)}
      on_spam={() => on_spam(email)}
      on_toggle_pin={() => on_toggle_pin(email)}
      on_toggle_read={() => on_toggle_read(email)}
      on_unsnooze={() => on_unsnooze(email)}
    >
      <InboxEmailListItem
        current_view={current_view}
        density={density}
        email={email}
        is_active={email.id === selected_email_id}
        is_focused={email.id === focused_email_id}
        on_archive={show_hover_actions ? () => on_archive(email) : undefined}
        on_delete={show_hover_actions ? () => on_delete(email) : undefined}
        on_email_click={on_email_click}
        on_mark_not_spam={
          show_hover_actions ? () => on_mark_not_spam(email) : undefined
        }
        on_move_to_inbox={
          show_hover_actions ? () => on_move_to_inbox(email) : undefined
        }
        on_restore={show_hover_actions ? () => on_restore(email) : undefined}
        on_spam={show_hover_actions ? () => on_spam(email) : undefined}
        on_toggle_read={
          show_hover_actions ? () => on_toggle_read(email) : undefined
        }
        on_toggle_select={on_toggle_select}
        show_email_preview={show_email_preview}
        show_profile_pictures={show_profile_pictures}
      />
    </EmailContextMenu>
  );

  return (
    <>
      {pinned_emails.length > 0 && (
        <>
          <SectionHeader
            color="text-blue-500"
            icon={MapPinIcon}
            label="Pinned"
          />
          <AnimatePresence mode="popLayout">
            {pinned_emails.map((email) => (
              <motion.div
                key={email.id}
                exit={{ opacity: 0, height: 0 }}
                initial={{ opacity: 1, height: "auto" }}
                layout={!disable_layout_animation}
                transition={
                  disable_layout_animation ? { duration: 0 } : { duration: 0.2 }
                }
              >
                {render_email_item(email)}
              </motion.div>
            ))}
          </AnimatePresence>
        </>
      )}

      {primary_emails.length > 0 && (
        <>
          <SectionHeader icon={EnvelopeIcon} label="Primary" />
          <AnimatePresence mode="popLayout">
            {primary_emails.map((email) => (
              <motion.div
                key={email.id}
                exit={{ opacity: 0, height: 0 }}
                initial={{ opacity: 1, height: "auto" }}
                layout={!disable_layout_animation}
                transition={
                  disable_layout_animation ? { duration: 0 } : { duration: 0.2 }
                }
              >
                {render_email_item(email)}
              </motion.div>
            ))}
          </AnimatePresence>
        </>
      )}
    </>
  );
}

interface SectionHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color?: string;
}

function SectionHeader({
  icon: Icon,
  label,
  color,
}: SectionHeaderProps): React.ReactElement {
  return (
    <div className="flex flex-col">
      <div className="px-3 sm:px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Icon
            className={cn("w-3.5 h-3.5", color || "text-[var(--text-muted)]")}
          />
          <span
            className={cn(
              "text-[12px] font-semibold uppercase tracking-wider",
              color || "text-[var(--text-muted)]",
            )}
          >
            {label}
          </span>
        </div>
      </div>
      <Separator className="bg-[var(--border-primary)]" />
    </div>
  );
}

interface ConfirmModalProps {
  show: boolean;
  title: string;
  description: string;
  confirm_text: string;
  confirm_variant: "default" | "destructive";
  dont_ask: boolean;
  on_dont_ask_change: (value: boolean) => void;
  on_confirm: () => void;
  on_cancel: () => void;
}

function ConfirmModal({
  show,
  title,
  description,
  confirm_text,
  confirm_variant,
  dont_ask,
  on_dont_ask_change,
  on_confirm,
  on_cancel,
}: ConfirmModalProps): React.ReactElement {
  const is_destructive = confirm_variant === "destructive";

  return (
    <AlertDialog open={show} onOpenChange={(open) => !open && on_cancel()}>
      <AlertDialogContent
        className="gap-0 p-0 overflow-hidden max-w-[380px]"
        on_overlay_click={on_cancel}
      >
        <div className="px-6 pt-6 pb-5">
          <AlertDialogHeader className="space-y-2">
            <AlertDialogTitle className="text-16 font-semibold">
              {title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-14 leading-normal">
              {description}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <label
            className="inline-flex items-center gap-2 cursor-pointer select-none mt-5"
            htmlFor="dont-ask-checkbox"
          >
            <Checkbox
              checked={dont_ask}
              id="dont-ask-checkbox"
              onCheckedChange={(checked) =>
                on_dont_ask_change(checked === true)
              }
            />
            <span className="text-13" style={{ color: "var(--text-muted)" }}>
              Don&apos;t ask again
            </span>
          </label>
        </div>

        <AlertDialogFooter className="flex-row gap-3 px-6 pb-6 pt-2 sm:justify-end">
          <AlertDialogCancel asChild>
            <Button className="mt-0" size="lg" variant="outline">
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              size="lg"
              variant={is_destructive ? "destructive" : "primary"}
              onClick={on_confirm}
            >
              {confirm_text}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
