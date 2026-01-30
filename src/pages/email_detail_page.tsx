import type { DecryptedEnvelope } from "@/types/email";
import type { DecryptedThreadMessage } from "@/types/thread";

import { useParams, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeftIcon,
  ArchiveBoxIcon,
  TrashIcon,
  TagIcon,
  EllipsisVerticalIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
  PrinterIcon,
  ArrowDownTrayIcon,
  LockClosedIcon,
  EnvelopeIcon,
  UserIcon,
  ChatBubbleLeftIcon,
  NoSymbolIcon,
  DocumentTextIcon,
  ArrowTopRightOnSquareIcon,
  EllipsisHorizontalIcon,
} from "@heroicons/react/24/outline";

import { get_email_username } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Sidebar, MobileMenuButton } from "@/components/layout/sidebar";
import {
  ComposeManager,
  useComposeManager,
} from "@/components/compose/compose_manager";
import { ReplyModal } from "@/components/modals/reply_modal";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { ForwardModal } from "@/components/modals/forward_modal";
import { SettingsPanel } from "@/components/settings/settings_panel";
import { ThreadMessagesList } from "@/components/email/thread_message_block";
import { ThreadDraftBadge } from "@/components/email/thread_draft_badge";
import { get_mail_item, type MailItem } from "@/services/api/mail";
import { fetch_and_decrypt_thread_messages } from "@/services/thread_service";
import { update_item_metadata } from "@/services/crypto/mail_metadata";
import { batch_archive, batch_unarchive } from "@/services/api/archive";
import {
  get_draft,
  get_draft_by_thread,
  type DraftWithContent,
  type DraftContent,
} from "@/services/api/multi_drafts";
import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";
import {
  try_decrypt_ratchet_body,
  try_decrypt_pgp_body,
} from "@/utils/email_crypto";
import { use_auth } from "@/contexts/auth_context";
import {
  get_preferences,
  DEFAULT_PREFERENCES,
} from "@/services/api/preferences";
import {
  get_passphrase_bytes,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import {
  decrypt_envelope_with_bytes,
  base64_to_array,
} from "@/services/crypto/envelope";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { use_folders } from "@/hooks/use_folders";
import { is_folder_unlocked } from "@/hooks/use_protected_folder";
import { adjust_unread_count } from "@/hooks/use_mail_counts";
import { use_document_title } from "@/hooks/use_document_title";
import { use_date_format } from "@/hooks/use_date_format";
import { use_preferences } from "@/contexts/preferences_context";
import { emit_mail_item_updated } from "@/hooks/mail_events";
import { print_email } from "@/utils/print_email";

interface DecryptedEmail {
  id: string;
  sender: string;
  sender_email: string;
  subject: string;
  preview: string;
  timestamp: string;
  is_read: boolean;
  is_starred: boolean;
  has_attachment: boolean;
  thread_count: number;
  body: string;
  html_content?: string;
  to: Array<{ name?: string; email: string }>;
  cc: Array<{ name?: string; email?: string }>;
  bcc: Array<{ name?: string; email?: string }>;
  replies: Array<{
    id: string;
    sender: string;
    sender_email: string;
    avatar: string;
    timestamp: string;
    body: string;
    attachments: Array<{ name: string; size: string }>;
  }>;
  attachments: Array<{ name: string; size: string }>;
  labels: string[];
}

async function decrypt_mail_envelope(
  encrypted_envelope: string,
  envelope_nonce: string,
): Promise<DecryptedEnvelope | null> {
  const nonce_bytes = envelope_nonce
    ? base64_to_array(envelope_nonce)
    : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted_envelope);
      const json = new TextDecoder().decode(encrypted_bytes);

      return JSON.parse(json) as DecryptedEnvelope;
    } catch {
      return null;
    }
  }

  const passphrase_bytes = get_passphrase_bytes();

  if (!passphrase_bytes) return null;

  try {
    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<DecryptedEnvelope>(
        encrypted_envelope,
        passphrase_bytes,
      );

      zero_uint8_array(passphrase_bytes);

      return result;
    }

    zero_uint8_array(passphrase_bytes);

    const vault = get_vault_from_memory();

    if (!vault?.identity_key) return null;

    const key_hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(vault.identity_key + "astermail-envelope-v1"),
    );
    const crypto_key = await crypto.subtle.importKey(
      "raw",
      key_hash,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64_to_array(envelope_nonce) },
      crypto_key,
      base64_to_array(encrypted_envelope),
    );

    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    zero_uint8_array(passphrase_bytes);

    return null;
  }
}

