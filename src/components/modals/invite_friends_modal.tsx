import type { DecryptedContact, Contact } from "@/types/contacts";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  LinkIcon,
  CheckIcon,
  PaperAirplaneIcon,
  EnvelopeIcon,
  XMarkIcon,
  PlusIcon,
  ArrowPathIcon,
  UserPlusIcon,
  GiftIcon,
  ClipboardDocumentIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { show_toast } from "@/components/toast/simple_toast";
import { use_referrals } from "@/hooks/use_referrals";
import { format_storage_size } from "@/services/api/referrals";
import { list_contacts, decrypt_contacts } from "@/services/api/contacts";

interface InviteFriendsModalProps {
  is_open: boolean;
  on_close: () => void;
}

const REWARD_PER_REFERRAL_MB = 500;

export function InviteFriendsModal({
  is_open,
  on_close,
}: InviteFriendsModalProps) {
  const {
    stats,
    is_loading,
    is_sending,
    error,
    send_invite,
    send_bulk_invites,
    refresh,
  } = use_referrals();

  const [email_input, set_email_input] = useState("");
  const [email_list, set_email_list] = useState<string[]>([]);
  const [send_success, set_send_success] = useState(false);
  const [contacts, set_contacts] = useState<DecryptedContact[]>([]);
  const [is_loading_contacts, set_is_loading_contacts] = useState(false);
  const [is_inviting_all, set_is_inviting_all] = useState(false);
  const success_timeout_ref = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (is_open) {
      refresh();
    }
  }, [is_open, refresh]);

  const load_all_contacts = useCallback(async () => {
    set_is_loading_contacts(true);
    try {
      const all_contacts: Contact[] = [];
      let cursor: string | undefined;

      do {
        const response = await list_contacts({ limit: 100, cursor });

        if (response.data) {
          all_contacts.push(...response.data.items);
          cursor = response.data.next_cursor ?? undefined;
        } else {
          break;
        }
      } while (cursor);

      if (all_contacts.length > 0) {
        const decrypted = await decrypt_contacts(all_contacts);

        set_contacts(decrypted);
      }
    } catch {
    } finally {
      set_is_loading_contacts(false);
    }
  }, []);

  useEffect(() => {
    if (is_open) {
      load_all_contacts();
    }
  }, [is_open, load_all_contacts]);

  const handle_close = useCallback(() => {
    on_close();
    set_email_input("");
    set_email_list([]);
    if (success_timeout_ref.current) clearTimeout(success_timeout_ref.current);
    set_send_success(false);
  }, [on_close]);

  const handle_copy_link = useCallback(() => {
    if (!stats) return;
    navigator.clipboard.writeText(stats.referral_link);
    show_toast("Link copied to clipboard", "success");
  }, [stats]);

  const share_on_twitter = useCallback(() => {
    if (!stats) return;
    const text = encodeURIComponent(
      `I'm using Aster for secure, encrypted email. Sign up with my link and we both get ${format_storage_size(REWARD_PER_REFERRAL_MB)} free storage.`,
    );
    const url = encodeURIComponent(stats.referral_link);

    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      "_blank",
    );
  }, [stats]);

  const share_on_whatsapp = useCallback(() => {
    if (!stats) return;
    const text = encodeURIComponent(
      `Hey! I've been using Aster for secure email. Sign up with my link and we both get ${format_storage_size(REWARD_PER_REFERRAL_MB)} free storage: ${stats.referral_link}`,
    );

    window.open(`https://wa.me/?text=${text}`, "_blank");
  }, [stats]);

  const share_on_linkedin = useCallback(() => {
    if (!stats) return;
    const url = encodeURIComponent(stats.referral_link);

    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      "_blank",
    );
  }, [stats]);

  const share_via_email = useCallback(() => {
    if (!stats) return;
    const subject = encodeURIComponent("Join me on Aster - Secure Email");
    const body = encodeURIComponent(
      `Hi,\n\nI've been using Aster for my email - end-to-end encrypted, private, and easy to use.\n\nSign up using my referral link and we'll both get ${format_storage_size(REWARD_PER_REFERRAL_MB)} of free storage:\n${stats.referral_link}`,
    );

    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }, [stats]);

  const handle_add_email = useCallback(() => {
    const email = email_input.trim().toLowerCase();

    if (email && email.includes("@") && !email_list.includes(email)) {
      set_email_list((prev) => [...prev, email]);
      set_email_input("");
    }
  }, [email_input, email_list]);

  const handle_remove_email = useCallback((email: string) => {
    set_email_list((prev) => prev.filter((e) => e !== email));
  }, []);

  const handle_send_invites = useCallback(async () => {
    const emails_to_send =
      email_list.length > 0
        ? email_list
        : email_input.trim()
          ? [email_input.trim().toLowerCase()]
          : [];

    if (emails_to_send.length === 0) return;

    if (emails_to_send.length === 1) {
      const success = await send_invite(emails_to_send[0]);

      if (success) {
        set_email_list([]);
        set_email_input("");
        set_send_success(true);
        if (success_timeout_ref.current)
          clearTimeout(success_timeout_ref.current);
        success_timeout_ref.current = setTimeout(
          () => set_send_success(false),
          3000,
        );
      }
    } else {
      const result = await send_bulk_invites(emails_to_send);

      if (result.sent > 0) {
        set_email_list([]);
        set_email_input("");
        set_send_success(true);
        if (success_timeout_ref.current)
          clearTimeout(success_timeout_ref.current);
        success_timeout_ref.current = setTimeout(
          () => set_send_success(false),
          3000,
        );
      }
    }
  }, [email_input, email_list, send_invite, send_bulk_invites]);

  const handle_invite_all = useCallback(async () => {
    const contact_emails = contacts
      .flatMap((contact) => contact.emails)
      .filter((email): email is string => !!email && email.includes("@"))
      .map((email) => email.toLowerCase());

    const unique_emails = [...new Set(contact_emails)];

    if (unique_emails.length === 0) {
      show_toast("No contacts with email addresses found", "info");

      return;
    }

    set_is_inviting_all(true);

    try {
      const result = await send_bulk_invites(unique_emails);

      if (result.sent > 0) {
        show_toast(
          `Invites sent to ${result.sent} contact${result.sent !== 1 ? "s" : ""}`,
          "success",
        );
        handle_close();
      } else if (result.failed > 0) {
        show_toast(
          `Failed to send ${result.failed} invite${result.failed !== 1 ? "s" : ""}`,
          "error",
        );
      }
    } finally {
      set_is_inviting_all(false);
    }
  }, [contacts, send_bulk_invites, handle_close]);

  const successful_count = stats?.successful_referrals ?? 0;
  const progress_percentage = stats
    ? Math.min(100, (stats.bonus_storage_mb / stats.max_bonus_storage_mb) * 100)
    : 0;

  return (
    <Modal is_open={is_open} on_close={handle_close} size="md">
      <ModalHeader className="text-center pb-2">
        <div className="flex items-center justify-center mb-2">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "var(--accent-subtle)" }}
          >
            <GiftIcon
              className="w-6 h-6"
              style={{ color: "var(--accent-primary)" }}
            />
          </div>
        </div>
        <ModalTitle className="text-lg">
          Give {format_storage_size(REWARD_PER_REFERRAL_MB)}, Get{" "}
          {format_storage_size(REWARD_PER_REFERRAL_MB)}
        </ModalTitle>
        <ModalDescription className="text-sm mt-1">
          Invite friends to Aster. You both earn free storage when they sign up.
        </ModalDescription>
      </ModalHeader>

      {is_loading ? (
        <div className="px-6 pb-6 space-y-3">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ) : (
        <div className="px-6 pb-6 space-y-5">
          <div
            className="rounded-lg p-4 border"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-primary)",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <UserPlusIcon
                  className="w-4 h-4"
                  style={{ color: "var(--text-muted)" }}
                />
                <span
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {successful_count} friend{successful_count !== 1 ? "s" : ""}{" "}
                  joined
                </span>
              </div>
              <span
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {format_storage_size(stats?.bonus_storage_mb ?? 0)} earned
              </span>
            </div>
            <Progress className="h-1.5" value={progress_percentage} />
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
              Up to {format_storage_size(stats?.max_bonus_storage_mb ?? 16384)}{" "}
              bonus storage
            </p>
          </div>

          <div>
            <label
              className="block text-xs font-medium mb-2"
              htmlFor="invite-share-link"
              style={{ color: "var(--text-secondary)" }}
            >
              Share your link
            </label>
            <button
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors hover:border-[var(--accent-primary)] group"
              id="invite-share-link"
              style={{
                borderColor: "var(--border-secondary)",
                backgroundColor: "var(--bg-tertiary)",
              }}
              onClick={handle_copy_link}
            >
              <LinkIcon
                className="w-4 h-4 flex-shrink-0"
                style={{ color: "var(--text-muted)" }}
              />
              <span
                className="text-sm flex-1 text-left truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {stats?.referral_link.replace("https://", "")}
              </span>
              <ClipboardDocumentIcon
                className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--text-muted)" }}
              />
            </button>
          </div>

          <div>
            <label
              className="block text-xs font-medium mb-2"
              htmlFor="invite-share-on"
              style={{ color: "var(--text-secondary)" }}
            >
              Share on
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors hover:border-[var(--accent-primary)]"
                style={{
                  borderColor: "var(--border-secondary)",
                  backgroundColor: "var(--bg-tertiary)",
                }}
                onClick={share_on_twitter}
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  style={{ color: "var(--text-secondary)" }}
                  viewBox="0 0 24 24"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span
                  className="text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Twitter
                </span>
              </button>
              <button
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors hover:border-[var(--accent-primary)]"
                style={{
                  borderColor: "var(--border-secondary)",
                  backgroundColor: "var(--bg-tertiary)",
                }}
                onClick={share_on_whatsapp}
              >
                <svg
                  className="w-5 h-5 text-green-500"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                <span
                  className="text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  WhatsApp
                </span>
              </button>
              <button
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors hover:border-[var(--accent-primary)]"
                style={{
                  borderColor: "var(--border-secondary)",
                  backgroundColor: "var(--bg-tertiary)",
                }}
                onClick={share_on_linkedin}
              >
                <svg
                  className="w-5 h-5 text-blue-600"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                <span
                  className="text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  LinkedIn
                </span>
              </button>
              <button
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors hover:border-[var(--accent-primary)]"
                style={{
                  borderColor: "var(--border-secondary)",
                  backgroundColor: "var(--bg-tertiary)",
                }}
                onClick={share_via_email}
              >
                <EnvelopeIcon
                  className="w-5 h-5"
                  style={{ color: "var(--text-secondary)" }}
                />
                <span
                  className="text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  Email
                </span>
              </button>
            </div>
          </div>

          <div
            className="relative flex items-center gap-3"
            style={{ color: "var(--text-muted)" }}
          >
            <div
              className="flex-1 h-px"
              style={{ backgroundColor: "var(--border-secondary)" }}
            />
            <span className="text-xs">or send a direct invite</span>
            <div
              className="flex-1 h-px"
              style={{ backgroundColor: "var(--border-secondary)" }}
            />
          </div>

          <div>
            {email_list.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {email_list.map((email) => (
                  <div
                    key={email}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs"
                    style={{
                      backgroundColor: "var(--accent-subtle)",
                      color: "var(--accent-primary)",
                    }}
                  >
                    <span className="max-w-[150px] truncate">{email}</span>
                    <button
                      className="hover:opacity-70 transition-opacity"
                      onClick={() => handle_remove_email(email)}
                    >
                      <XMarkIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  className="pr-8 h-10"
                  placeholder="friend@example.com"
                  type="email"
                  value={email_input}
                  onChange={(e) => set_email_input(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (email_list.length > 0 || email_input.includes("@")) {
                        handle_add_email();
                      }
                    }
                  }}
                />
                {email_input && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ color: "var(--text-muted)" }}
                    onClick={handle_add_email}
                  >
                    <PlusIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Button
                disabled={
                  is_sending || (email_list.length === 0 && !email_input.trim())
                }
                size="lg"
                variant="primary"
                onClick={handle_send_invites}
              >
                {is_sending ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : send_success ? (
                  <>
                    <CheckIcon className="w-4 h-4" />
                    Sent
                  </>
                ) : (
                  <>
                    <PaperAirplaneIcon className="w-4 h-4" />
                    Send
                  </>
                )}
              </Button>
            </div>

            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
          </div>
        </div>
      )}

      <ModalFooter className="flex gap-2 pt-4 border-t border-[var(--border-secondary)]">
        <Button className="flex-1" variant="outline" onClick={handle_close}>
          Cancel
        </Button>
        <Button className="flex-1" variant="outline" onClick={handle_copy_link}>
          <LinkIcon className="w-4 h-4" />
          Copy Link
        </Button>
        <Button
          className="flex-1"
          disabled={
            is_inviting_all || is_loading_contacts || contacts.length === 0
          }
          variant="primary"
          onClick={handle_invite_all}
        >
          {is_inviting_all ? (
            <ArrowPathIcon className="w-4 h-4 animate-spin" />
          ) : is_loading_contacts ? (
            <>
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <UsersIcon className="w-4 h-4" />
              Invite All{contacts.length > 0 ? ` (${contacts.length})` : ""}
            </>
          )}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
