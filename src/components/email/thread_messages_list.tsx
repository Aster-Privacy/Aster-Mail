//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { DecryptedThreadMessage } from "@/types/thread";
import type {
  ExternalContentReport,
  ImageLoadMode,
} from "@/lib/html_sanitizer";
import type { PreloadedSanitizedContent } from "@/components/email/hooks/preload_cache";

import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";

import { ChevronUpDownIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import { use_preferences } from "@/contexts/preferences_context";
import { update_item_metadata } from "@/services/crypto/mail_metadata";
import { emit_mail_item_updated } from "@/hooks/mail_events";
import { adjust_starred_count } from "@/hooks/use_mail_counts";
import { ThreadMessageBlock } from "@/components/email/thread_message_block";
import type { aggregated_reaction } from "@/components/email/message_reactions";
import { send_reaction, send_reaction_remove } from "@/services/send_reaction";

interface ThreadMessagesListProps {
  messages: DecryptedThreadMessage[];
  current_user_email: string;
  default_expanded_id?: string | null;
  subject: string;
  on_toggle_message_read?: (message_id: string) => void;
  on_mark_all_read?: () => void;
  on_reply?: (message: DecryptedThreadMessage) => void;
  on_reply_all?: (message: DecryptedThreadMessage) => void;
  on_forward?: (message: DecryptedThreadMessage) => void;
  on_archive?: (message: DecryptedThreadMessage) => void;
  on_trash?: (message: DecryptedThreadMessage) => void;
  on_print?: (message: DecryptedThreadMessage) => void;
  on_view_source?: (message: DecryptedThreadMessage) => void;
  on_report_phishing?: (message: DecryptedThreadMessage) => void;
  on_not_spam?: (message: DecryptedThreadMessage) => void;
  hide_counter?: boolean;
  hide_expand_collapse?: boolean;
  thread_message_count?: number;
  external_content_mode?: ImageLoadMode;
  on_external_content_detected?: (report: ExternalContentReport) => void;
  force_all_dark_mode?: boolean;
  inline_reply_msg?: DecryptedThreadMessage | null;
  inline_reply_thread_token?: string;
  inline_reply_is_external?: boolean;
  on_close_inline_reply?: () => void;
  inline_mode?: "reply" | "reply_all" | "forward";
  on_set_inline_mode?: (mode: "reply" | "reply_all" | "forward") => void;
  on_draft_saved?: (draft: {
    id: string;
    version: number;
    content: import("@/services/api/multi_drafts").DraftContent;
  }) => void;
  existing_draft?: {
    id: string;
    version: number;
    reply_to_id?: string;
    content: import("@/services/api/multi_drafts").DraftContent;
  } | null;
  preloaded_sanitized?: Map<string, PreloadedSanitizedContent>;
  size_bytes?: number;
  on_unsubscribe?: () => Promise<"success" | "manual">;
  on_manual_unsubscribed?: () => void;
  unsubscribe_url?: string;
  loaded_content_types?: Set<string>;
  on_load_external_content?: (types?: string[]) => void;
  thread_token?: string;
}

export interface ThreadMessagesListRef {
  expand_all: () => void;
  collapse_all: () => void;
  mark_all_read: () => void;
  all_expanded: boolean;
  all_collapsed: boolean;
  has_unread: boolean;
  toggle_all_dark_mode: () => void;
  all_dark_mode: boolean;
}

export const ThreadMessagesList = forwardRef<
  ThreadMessagesListRef,
  ThreadMessagesListProps
>(function ThreadMessagesList(
  {
    messages,
    current_user_email,
    default_expanded_id: _default_expanded_id,
    subject: _subject,
    on_toggle_message_read,
    on_mark_all_read,
    on_reply,
    on_reply_all,
    on_forward,
    on_archive,
    on_trash,
    on_print,
    on_view_source,
    on_report_phishing,
    on_not_spam,
    hide_counter = false,
    hide_expand_collapse: _hide_expand_collapse = false,
    thread_message_count,
    external_content_mode,
    on_external_content_detected,
    force_all_dark_mode = false,
    inline_reply_msg,
    inline_reply_thread_token,
    inline_reply_is_external,
    on_close_inline_reply,
    inline_mode,
    on_set_inline_mode,
    on_draft_saved,
    existing_draft,
    preloaded_sanitized,
    size_bytes,
    on_unsubscribe,
    on_manual_unsubscribed,
    unsubscribe_url,
    loaded_content_types,
    on_load_external_content,
    thread_token,
  },
  ref,
): React.ReactElement {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const regular_messages = useMemo(
    () => messages.filter((m) => !m.reaction_data),
    [messages],
  );

  const display_messages = useMemo(
    () =>
      preferences.conversation_order === "desc"
        ? [...regular_messages].reverse()
        : regular_messages,
    [regular_messages, preferences.conversation_order],
  );

  const [optimistic_reactions, set_optimistic_reactions] = useState<
    Map<string, { emoji: string; sender_email: string; type: "reaction" | "reaction_remove" }[]>
  >(new Map());

  const reactions_by_message_id = useMemo<Map<string, aggregated_reaction[]>>(() => {
    const map = new Map<string, aggregated_reaction[]>();

    const all_reaction_msgs = messages.filter((m) => m.reaction_data);
    for (const msg of all_reaction_msgs) {
      const rd = msg.reaction_data!;
      if (!map.has(rd.target_message_id)) map.set(rd.target_message_id, []);
      const bucket = map.get(rd.target_message_id)!;
      if (rd.type === "reaction_remove") {
        const idx = bucket.findIndex(
          (r) => r.emoji === rd.emoji && r.sender_emails.includes(rd.sender_email),
        );
        if (idx !== -1) {
          const updated = { ...bucket[idx] };
          updated.sender_emails = updated.sender_emails.filter((e) => e !== rd.sender_email);
          updated.count = updated.sender_emails.length;
          if (updated.count === 0) {
            bucket.splice(idx, 1);
          } else {
            bucket[idx] = updated;
          }
        }
      } else {
        const existing = bucket.find((r) => r.emoji === rd.emoji);
        if (existing) {
          if (!existing.sender_emails.includes(rd.sender_email)) {
            existing.sender_emails.push(rd.sender_email);
            existing.count++;
            existing.reacted_by_me =
              existing.reacted_by_me ||
              rd.sender_email.toLowerCase() === current_user_email.toLowerCase();
          }
        } else {
          bucket.push({
            emoji: rd.emoji,
            count: 1,
            reacted_by_me: rd.sender_email.toLowerCase() === current_user_email.toLowerCase(),
            sender_emails: [rd.sender_email],
          });
        }
      }
    }

    for (const [msg_id, pending] of optimistic_reactions) {
      for (const p of pending) {
        if (!map.has(msg_id)) map.set(msg_id, []);
        const bucket = map.get(msg_id)!;
        if (p.type === "reaction_remove") {
          const idx = bucket.findIndex(
            (r) => r.emoji === p.emoji && r.sender_emails.includes(p.sender_email),
          );
          if (idx !== -1) {
            const updated = { ...bucket[idx] };
            updated.sender_emails = updated.sender_emails.filter((e) => e !== p.sender_email);
            updated.count = updated.sender_emails.length;
            if (updated.count === 0) bucket.splice(idx, 1);
            else bucket[idx] = updated;
          }
        } else {
          const existing = bucket.find((r) => r.emoji === p.emoji);
          if (existing) {
            if (!existing.sender_emails.includes(p.sender_email)) {
              existing.sender_emails.push(p.sender_email);
              existing.count++;
              existing.reacted_by_me =
                existing.reacted_by_me ||
                p.sender_email.toLowerCase() === current_user_email.toLowerCase();
            }
          } else {
            bucket.push({
              emoji: p.emoji,
              count: 1,
              reacted_by_me: p.sender_email.toLowerCase() === current_user_email.toLowerCase(),
              sender_emails: [p.sender_email],
            });
          }
        }
      }
    }

    return map;
  }, [messages, optimistic_reactions, current_user_email]);

  const [dark_mode_ids, set_dark_mode_ids] = useState<Set<string>>(new Set());
  const [hidden_group_revealed, set_hidden_group_revealed] = useState(false);
  const [expanded_ids, set_expanded_ids] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    const init_msgs = messages.filter((m) => !m.reaction_data);

    if (init_msgs.length > 0) {
      initial.add(init_msgs[init_msgs.length - 1].id);
    }

    if (init_msgs.length <= 4) {
      const unread = init_msgs.filter((m) => !m.is_read);

      unread.slice(-5).forEach((msg) => {
        initial.add(msg.id);
      });
    }

    return initial;
  });

  const [starred_ids, set_starred_ids] = useState<Set<string>>(() => {
    const initial = new Set<string>();

    messages.forEach((msg) => {
      if (msg.is_starred) {
        initial.add(msg.id);
      }
    });

    return initial;
  });

  const [read_ids, set_read_ids] = useState<Set<string>>(() => {
    const initial = new Set<string>();

    messages.forEach((msg) => {
      if (msg.is_read) {
        initial.add(msg.id);
      }
    });

    return initial;
  });

  const read_ids_ref = useRef<Set<string>>(read_ids);
  const auto_read_ids = useRef<Set<string>>(new Set());
  const pending_read_updates = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());

  useEffect(() => {
    read_ids_ref.current = read_ids;
  }, [read_ids]);

  useEffect(() => {
    return () => {
      pending_read_updates.current.forEach((timeout) => clearTimeout(timeout));
      pending_read_updates.current.clear();
    };
  }, []);

  useEffect(() => {
    const new_starred = new Set<string>();

    messages.forEach((msg) => {
      if (msg.is_starred) {
        new_starred.add(msg.id);
      }
    });
    set_starred_ids(new_starred);
  }, [messages]);

  useEffect(() => {
    const new_read = new Set<string>();

    messages.forEach((msg) => {
      if (msg.is_read) {
        new_read.add(msg.id);
      }
    });
    set_read_ids(new_read);
  }, [messages]);

  const message_ids_key = useMemo(
    () => regular_messages.map((m) => m.id).join(","),
    [regular_messages],
  );

  const prev_message_ids_key = useRef(message_ids_key);

  useEffect(() => {
    if (prev_message_ids_key.current === message_ids_key) return;
    prev_message_ids_key.current = message_ids_key;

    const new_expanded = new Set<string>();

    if (regular_messages.length > 0) {
      new_expanded.add(regular_messages[regular_messages.length - 1].id);
    }

    if (regular_messages.length <= 4) {
      const unread = regular_messages.filter((m) => !m.is_read);

      unread.slice(-5).forEach((msg) => {
        new_expanded.add(msg.id);
      });
    }

    set_expanded_ids(new_expanded);
    auto_read_ids.current = new Set();
    set_hidden_group_revealed(false);
  }, [message_ids_key, regular_messages]);

  const mark_as_read = useCallback(
    (msg: DecryptedThreadMessage) => {
      if (read_ids.has(msg.id) || msg.reaction_data) return;

      set_read_ids((prev) => {
        const next = new Set(prev);

        next.add(msg.id);

        return next;
      });

      update_item_metadata(
        msg.id,
        {
          encrypted_metadata: msg.encrypted_metadata,
          metadata_nonce: msg.metadata_nonce,
        },
        { is_read: true },
      ).then((result) => {
        if (!result.success) {
          set_read_ids((prev) => {
            const next = new Set(prev);

            next.delete(msg.id);

            return next;
          });
        } else {
          emit_mail_item_updated({
            id: msg.id,
            is_read: true,
            encrypted_metadata: result.encrypted?.encrypted_metadata,
            metadata_nonce: result.encrypted?.metadata_nonce,
          });
        }
      });
    },
    [read_ids, starred_ids],
  );

  useEffect(() => {
    regular_messages.forEach((msg) => {
      const is_unread = !msg.is_read && !read_ids.has(msg.id);

      if (
        expanded_ids.has(msg.id) &&
        is_unread &&
        !auto_read_ids.current.has(msg.id)
      ) {
        auto_read_ids.current.add(msg.id);
        mark_as_read(msg);
      }
    });
  }, [expanded_ids, message_ids_key]);

  const toggle_dark_mode = useCallback((msg_id: string) => {
    set_dark_mode_ids((prev) => {
      const next = new Set(prev);

      if (next.has(msg_id)) {
        next.delete(msg_id);
      } else {
        next.add(msg_id);
      }

      return next;
    });
  }, []);

  const toggle = useCallback(
    (msg: DecryptedThreadMessage) => {
      const is_last = regular_messages.length > 0 && msg.id === regular_messages[regular_messages.length - 1].id;

      if (is_last && expanded_ids.has(msg.id)) return;

      const is_expanding = !expanded_ids.has(msg.id);

      set_expanded_ids((prev) => {
        const next = new Set(prev);

        if (next.has(msg.id)) {
          next.delete(msg.id);
          auto_read_ids.current.delete(msg.id);
        } else {
          next.add(msg.id);
        }

        return next;
      });

      if (is_expanding && !read_ids.has(msg.id)) {
        auto_read_ids.current.add(msg.id);
        mark_as_read(msg);
      }
    },
    [expanded_ids, read_ids, mark_as_read, regular_messages],
  );

  const toggle_star = useCallback(
    (msg: DecryptedThreadMessage) => {
      const new_starred = !starred_ids.has(msg.id);

      set_starred_ids((prev) => {
        const next = new Set(prev);

        if (new_starred) {
          next.add(msg.id);
        } else {
          next.delete(msg.id);
        }

        return next;
      });

      adjust_starred_count(new_starred ? 1 : -1);

      update_item_metadata(
        msg.id,
        {
          encrypted_metadata: msg.encrypted_metadata,
          metadata_nonce: msg.metadata_nonce,
        },
        { is_starred: new_starred },
      ).then((result) => {
        if (!result.success) {
          set_starred_ids((prev) => {
            const next = new Set(prev);

            if (new_starred) {
              next.delete(msg.id);
            } else {
              next.add(msg.id);
            }

            return next;
          });
          adjust_starred_count(new_starred ? -1 : 1);
        } else {
          emit_mail_item_updated({
            id: msg.id,
            is_starred: new_starred,
            encrypted_metadata: result.encrypted?.encrypted_metadata,
            metadata_nonce: result.encrypted?.metadata_nonce,
          });
        }
      });
    },
    [starred_ids, read_ids],
  );

  const toggle_read = useCallback(
    (msg: DecryptedThreadMessage) => {
      const is_currently_read = read_ids_ref.current.has(msg.id);
      const new_read = !is_currently_read;

      if (!new_read) {
        auto_read_ids.current.add(msg.id);
      } else {
        auto_read_ids.current.delete(msg.id);
      }

      set_read_ids((prev) => {
        const next = new Set(prev);

        if (new_read) {
          next.add(msg.id);
        } else {
          next.delete(msg.id);
        }

        return next;
      });

      const existing_timeout = pending_read_updates.current.get(msg.id);

      if (existing_timeout) {
        clearTimeout(existing_timeout);
      }

      const timeout = setTimeout(() => {
        pending_read_updates.current.delete(msg.id);

        const final_read_state = read_ids_ref.current.has(msg.id);

        update_item_metadata(
          msg.id,
          {
            encrypted_metadata: msg.encrypted_metadata,
            metadata_nonce: msg.metadata_nonce,
          },
          { is_read: final_read_state },
        ).then((result) => {
          if (!result.success) {
            set_read_ids((prev) => {
              const next = new Set(prev);

              if (final_read_state) {
                next.delete(msg.id);
              } else {
                next.add(msg.id);
              }

              return next;
            });
          } else {
            emit_mail_item_updated({
              id: msg.id,
              is_read: final_read_state,
              encrypted_metadata: result.encrypted?.encrypted_metadata,
              metadata_nonce: result.encrypted?.metadata_nonce,
            });
          }
        });
      }, 300);

      pending_read_updates.current.set(msg.id, timeout);

      on_toggle_message_read?.(msg.id);
    },
    [starred_ids, on_toggle_message_read],
  );

  const expand_all = useCallback(() => {
    set_expanded_ids(new Set(regular_messages.map((m) => m.id)));
  }, [regular_messages]);

  const collapse_all = useCallback(() => {
    if (regular_messages.length > 0) {
      set_expanded_ids(new Set([regular_messages[regular_messages.length - 1].id]));
    } else {
      set_expanded_ids(new Set());
    }
  }, [regular_messages]);

  const first_unread_ref = useRef<HTMLDivElement>(null);

  const scroll_target_id = useMemo(() => {
    const unread = regular_messages.find((m) => !m.is_read && !read_ids.has(m.id));

    if (unread) return unread.id;

    const last = regular_messages[regular_messages.length - 1];

    return last?.id ?? null;
  }, [regular_messages, read_ids]);

  const has_scrolled = useRef(false);

  useEffect(() => {
    if (has_scrolled.current) return;
    if (!first_unread_ref.current) return;

    has_scrolled.current = true;

    requestAnimationFrame(() => {
      const el = first_unread_ref.current;

      if (!el) return;

      let container = el.parentElement;

      while (container) {
        const style = getComputedStyle(container);

        if (
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          container.scrollHeight > container.clientHeight
        ) {
          break;
        }
        container = container.parentElement;
      }

      if (container) {
        const el_top = el.getBoundingClientRect().top;
        const container_top = container.getBoundingClientRect().top;

        container.scrollTo({
          top: container.scrollTop + (el_top - container_top),
          behavior: "smooth",
        });
      }
    });
  }, [scroll_target_id]);

  const send_anchor_ref = useRef<HTMLDivElement>(null);
  const last_sending_id = useMemo(() => {
    const last = regular_messages[regular_messages.length - 1];
    return last?.is_sending ? last.id : null;
  }, [regular_messages]);

  useEffect(() => {
    if (!last_sending_id) return;

    requestAnimationFrame(() => {
      const el = send_anchor_ref.current;
      if (!el) return;

      let container: HTMLElement | null = el.parentElement;

      while (container) {
        const style = getComputedStyle(container);

        if (
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          container.scrollHeight > container.clientHeight
        ) {
          break;
        }
        container = container.parentElement;
      }

      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }, [last_sending_id]);

  const handle_mark_all_read = useCallback(() => {
    const unread_messages = regular_messages.filter(
      (m) => !m.is_read && !read_ids.has(m.id),
    );

    if (unread_messages.length === 0) return;

    unread_messages.forEach((msg) => {
      mark_as_read(msg);
    });

    on_mark_all_read?.();
  }, [regular_messages, read_ids, mark_as_read, on_mark_all_read]);

  const unread_count = useMemo(() => {
    return regular_messages.filter((m) => !m.is_read && !read_ids.has(m.id)).length;
  }, [regular_messages, read_ids]);

  const all_expanded = useMemo(() => {
    return regular_messages.every((m) => expanded_ids.has(m.id));
  }, [regular_messages, expanded_ids]);

  const all_collapsed = useMemo(() => {
    return regular_messages.every((m) => !expanded_ids.has(m.id));
  }, [regular_messages, expanded_ids]);

  const all_dark_mode = useMemo(() => {
    return (
      regular_messages.length > 0 && regular_messages.every((m) => dark_mode_ids.has(m.id))
    );
  }, [regular_messages, dark_mode_ids]);

  const toggle_all_dark_mode = useCallback(() => {
    if (all_dark_mode) {
      set_dark_mode_ids(new Set());
    } else {
      set_dark_mode_ids(new Set(regular_messages.map((m) => m.id)));
    }
  }, [all_dark_mode, regular_messages]);

  const handle_react = useCallback(
    async (target_msg: DecryptedThreadMessage, emoji: string) => {
      if (!thread_token || !current_user_email) return;
      const recipient_emails = (() => {
        if (target_msg.item_type === "received") {
          return [target_msg.sender_email].filter(
            (e) => e && e.toLowerCase() !== current_user_email.toLowerCase(),
          );
        }
        return [
          ...(target_msg.to_recipients?.map((r) => r.email) ?? []),
          ...(target_msg.cc_recipients?.map((r) => r.email) ?? []),
        ].filter((e) => e && e.toLowerCase() !== current_user_email.toLowerCase());
      })();

      if (recipient_emails.length === 0) return;

      set_optimistic_reactions((prev) => {
        const next = new Map(prev);
        const existing = next.get(target_msg.id) ?? [];
        next.set(target_msg.id, [
          ...existing,
          { emoji, sender_email: current_user_email, type: "reaction" as const },
        ]);
        return next;
      });

      try {
        await send_reaction({
          thread_token,
          target_message_id: target_msg.id,
          emoji,
          recipient_emails,
          sender_email: current_user_email,
        });
      } catch {
        show_toast(t("mail.reaction_failed"), "error");
      }
    },
    [thread_token, current_user_email],
  );

  const handle_react_remove = useCallback(
    async (target_msg: DecryptedThreadMessage, emoji: string) => {
      if (!thread_token || !current_user_email) return;
      const recipient_emails = (() => {
        if (target_msg.item_type === "received") {
          return [target_msg.sender_email].filter(
            (e) => e && e.toLowerCase() !== current_user_email.toLowerCase(),
          );
        }
        return [
          ...(target_msg.to_recipients?.map((r) => r.email) ?? []),
          ...(target_msg.cc_recipients?.map((r) => r.email) ?? []),
        ].filter((e) => e && e.toLowerCase() !== current_user_email.toLowerCase());
      })();

      if (recipient_emails.length === 0) return;

      set_optimistic_reactions((prev) => {
        const next = new Map(prev);
        const existing = next.get(target_msg.id) ?? [];
        next.set(target_msg.id, [
          ...existing,
          { emoji, sender_email: current_user_email, type: "reaction_remove" as const },
        ]);
        return next;
      });

      try {
        await send_reaction_remove({
          thread_token,
          target_message_id: target_msg.id,
          emoji,
          recipient_emails,
          sender_email: current_user_email,
        });
      } catch {
        show_toast(t("mail.reaction_failed"), "error");
      }
    },
    [thread_token, current_user_email],
  );

  useImperativeHandle(
    ref,
    () => ({
      expand_all,
      collapse_all,
      mark_all_read: handle_mark_all_read,
      toggle_all_dark_mode,
      get all_expanded() {
        return all_expanded;
      },
      get all_collapsed() {
        return all_collapsed;
      },
      get has_unread() {
        return unread_count > 0;
      },
      get all_dark_mode() {
        return all_dark_mode;
      },
    }),
    [
      expand_all,
      collapse_all,
      handle_mark_all_read,
      toggle_all_dark_mode,
      all_expanded,
      all_collapsed,
      unread_count,
      all_dark_mode,
    ],
  );

  const visible_tail_count = 2;

  const hidden_count = useMemo(() => {
    if (hidden_group_revealed || display_messages.length <= visible_tail_count + 2) {
      return 0;
    }

    return display_messages.length - 1 - visible_tail_count;
  }, [display_messages.length, hidden_group_revealed]);

  const hidden_ids = useMemo(() => {
    if (hidden_count === 0) return null;

    const ids = new Set<string>();

    for (let i = 1; i <= hidden_count; i++) {
      ids.add(display_messages[i].id);
    }

    return ids;
  }, [display_messages, hidden_count]);

  const render_message = (
    msg: DecryptedThreadMessage,
    display_idx: number,
    extra_props?: { hide_bottom_border?: boolean },
  ) => {
    const is_last = msg.id === regular_messages[regular_messages.length - 1]?.id;

    return (
    <div
      key={msg.id}
      ref={msg.id === scroll_target_id ? first_unread_ref : undefined}
    >
      <ThreadMessageBlock
        external_content_mode={external_content_mode}
        loaded_content_types={loaded_content_types}
        hide_bottom_border={extra_props?.hide_bottom_border}
        on_load_external_content={on_load_external_content}
        on_unsubscribe={is_last ? on_unsubscribe : undefined}
        on_manual_unsubscribed={is_last ? on_manual_unsubscribed : undefined}
        unsubscribe_url={is_last ? unsubscribe_url : undefined}
        force_dark_mode={force_all_dark_mode || dark_mode_ids.has(msg.id)}
        inline_mode={inline_mode}
        inline_reply_is_external={inline_reply_is_external}
        inline_reply_thread_token={inline_reply_thread_token}
        is_expanded={expanded_ids.has(msg.id)}
        is_single_message={regular_messages.length === 1}
        is_last_in_thread={
          regular_messages.length > 1 && msg.id === regular_messages[regular_messages.length - 1].id
        }
        is_own_message={
          msg.sender_email.toLowerCase() === current_user_email.toLowerCase()
        }
        is_read={read_ids.has(msg.id)}
        is_reply={
          preferences.conversation_order === "desc"
            ? display_idx < display_messages.length - 1
            : display_idx > 0
        }
        is_starred={starred_ids.has(msg.id)}
        message={msg}
        on_archive={on_archive}
        on_close_inline_reply={on_close_inline_reply}
        on_external_content_detected={on_external_content_detected}
        on_forward={on_forward}
        on_not_spam={on_not_spam}
        on_print={on_print}
        on_reply={on_reply}
        on_reply_all={on_reply_all}
        on_report_phishing={on_report_phishing}
        on_set_inline_mode={on_set_inline_mode}
        on_star_toggle={() => toggle_star(msg)}
        on_toggle={() => toggle(msg)}
        on_toggle_dark_mode={() => toggle_dark_mode(msg.id)}
        on_toggle_read={() => toggle_read(msg)}
        on_trash={on_trash}
        on_draft_saved={on_draft_saved}
        on_view_source={on_view_source}
        existing_draft={existing_draft}
        preloaded_sanitized={preloaded_sanitized?.get(msg.id)}
        show_inline_reply={inline_reply_msg?.id === msg.id}
        size_bytes={size_bytes}
        reactions={reactions_by_message_id.get(msg.id)}
        on_react={(emoji) => void handle_react(msg, emoji)}
        on_react_remove={(emoji) => void handle_react_remove(msg, emoji)}
      />
    </div>
    );
  };

  return (
    <div className={`flex flex-col ${regular_messages.length > 1 ? "gap-0" : "gap-2"}`}>
      {(thread_message_count ?? regular_messages.length) > 1 && !hide_counter && (
        <div className="flex items-center justify-end px-1">
          <span className="text-[11px] text-txt-muted">
            {thread_message_count ?? regular_messages.length} {t("mail.messages_label")}
          </span>
        </div>
      )}
      {display_messages.map((msg, idx) => {
        if (hidden_ids?.has(msg.id)) {
          if (idx === 1) {
            return (
              <div key="hidden-group" className="group/collapse relative h-[36px] -mt-px">
                <div className="absolute left-0 right-0 top-1/2 border-t border-[var(--border-thread-divider)]" />
                <button
                  className="absolute left-0 right-0 top-0 h-full flex items-center px-[18px] cursor-pointer select-none z-10 hover:bg-surf-hover/10 transition-colors"
                  onClick={() => set_hidden_group_revealed(true)}
                >
                  <span className="flex items-center justify-center w-[40px] h-[40px] rounded-full border border-[var(--border-thread-divider)] bg-[var(--bg-primary)] text-[15px] font-semibold text-txt-muted transition-colors">
                    <span className="group-hover/collapse:hidden">{hidden_count}</span>
                    <ChevronUpDownIcon className="w-5 h-5 hidden group-hover/collapse:block text-txt-muted" />
                  </span>
                </button>
              </div>
            );
          }

          return null;
        }

        return render_message(msg, idx, {
          hide_bottom_border: idx === 0 && !!hidden_ids,
        });
      })}
      <div ref={send_anchor_ref} />
    </div>
  );
});