export default function EmailDetailPage() {
  const { email_id } = useParams();
  const navigate = useNavigate();
  const { vault, user } = use_auth();
  const { state: folders_state } = use_folders();
  const { format_email_popup } = use_date_format();
  const { preferences, update_preference, save_now } = use_preferences();
  const mark_as_read_timeout = useRef<number | null>(null);
  const [mail_item, set_mail_item] = useState<MailItem | null>(null);
  const [email, set_email] = useState<DecryptedEmail | null>(null);
  const [is_loading, set_is_loading] = useState(true);
  const [error, set_error] = useState<string | null>(null);
  const [is_unsubscribe_modal_open, set_is_unsubscribe_modal_open] =
    useState(false);
  const [is_sender_dropdown_open, set_is_sender_dropdown_open] =
    useState(false);
  const [is_block_sender_modal_open, set_is_block_sender_modal_open] =
    useState(false);
  const [is_reply_modal_open, set_is_reply_modal_open] = useState(false);
  const [is_archive_confirm_open, set_is_archive_confirm_open] =
    useState(false);
  const [is_trash_confirm_open, set_is_trash_confirm_open] = useState(false);
  const [is_forward_modal_open, set_is_forward_modal_open] = useState(false);
  const [is_settings_open, set_is_settings_open] = useState(false);
  const [settings_section, set_settings_section] = useState<string | undefined>(
    undefined,
  );
  const {
    instances: compose_instances,
    open_compose,
    close_compose,
    toggle_minimize,
  } = useComposeManager();
  const [auto_advance, set_auto_advance] = useState(
    DEFAULT_PREFERENCES.auto_advance,
  );
  const [email_list, _set_email_list] = useState<string[]>([]);
  const [is_archive_loading, set_is_archive_loading] = useState(false);
  const [is_trash_loading, set_is_trash_loading] = useState(false);
  const [is_mobile_sidebar_open, set_is_mobile_sidebar_open] = useState(false);
  const [thread_messages, set_thread_messages] = useState<
    DecryptedThreadMessage[]
  >([]);
  const [thread_draft, set_thread_draft] = useState<DraftWithContent | null>(
    null,
  );
  const [current_user_email, set_current_user_email] = useState("");

  use_document_title({ email_subject: email?.subject });

  const toggle_mobile_sidebar = useCallback(() => {
    set_is_mobile_sidebar_open((prev) => !prev);
  }, []);

  const fetch_email = useCallback(async () => {
    if (!email_id) {
      set_error("No email ID provided");
      set_is_loading(false);

      return;
    }

    const start_time = Date.now();
    const min_duration = 500;

    const ensure_min_duration = async () => {
      const elapsed = Date.now() - start_time;

      if (elapsed < min_duration) {
        await new Promise((r) => setTimeout(r, min_duration - elapsed));
      }
    };

    set_is_loading(true);
    set_email(null);

    const response = await get_mail_item(email_id);

    if (response.error) {
      const vault = get_vault_from_memory();

      if (vault) {
        const draft_response = await get_draft(email_id, vault);

        if (draft_response.data) {
          const recipients =
            draft_response.data.content.to_recipients.join(", ") ||
            "No recipients";
          const decrypted: DecryptedEmail = {
            id: draft_response.data.id,
            sender: recipients,
            sender_email: draft_response.data.content.to_recipients[0] || "",
            subject: draft_response.data.content.subject || "(No subject)",
            preview: draft_response.data.content.message.substring(0, 200),
            timestamp: format_email_popup(
              new Date(draft_response.data.updated_at),
            ),
            is_read: true,
            is_starred: false,
            has_attachment: false,
            thread_count: 1,
            body: draft_response.data.content.message,
            to: draft_response.data.content.to_recipients.map((email) => ({
              email,
            })),
            cc:
              draft_response.data.content.cc_recipients?.map((email) => ({
                email,
              })) || [],
            bcc:
              draft_response.data.content.bcc_recipients?.map((email) => ({
                email,
              })) || [],
            replies: [],
            attachments: [],
            labels: ["Draft"],
          };

          set_email(decrypted);
          await ensure_min_duration();
          set_is_loading(false);

          return;
        }
      }

      await ensure_min_duration();
      set_error(response.error);
      set_is_loading(false);

      return;
    }

    if (response.data) {
      if (response.data.folders && response.data.folders.length > 0) {
        for (const mail_folder of response.data.folders) {
          const folder = folders_state.folders.find(
            (f) => f.folder_token === mail_folder.token,
          );

          if (
            folder &&
            folder.is_password_protected &&
            folder.password_set &&
            !is_folder_unlocked(folder.id)
          ) {
            await ensure_min_duration();
            set_error(
              "This email is in a locked folder. Please unlock the folder first.",
            );
            set_is_loading(false);

            return;
          }
        }
      }

      set_mail_item(response.data);

      if (
        !response.data.metadata?.is_read &&
        response.data.item_type === "received" &&
        preferences.mark_as_read_delay !== "never"
      ) {
        const mail_data = response.data;
        const mark_read = () => {
          adjust_unread_count(-1);
          update_item_metadata(
            email_id,
            {
              encrypted_metadata: mail_data.encrypted_metadata,
              metadata_nonce: mail_data.metadata_nonce,
            },
            { is_read: true },
          ).then((result) => {
            if (result.success) {
              emit_mail_item_updated({ id: email_id, is_read: true });
            }
          });
        };

        if (preferences.mark_as_read_delay === "immediate") {
          mark_read();
        } else {
          const delay_ms =
            preferences.mark_as_read_delay === "1_second" ? 1000 : 3000;

          mark_as_read_timeout.current = window.setTimeout(mark_read, delay_ms);
        }
      }

      const envelope = await decrypt_mail_envelope(
        response.data.encrypted_envelope,
        response.data.envelope_nonce,
      );

      if (envelope) {
        let body_text = user?.email
          ? await try_decrypt_ratchet_body(
              envelope.body_text,
              user.email,
              envelope.from.email,
            )
          : envelope.body_text;

        body_text = await try_decrypt_pgp_body(body_text);

        const decrypted: DecryptedEmail = {
          id: response.data.id,
          sender: envelope.from.name || get_email_username(envelope.from.email),
          sender_email: envelope.from.email,
          subject: envelope.subject || "(No subject)",
          preview: body_text.substring(0, 200),
          timestamp: format_email_popup(
            new Date(envelope.sent_at || response.data.created_at),
          ),
          is_read: response.data.metadata?.is_read ?? false,
          is_starred: response.data.metadata?.is_starred ?? false,
          has_attachment: response.data.metadata?.has_attachments ?? false,
          thread_count: 1,
          body: body_text,
          to: envelope.to || [],
          cc: envelope.cc || [],
          bcc: envelope.bcc || [],
          replies: [],
          attachments: [],
          labels: [],
        };

        set_email(decrypted);

        const single_message: DecryptedThreadMessage = {
          id: response.data.id,
          item_type: response.data.item_type as "received" | "sent" | "draft",
          sender_name:
            envelope.from.name ||
            get_email_username(envelope.from.email) ||
            "Unknown",
          sender_email: envelope.from.email || "",
          subject: envelope.subject || "(No subject)",
          body: body_text || "",
          timestamp: response.data.message_ts || response.data.created_at,
          is_read: response.data.metadata?.is_read ?? false,
          is_starred: response.data.metadata?.is_starred ?? false,
          is_deleted: false,
          is_external: response.data.is_external,
          encrypted_metadata: response.data.encrypted_metadata,
          metadata_nonce: response.data.metadata_nonce,
        };

        if (response.data.thread_token) {
          const thread_result = await fetch_and_decrypt_thread_messages(
            response.data.thread_token,
            user?.email,
          );

          if (thread_result.messages.length > 0) {
            set_thread_messages(thread_result.messages);
          } else {
            set_thread_messages([single_message]);
          }
        } else {
          set_thread_messages([single_message]);
        }

        if (user?.email) {
          set_current_user_email(user.email);
        }

        if (response.data.thread_token) {
          const current_vault = get_vault_from_memory();

          if (current_vault) {
            const draft_result = await get_draft_by_thread(
              response.data.thread_token,
              current_vault,
            );

            if (draft_result.data) {
              set_thread_draft(draft_result.data);
            }
          }
        }
      }

      await ensure_min_duration();
      set_is_loading(false);
    } else {
      await ensure_min_duration();
      set_is_loading(false);
    }
  }, [email_id, folders_state.folders, user?.id, user?.email]);

  useEffect(() => {
    if (mark_as_read_timeout.current) {
      clearTimeout(mark_as_read_timeout.current);
      mark_as_read_timeout.current = null;
    }

    fetch_email();

    return () => {
      if (mark_as_read_timeout.current) {
        clearTimeout(mark_as_read_timeout.current);
        mark_as_read_timeout.current = null;
      }
    };
  }, [fetch_email]);

  useEffect(() => {
    const load_preferences = async () => {
      if (!vault) return;
      const response = await get_preferences(vault);

      if (response.data) {
        set_auto_advance(response.data.auto_advance);
      }
    };

    load_preferences();
  }, [vault]);

  const current_email_index = useMemo(() => {
    if (!email_id || email_list.length === 0) return -1;

    return email_list.indexOf(email_id);
  }, [email_id, email_list]);

  const can_go_newer = current_email_index > 0;
  const can_go_older =
    current_email_index !== -1 && current_email_index < email_list.length - 1;

  const handle_go_newer = useCallback(() => {
    if (can_go_newer) {
      navigate(`/email/${email_list[current_email_index - 1]}`);
    }
  }, [can_go_newer, current_email_index, email_list, navigate]);

  const handle_go_older = useCallback(() => {
    if (can_go_older) {
      navigate(`/email/${email_list[current_email_index + 1]}`);
    }
  }, [can_go_older, current_email_index, email_list, navigate]);

  const get_next_email_destination = useCallback(() => {
    if (!email_id || current_email_index === -1) return "/";

    if (auto_advance === "Go to next message") {
      if (can_go_older) {
        return `/email/${email_list[current_email_index + 1]}`;
      }

      return "/";
    } else if (auto_advance === "Go to previous message") {
      if (can_go_newer) {
        return `/email/${email_list[current_email_index - 1]}`;
      }

      return "/";
    }

    return "/";
  }, [
    email_id,
    current_email_index,
    email_list,
    auto_advance,
    can_go_newer,
    can_go_older,
  ]);

  const handle_archive = useCallback(async () => {
    if (!email_id || is_archive_loading) return;

    set_is_archive_loading(true);
    set_is_archive_confirm_open(false);

    const result = await batch_archive({ ids: [email_id], tier: "hot" });

    set_is_archive_loading(false);

    if (result.data?.success) {
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      show_action_toast({
        message: "Conversation archived",
        action_type: "archive",
        email_ids: [email_id],
        on_undo: async () => {
          await batch_unarchive({ ids: [email_id] });
          window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
        },
      });
      navigate(get_next_email_destination());
    }
  }, [email_id, is_archive_loading, get_next_email_destination, navigate]);

  const handle_trash = useCallback(async () => {
    if (!email_id || is_trash_loading || !mail_item) return;

    set_is_trash_loading(true);
    set_is_trash_confirm_open(false);

    const result = await update_item_metadata(
      email_id,
      {
        encrypted_metadata: mail_item.encrypted_metadata,
        metadata_nonce: mail_item.metadata_nonce,
      },
      { is_trashed: true },
    );

    set_is_trash_loading(false);

    if (result.success) {
      window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
      show_action_toast({
        message: "Conversation moved to trash",
        action_type: "trash",
        email_ids: [email_id],
        on_undo: async () => {
          await update_item_metadata(
            email_id,
            {
              encrypted_metadata: result.encrypted?.encrypted_metadata,
              metadata_nonce: result.encrypted?.metadata_nonce,
            },
            { is_trashed: false },
          );
          window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
        },
      });
      navigate(get_next_email_destination());
    }
  }, [
    email_id,
    is_trash_loading,
    get_next_email_destination,
    navigate,
    mail_item,
  ]);

  const handle_print = useCallback(() => {
    if (!email) return;

    print_email({
      subject: email.subject,
      sender: email.sender,
      sender_email: email.sender_email,
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      timestamp: email.timestamp,
      body: email.body,
    });
  }, [email]);

  const handle_copy_text = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    show_toast(`Copied ${label}`, "success");
  };

  const handle_draft_saved = useCallback(
    (draft: { id: string; version: number; content: DraftContent }) => {
      if (!mail_item?.thread_token) return;

      const now = new Date().toISOString();
      const expires_at = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      set_thread_draft({
        id: draft.id,
        version: draft.version,
        draft_type: "reply",
        reply_to_id: mail_item.id,
        thread_token: mail_item.thread_token,
        content: draft.content,
        created_at: now,
        updated_at: now,
        expires_at,
      });
    },
    [mail_item?.id, mail_item?.thread_token],
  );

  const handle_edit_thread_draft = useCallback(
    (draft: DraftWithContent) => {
      open_compose({
        id: draft.id,
        version: draft.version,
        draft_type: draft.draft_type,
        reply_to_id: draft.reply_to_id,
        thread_token: draft.thread_token,
        to_recipients: draft.content.to_recipients,
        cc_recipients: draft.content.cc_recipients,
        bcc_recipients: draft.content.bcc_recipients,
        subject: draft.content.subject,
        message: draft.content.message,
        updated_at: draft.updated_at,
      });
    },
    [open_compose],
  );

  const handle_thread_draft_deleted = useCallback(() => {
    set_thread_draft(null);
  }, []);

  return (
    <>
      <div
        className="h-screen w-full flex transition-colors duration-200 overflow-hidden"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        <Sidebar
          is_mobile_open={is_mobile_sidebar_open}
          on_compose={open_compose}
          on_mobile_toggle={toggle_mobile_sidebar}
          on_settings_click={(section) => {
            set_settings_section(section);
            set_is_settings_open(true);
          }}
        />
        <div className="flex-1 p-1 md:p-2 min-h-0 min-w-0 flex flex-col overflow-hidden">
          <div
            className="flex-1 w-full rounded-lg md:rounded-xl border overflow-hidden flex flex-col transition-colors duration-200"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-primary)",
            }}
          >
            <div
              className="flex items-center gap-1 px-2 sm:px-3 py-2 border-b flex-shrink-0"
              style={{ borderColor: "var(--border-secondary)" }}
            >
              <div className="md:hidden mr-1">
                <MobileMenuButton on_click={toggle_mobile_sidebar} />
              </div>
              <Button
                className="h-9 w-9 sm:h-8 sm:w-8"
                size="icon"
                variant="ghost"
                onClick={() => navigate(-1)}
              >
                <ArrowLeftIcon className="w-5 h-5 sm:w-4 sm:h-4" />
              </Button>

              <div className="hidden sm:block w-px h-5 mx-1 bg-[var(--border-secondary)]" />

              <div className="hidden sm:flex items-center gap-1">
                <Button className="h-8 w-8" size="icon" variant="ghost">
                  <TagIcon className="w-4 h-4" />
                </Button>

                <Button
                  className="h-8 w-8"
                  disabled={is_archive_loading}
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    preferences.confirm_before_archive
                      ? set_is_archive_confirm_open(true)
                      : handle_archive()
                  }
                >
                  <ArchiveBoxIcon className="w-4 h-4" />
                </Button>

                <Button className="h-8 w-8" size="icon" variant="ghost">
                  <ExclamationCircleIcon className="w-4 h-4" />
                </Button>

                <Button
                  className="h-8 w-8"
                  disabled={is_trash_loading}
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    preferences.confirm_before_delete
                      ? set_is_trash_confirm_open(true)
                      : handle_trash()
                  }
                >
                  <TrashIcon className="w-4 h-4" />
                </Button>

                <div className="hidden lg:block w-px h-5 mx-1 bg-[var(--border-secondary)]" />

                <div className="hidden lg:flex items-center gap-1">
                  <Button className="h-8 w-8" size="icon" variant="ghost">
                    <ArrowDownTrayIcon className="w-4 h-4" />
                  </Button>

                  <Button
                    className="h-8 w-8"
                    size="icon"
                    variant="ghost"
                    onClick={handle_print}
                  >
                    <PrinterIcon className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="h-8 w-8" size="icon" variant="ghost">
                    <EllipsisVerticalIcon className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <div className="sm:hidden">
                    <DropdownMenuItem
                      onClick={() =>
                        preferences.confirm_before_archive
                          ? set_is_archive_confirm_open(true)
                          : handle_archive()
                      }
                    >
                      <ArchiveBoxIcon className="w-4 h-4 mr-2" />
                      Archive
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        preferences.confirm_before_delete
                          ? set_is_trash_confirm_open(true)
                          : handle_trash()
                      }
                    >
                      <TrashIcon className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <TagIcon className="w-4 h-4 mr-2" />
                      Move to folder
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <ExclamationCircleIcon className="w-4 h-4 mr-2" />
                      Report spam
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </div>
                  <div className="lg:hidden sm:block hidden">
                    <DropdownMenuItem>
                      <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handle_print}>
                      <PrinterIcon className="w-4 h-4 mr-2" />
                      Print
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </div>
                  <DropdownMenuItem>
                    <DocumentTextIcon className="w-4 h-4 mr-2" />
                    View message source
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <ArrowTopRightOnSquareIcon className="w-4 h-4 mr-2" />
                    Open in new window
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex-1" />

              {email_list.length > 0 && current_email_index !== -1 && (
                <span className="hidden sm:inline text-xs text-[var(--text-muted)] mr-1">
                  {current_email_index + 1} of {email_list.length}
                </span>
              )}
              <Button
                className="h-7 w-7"
                disabled={!can_go_newer}
                size="icon"
                variant="ghost"
                onClick={handle_go_newer}
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </Button>
              <Button
                className="h-7 w-7"
                disabled={!can_go_older}
                size="icon"
                variant="ghost"
                onClick={handle_go_older}
              >
                <ChevronRightIcon className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 pb-20 sm:pb-6">
              {is_loading ? (
                <EmailDetailSkeleton />
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 px-4">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <ExclamationCircleIcon className="w-7 h-7 sm:w-8 sm:h-8 text-red-500" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-sm sm:text-base font-semibold mb-1 text-[var(--text-primary)]">
                      Message not found
                    </h3>
                    <p className="text-xs sm:text-sm text-[var(--text-muted)]">
                      {error}
                    </p>
                  </div>
                  <Button onClick={() => navigate(-1)}>Go back</Button>
                </div>
              ) : email ? (
                <div className="max-w-4xl mx-auto flex flex-col h-full">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 sm:mb-6 gap-2 sm:gap-0">
                    <div className="flex-1 min-w-0">
                      <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-[var(--text-primary)] break-words mb-1 sm:mb-2">
                        {email.subject}
                      </h1>
                      <span className="text-xs sm:text-sm text-[var(--text-muted)]">
                        {email.timestamp}
                      </span>
                    </div>
                  </div>

                  <div className="mb-4 sm:mb-6 flex items-start gap-2 sm:gap-3">
                    <button
                      className="flex-shrink-0"
                      onClick={() =>
                        set_is_sender_dropdown_open(!is_sender_dropdown_open)
                      }
                    >
                      <ProfileAvatar
                        use_domain_logo
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        email={email.sender_email}
                        name={email.sender}
                        size="md"
                      />
                    </button>
                    <div className="flex-1 min-w-0 relative">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-0 sm:gap-2 flex-wrap">
                        <button
                          className="font-medium text-xs sm:text-sm text-[var(--text-primary)] hover:text-blue-500 transition-colors text-left"
                          onClick={() =>
                            set_is_sender_dropdown_open(
                              !is_sender_dropdown_open,
                            )
                          }
                        >
                          {email.sender}
                        </button>
                        <span className="text-xs sm:text-sm text-[var(--text-muted)] truncate">
                          &lt;{email.sender_email}&gt;
                        </span>
                      </div>
                      <div className="text-xs sm:text-sm text-[var(--text-muted)] mt-0.5">
                        to me
                      </div>

                      <AnimatePresence>
                        {is_sender_dropdown_open && (
                          <>
                            <motion.div
                              animate={{ opacity: 1 }}
                              className="fixed inset-0 z-40"
                              exit={{ opacity: 0 }}
                              initial={{ opacity: 0 }}
                              transition={{ duration: 0.1 }}
                              onClick={() => set_is_sender_dropdown_open(false)}
                            />
                            <motion.div
                              animate={{ opacity: 1, y: 0 }}
                              className="absolute top-full left-0 z-50 w-64 sm:w-72 border rounded-lg shadow-lg mt-2 overflow-hidden"
                              exit={{ opacity: 0, y: -4 }}
                              initial={{ opacity: 0, y: -4 }}
                              style={{
                                backgroundColor: "var(--bg-primary)",
                                borderColor: "var(--border-secondary)",
                              }}
                              transition={{ duration: 0.15 }}
                            >
                              <div className="p-2 sm:p-3">
                                <div className="flex items-center gap-2 sm:gap-3">
                                  <ProfileAvatar
                                    use_domain_logo
                                    email={email.sender_email}
                                    name={email.sender}
                                    size="md"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <button
                                      className="font-medium text-xs sm:text-sm text-[var(--text-primary)] hover:text-blue-500 transition-colors text-left w-full truncate"
                                      onClick={() =>
                                        handle_copy_text(email.sender, "name")
                                      }
                                    >
                                      {email.sender}
                                    </button>
                                    <button
                                      className="text-xs text-[var(--text-muted)] hover:text-blue-500 transition-colors text-left w-full truncate"
                                      onClick={() =>
                                        handle_copy_text(
                                          email.sender_email,
                                          "email",
                                        )
                                      }
                                    >
                                      {email.sender_email}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <Separator />

                              <div className="p-1">
                                <button className="w-full flex items-center gap-2 sm:gap-2.5 text-left px-2 sm:px-3 py-2 text-xs sm:text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] rounded-md transition-colors">
                                  <EnvelopeIcon className="w-4 h-4" />
                                  New message
                                </button>
                                <button className="w-full flex items-center gap-2 sm:gap-2.5 text-left px-2 sm:px-3 py-2 text-xs sm:text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] rounded-md transition-colors">
                                  <UserIcon className="w-4 h-4" />
                                  Add to contacts
                                </button>
                                <button className="w-full flex items-center gap-2 sm:gap-2.5 text-left px-2 sm:px-3 py-2 text-xs sm:text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] rounded-md transition-colors">
                                  <ChatBubbleLeftIcon className="w-4 h-4" />
                                  View all messages
                                </button>
                                <Separator className="my-1" />
                                <button
                                  className="w-full flex items-center gap-2 sm:gap-2.5 text-left px-2 sm:px-3 py-2 text-xs sm:text-sm text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                                  onClick={() => {
                                    set_is_sender_dropdown_open(false);
                                    set_is_block_sender_modal_open(true);
                                  }}
                                >
                                  <NoSymbolIcon className="w-4 h-4" />
                                  Block sender
                                </button>
                              </div>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                      <Button
                        className="gap-1.5"
                        size="sm"
                        onClick={() => {
                          set_is_forward_modal_open(false);
                          set_is_reply_modal_open(true);
                        }}
                      >
                        <ArrowUturnLeftIcon className="w-4 h-4" />
                        Reply
                      </Button>
                      <Button
                        className="gap-1.5"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          set_is_reply_modal_open(false);
                          set_is_forward_modal_open(true);
                        }}
                      >
                        <ArrowUturnRightIcon className="w-4 h-4" />
                        Forward
                      </Button>
                    </div>
                  </div>

                  <div className="mb-4 sm:mb-6">
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 px-3 sm:px-4 py-2 sm:py-3 rounded-lg"
                      style={{
                        backgroundColor: "rgba(59, 130, 246, 0.08)",
                        border: "1px solid rgba(59, 130, 246, 0.2)",
                      }}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <EnvelopeIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <span className="text-xs sm:text-sm text-[var(--text-secondary)]">
                          This message is from a mailing list
                        </span>
                      </div>
                      <Button
                        className="text-blue-500 hover:text-blue-600 hover:bg-blue-500/10 self-end sm:self-auto"
                        size="sm"
                        variant="ghost"
                        onClick={() => set_is_unsubscribe_modal_open(true)}
                      >
                        Unsubscribe
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <ThreadMessagesList
                      hide_counter
                      current_user_email={current_user_email}
                      default_expanded_id={email.id}
                      messages={
                        thread_messages.length > 0
                          ? thread_messages
                          : [
                              {
                                id: email.id,
                                item_type: "received" as const,
                                sender_name: email.sender,
                                sender_email: email.sender_email,
                                subject: email.subject,
                                body: email.body,
                                timestamp: email.timestamp,
                                is_read: email.is_read,
                                is_starred: email.is_starred,
                                is_deleted: false,
                                is_external: mail_item?.is_external ?? false,
                              },
                            ]
                      }
                      on_toggle_message_read={(message_id) => {
                        const msg = thread_messages.find(
                          (m) => m.id === message_id,
                        );

                        if (!msg) return;

                        const new_read = !msg.is_read;

                        set_thread_messages((prev) =>
                          prev.map((m) =>
                            m.id === message_id
                              ? { ...m, is_read: new_read }
                              : m,
                          ),
                        );
                        emit_mail_item_updated({
                          id: message_id,
                          is_read: new_read,
                        });

                        update_item_metadata(
                          message_id,
                          {
                            encrypted_metadata: msg.encrypted_metadata,
                            metadata_nonce: msg.metadata_nonce,
                          },
                          { is_read: new_read },
                        ).then((result) => {
                          if (!result.success) {
                            set_thread_messages((prev) =>
                              prev.map((m) =>
                                m.id === message_id
                                  ? { ...m, is_read: !new_read }
                                  : m,
                              ),
                            );
                            emit_mail_item_updated({
                              id: message_id,
                              is_read: !new_read,
                            });
                          }
                        });
                      }}
                      subject={email.subject}
                    />

                    {thread_draft && !is_reply_modal_open && (
                      <ThreadDraftBadge
                        current_user_email={current_user_email}
                        current_user_name={user?.display_name}
                        draft={thread_draft}
                        on_deleted={handle_thread_draft_deleted}
                        on_edit={handle_edit_thread_draft}
                      />
                    )}
                  </div>

                  {email.attachments.length > 0 && (
                    <div className="mt-4 sm:mt-6">
                      <div className="flex items-center gap-2 mb-2 sm:mb-3">
                        <span className="text-xs sm:text-sm font-medium text-[var(--text-primary)]">
                          Attachments
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">
                          ({email.attachments.length} file
                          {email.attachments.length > 1 ? "s" : ""})
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-2">
                        {email.attachments.map((attachment, idx) => (
                          <button
                            key={idx}
                            className="flex items-center gap-2 px-2 sm:px-3 py-2 border rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-hover)] w-full sm:w-auto"
                            style={{
                              backgroundColor: "var(--bg-card)",
                              borderColor: "var(--border-secondary)",
                            }}
                          >
                            <div className="w-6 h-6 sm:w-7 sm:h-7 bg-blue-500 rounded flex items-center justify-center flex-shrink-0">
                              <DocumentTextIcon className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                            </div>
                            <div className="text-left min-w-0 flex-1">
                              <span className="text-xs sm:text-sm font-medium text-[var(--text-primary)] block truncate">
                                {attachment.name}
                              </span>
                              <span className="text-xs text-[var(--text-muted)]">
                                {attachment.size}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : mail_item ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 px-4">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <LockClosedIcon className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500" />
                  </div>
                  <div className="text-center max-w-sm">
                    <h3 className="text-sm sm:text-base font-semibold mb-1 text-[var(--text-primary)]">
                      Unable to Decrypt
                    </h3>
                    <p className="text-xs sm:text-sm text-[var(--text-muted)]">
                      This message could not be decrypted. Your session may have
                      expired.
                    </p>
                  </div>
                  <div
                    className="p-3 rounded-lg max-w-sm w-full"
                    style={{
                      backgroundColor: "rgba(245, 158, 11, 0.08)",
                      border: "1px solid rgba(245, 158, 11, 0.2)",
                    }}
                  >
                    <p className="text-xs text-[var(--text-secondary)] text-center">
                      Try signing out and signing back in to refresh your
                      encryption keys.
                    </p>
                  </div>
                  <Button onClick={() => navigate(-1)}>Back to inbox</Button>
                </div>
              ) : null}
            </div>

            {email && (
              <div
                className="sm:hidden flex-shrink-0 border-t px-2 py-2 flex items-center justify-around gap-1"
                style={{
                  borderColor: "var(--border-secondary)",
                  backgroundColor: "var(--bg-primary)",
                }}
              >
                <Button
                  className="flex-1 gap-1.5 h-10"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    set_is_forward_modal_open(false);
                    set_is_reply_modal_open(true);
                  }}
                >
                  <ArrowUturnLeftIcon className="w-4 h-4" />
                  <span className="text-xs">Reply</span>
                </Button>
                <Button
                  className="flex-1 gap-1.5 h-10"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    set_is_reply_modal_open(false);
                    set_is_forward_modal_open(true);
                  }}
                >
                  <ArrowUturnRightIcon className="w-4 h-4" />
                  <span className="text-xs">Forward</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="flex-1 gap-1.5 h-10"
                      size="sm"
                      variant="ghost"
                    >
                      <EllipsisHorizontalIcon className="w-4 h-4" />
                      <span className="text-xs">More</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="top">
                    <DropdownMenuItem
                      onClick={() =>
                        preferences.confirm_before_archive
                          ? set_is_archive_confirm_open(true)
                          : handle_archive()
                      }
                    >
                      <ArchiveBoxIcon className="w-4 h-4 mr-2" />
                      Archive
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        preferences.confirm_before_delete
                          ? set_is_trash_confirm_open(true)
                          : handle_trash()
                      }
                    >
                      <TrashIcon className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <TagIcon className="w-4 h-4 mr-2" />
                      Move to folder
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <ExclamationCircleIcon className="w-4 h-4 mr-2" />
                      Report spam
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handle_print}>
                      <PrinterIcon className="w-4 h-4 mr-2" />
                      Print
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {is_block_sender_modal_open && email && (
          <motion.div
            key="block-sender-modal"
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="fixed inset-0 bg-black/50 z-50"
              role="button"
              tabIndex={0}
              onClick={() => set_is_block_sender_modal_open(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  set_is_block_sender_modal_open(false);
                }
              }}
            />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm z-50 px-4 sm:px-0">
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl border p-4 sm:p-6 shadow-xl"
                exit={{ opacity: 0, scale: 0.95 }}
                initial={{ opacity: 0, scale: 0.95 }}
                style={{
                  backgroundColor: "var(--bg-primary)",
                  borderColor: "var(--border-secondary)",
                }}
                transition={{ duration: 0.15 }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <NoSymbolIcon className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
                  </div>
                  <h2 className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
                    Block sender
                  </h2>
                </div>

                <div
                  className="flex items-center gap-2 sm:gap-3 mb-4 p-2 sm:p-3 rounded-lg"
                  style={{ backgroundColor: "var(--bg-secondary)" }}
                >
                  <ProfileAvatar
                    use_domain_logo
                    email={email.sender_email}
                    name={email.sender}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs sm:text-sm text-[var(--text-primary)]">
                      {email.sender}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] truncate">
                      {email.sender_email}
                    </p>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-4 sm:mb-6">
                  Future emails from this sender will be automatically moved to
                  spam.
                </p>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:justify-end">
                  <Button
                    className="w-full sm:w-auto"
                    variant="outline"
                    onClick={() => set_is_block_sender_modal_open(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    variant="destructive"
                    onClick={() => {
                      set_is_block_sender_modal_open(false);
                    }}
                  >
                    Block sender
                  </Button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {is_unsubscribe_modal_open && (
          <motion.div
            key="unsubscribe-modal"
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="fixed inset-0 bg-black/50 z-50"
              role="button"
              tabIndex={0}
              onClick={() => set_is_unsubscribe_modal_open(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  set_is_unsubscribe_modal_open(false);
                }
              }}
            />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm z-50 px-4 sm:px-0">
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl border p-4 sm:p-6 shadow-xl"
                exit={{ opacity: 0, scale: 0.95 }}
                initial={{ opacity: 0, scale: 0.95 }}
                style={{
                  backgroundColor: "var(--bg-primary)",
                  borderColor: "var(--border-secondary)",
                }}
                transition={{ duration: 0.15 }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <EnvelopeIcon className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                  </div>
                  <h2 className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
                    Unsubscribe
                  </h2>
                </div>

                <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-4">
                  Are you sure you want to unsubscribe from this mailing list?
                </p>

                <div
                  className="p-2 sm:p-3 rounded-lg mb-4 sm:mb-6"
                  style={{ backgroundColor: "var(--bg-secondary)" }}
                >
                  <p className="text-xs text-[var(--text-muted)] mb-2">
                    Manual unsubscribe link:
                  </p>
                  <a
                    className="text-xs text-blue-500 hover:text-blue-600 break-all transition-colors"
                    href="https://example.com/unsubscribe"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    https://example.com/unsubscribe
                  </a>
                </div>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:justify-end">
                  <Button
                    className="w-full sm:w-auto"
                    variant="outline"
                    onClick={() => set_is_unsubscribe_modal_open(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => {
                      set_is_unsubscribe_modal_open(false);
                    }}
                  >
                    Unsubscribe
                  </Button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReplyModal
        is_open={is_reply_modal_open && !!email}
        on_close={() => set_is_reply_modal_open(false)}
        on_draft_saved={handle_draft_saved}
        original_body={email?.body}
        original_email_id={mail_item?.id}
        original_subject={email?.subject}
        original_timestamp={email?.timestamp}
        recipient_avatar=""
        recipient_email={email?.sender_email || ""}
        recipient_name={email?.sender || ""}
        thread_token={mail_item?.thread_token}
      />
      <ConfirmationModal
        show_dont_ask_again
        confirm_text="Archive"
        is_open={is_archive_confirm_open}
        message="This email will be moved to your Archive folder."
        on_cancel={() => set_is_archive_confirm_open(false)}
        on_confirm={handle_archive}
        on_dont_ask_again={async () => {
          update_preference("confirm_before_archive", false);
          await save_now();
        }}
        title="Archive Email?"
        variant="info"
      />
      <ConfirmationModal
        show_dont_ask_again
        confirm_text="Move to Trash"
        is_open={is_trash_confirm_open}
        message="This email will be moved to your Trash folder."
        on_cancel={() => set_is_trash_confirm_open(false)}
        on_confirm={handle_trash}
        on_dont_ask_again={async () => {
          update_preference("confirm_before_delete", false);
          await save_now();
        }}
        title="Move to Trash?"
        variant="danger"
      />
      <ForwardModal
        email_body={email?.body}
        email_subject={email?.subject || ""}
        email_timestamp={email?.timestamp}
        is_open={is_forward_modal_open && !!email}
        on_close={() => set_is_forward_modal_open(false)}
        sender_avatar=""
        sender_email={email?.sender_email || ""}
        sender_name={email?.sender || ""}
      />
      <SettingsPanel
        initial_section={settings_section as "billing" | "account" | undefined}
        is_open={is_settings_open}
        on_close={() => {
          set_is_settings_open(false);
          set_settings_section(undefined);
        }}
      />
      <ComposeManager
        instances={compose_instances}
        on_close={close_compose}
        on_toggle_minimize={toggle_minimize}
      />
    </>
  );
}

function EmailDetailSkeleton(): React.ReactElement {
  return (
    <div className="max-w-4xl mx-auto flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <Skeleton className="w-5 h-5 sm:w-6 sm:h-6" />
          <Skeleton className="h-6 sm:h-8 w-48 sm:w-72" />
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <Skeleton className="w-8 h-8" />
          <Skeleton className="w-8 h-8" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>

      <div className="mb-4 mt-2 flex items-start gap-2 sm:gap-3">
        <Skeleton className="w-8 h-8 sm:w-12 sm:h-12 rounded-full flex-shrink-0" />
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
            <Skeleton className="h-4 sm:h-5 w-28 sm:w-36" />
            <Skeleton className="h-3 sm:h-4 w-36 sm:w-44" />
          </div>
          <Skeleton className="h-3 sm:h-4 w-16 sm:w-24" />
        </div>
      </div>

      <div className="flex-1 rounded-lg p-3 sm:p-4 mt-4">
        <div className="space-y-2 sm:space-y-3">
          <Skeleton className="h-3 sm:h-4 w-full" />
          <Skeleton className="h-3 sm:h-4 w-[95%]" />
          <Skeleton className="h-3 sm:h-4 w-[88%]" />
          <Skeleton className="h-3 sm:h-4 w-[92%]" />
          <Skeleton className="h-3 sm:h-4 w-[70%]" />
          <div className="h-3 sm:h-4" />
          <Skeleton className="h-3 sm:h-4 w-[85%]" />
          <Skeleton className="h-3 sm:h-4 w-[90%]" />
          <Skeleton className="h-3 sm:h-4 w-[60%]" />
        </div>
      </div>
    </div>
  );
}
