import type { DecryptedThreadMessage } from "@/types/thread";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  ChevronDownIcon,
  StarIcon,
  EyeIcon,
  EyeSlashIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";

import { EncryptionInfoModal } from "@/components/encryption_info_modal";
import { EmailProfileTrigger } from "@/components/email_profile_trigger";
import {
  sanitize_html,
  is_html_content,
  plain_text_to_html,
} from "@/lib/html_sanitizer";
import { use_preferences } from "@/contexts/preferences_context";
import { use_date_format } from "@/hooks/use_date_format";
import { update_item_metadata } from "@/services/crypto/mail_metadata";
import { emit_mail_item_updated } from "@/hooks/mail_events";
import { show_toast } from "@/components/simple_toast";

interface ThreadMessageBlockProps {
  message: DecryptedThreadMessage;
  is_own_message: boolean;
  is_expanded: boolean;
  on_toggle: () => void;
  is_starred?: boolean;
  is_read?: boolean;
  on_star_toggle?: () => void;
  on_toggle_read?: () => void;
}

function strip_quotes(body: string): string {
  return (
    body
      .replace(/On .+wrote:[\s\S]*/gi, "")
      .replace(/^>.*$/gm, "")
      .replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, "")
      .trim() || body
  );
}

export function ThreadMessageBlock({
  message,
  is_own_message,
  is_expanded,
  on_toggle,
  is_starred = false,
  is_read = true,
  on_star_toggle,
  on_toggle_read,
}: ThreadMessageBlockProps): React.ReactElement {
  const { preferences } = use_preferences();
  const { format_email_detail } = use_date_format();
  const [show_encryption_info, set_show_encryption_info] = useState(false);
  const clean_body = useMemo(() => strip_quotes(message.body), [message.body]);

  const name = is_own_message ? "Me" : message.sender_name;

  if (message.is_deleted) {
    return (
      <div
        className="thread-card-collapsed rounded-xl px-5 py-3.5 text-sm italic"
        style={{ color: "var(--text-muted)" }}
      >
        This message was deleted
      </div>
    );
  }

  if (!is_expanded) {
    return (
      <div
        className="thread-card-collapsed flex cursor-pointer items-center justify-between rounded-xl px-3 py-3 transition-colors"
        role="button"
        tabIndex={0}
        onClick={on_toggle}
        onKeyDown={(e) => e.key === "Enter" && on_toggle()}
      >
        <div className="flex items-center gap-1.5">
          <div
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{
              backgroundColor: is_read ? "transparent" : "var(--accent-color)",
            }}
          />
          <span
            className={`text-sm ${is_read ? "font-normal" : "font-semibold"}`}
            style={{
              color: is_read ? "var(--text-muted)" : "var(--text-primary)",
            }}
          >
            {name}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            ({message.sender_email})
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {on_toggle_read && (
            <button
              className="-m-1 rounded-md p-1.5 transition-colors hover:bg-[var(--bg-hover)]"
              onClick={(e) => {
                e.stopPropagation();
                on_toggle_read();
              }}
            >
              {is_read ? (
                <EyeSlashIcon className="h-4 w-4 text-[var(--text-muted)]" />
              ) : (
                <EyeIcon className="h-4 w-4 text-[var(--text-muted)]" />
              )}
            </button>
          )}
          <button
            className="-m-1 rounded-md p-1.5 transition-colors hover:bg-[var(--bg-hover)]"
            onClick={(e) => {
              e.stopPropagation();
              on_star_toggle?.();
            }}
          >
            {is_starred ? (
              <StarIconSolid className="h-4 w-4 text-amber-400" />
            ) : (
              <StarIcon className="h-4 w-4 text-[var(--text-muted)]" />
            )}
          </button>
          <span className="ml-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {format_email_detail(new Date(message.timestamp))}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        backgroundColor: "var(--thread-card-bg)",
        border: "1px solid var(--thread-card-border)",
      }}
    >
      <div
        className="flex cursor-pointer items-center justify-between px-3 py-3"
        role="button"
        tabIndex={0}
        onClick={on_toggle}
        onKeyDown={(e) => e.key === "Enter" && on_toggle()}
      >
        <div className="flex items-center gap-1.5">
          <div
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{
              backgroundColor: is_read ? "transparent" : "var(--accent-color)",
            }}
          />
          <span
            className={`text-sm ${is_read ? "font-normal" : "font-semibold"}`}
            style={{
              color: is_read ? "var(--text-muted)" : "var(--text-primary)",
            }}
          >
            {name}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            ({message.sender_email})
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {on_toggle_read && (
            <button
              className="-m-1 rounded-md p-1.5 transition-colors hover:bg-[var(--bg-hover)]"
              onClick={(e) => {
                e.stopPropagation();
                on_toggle_read();
              }}
            >
              {is_read ? (
                <EyeSlashIcon className="h-4 w-4 text-[var(--text-muted)]" />
              ) : (
                <EyeIcon className="h-4 w-4 text-[var(--text-muted)]" />
              )}
            </button>
          )}
          <button
            className="-m-1 rounded-md p-1.5 transition-colors hover:bg-[var(--bg-hover)]"
            onClick={(e) => {
              e.stopPropagation();
              on_star_toggle?.();
            }}
          >
            {is_starred ? (
              <StarIconSolid className="h-4 w-4 text-amber-400" />
            ) : (
              <StarIcon className="h-4 w-4 text-[var(--text-muted)]" />
            )}
          </button>
          <ChevronDownIcon
            className="ml-1 h-4 w-4"
            style={{ color: "var(--text-muted)" }}
          />
        </div>
      </div>

      <div
        className="flex items-start justify-between px-4 py-3"
        style={{
          backgroundColor: "var(--thread-header-bg)",
        }}
      >
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--text-muted)" }}>From</span>
            <div className="flex items-center gap-1.5">
              <button
                className="hover:text-blue-500 transition-colors"
                style={{ color: "var(--text-muted)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  set_show_encryption_info(true);
                }}
              >
                <LockClosedIcon className="h-3.5 w-3.5" />
              </button>
              <EmailProfileTrigger
                email={message.sender_email}
                name={message.sender_name}
              >
                <span style={{ color: "var(--text-primary)" }}>
                  {message.sender_name}
                </span>
              </EmailProfileTrigger>
              <button
                className="cursor-pointer"
                style={{ color: "var(--accent-blue)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(message.sender_email);
                  show_toast("Email copied to clipboard", "success");
                }}
              >
                &lt;{message.sender_email}&gt;
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: "var(--text-muted)" }}>To</span>
            {is_own_message ? (
              <button
                className="cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(message.sender_email);
                  show_toast("Email copied to clipboard", "success");
                }}
              >
                {message.sender_email}
              </button>
            ) : (
              <span style={{ color: "var(--text-secondary)" }}>me</span>
            )}
          </div>
        </div>

        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          {format_email_detail(new Date(message.timestamp))}
        </span>
      </div>

      <div
        className="px-4 pt-4 pb-2"
        style={{ backgroundColor: "var(--thread-content-bg)" }}
      >
        <div
          dangerouslySetInnerHTML={{
            __html: is_html_content(clean_body)
              ? sanitize_html(clean_body, {
                  image_mode: preferences.load_remote_images,
                })
              : plain_text_to_html(clean_body),
          }}
          className="email-body-content prose prose-sm max-w-none [&>*:last-child]:!mb-0 [&>p]:my-2"
        />
      </div>
      <EncryptionInfoModal
        has_pq_protection={false}
        is_external={false}
        is_open={show_encryption_info}
        on_close={() => set_show_encryption_info(false)}
      />
    </div>
  );
}

interface ThreadMessagesListProps {
  messages: DecryptedThreadMessage[];
  current_user_email: string;
  default_expanded_id?: string | null;
  subject: string;
  on_toggle_message_read?: (message_id: string) => void;
  hide_counter?: boolean;
}

export function ThreadMessagesList({
  messages,
  current_user_email,
  default_expanded_id,
  subject: _subject,
  on_toggle_message_read,
  hide_counter = false,
}: ThreadMessagesListProps): React.ReactElement {
  const [expanded_ids, set_expanded_ids] = useState<Set<string>>(() => {
    const initial = new Set<string>();

    if (default_expanded_id) {
      initial.add(default_expanded_id);
    }

    if (messages.length > 0) {
      initial.add(messages[messages.length - 1].id);
    }

    messages.forEach((msg) => {
      if (!msg.is_read) {
        initial.add(msg.id);
      }
    });

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

  useEffect(() => {
    read_ids_ref.current = read_ids;
  }, [read_ids]);

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
    () => messages.map((m) => m.id).join(","),
    [messages],
  );

  useEffect(() => {
    const new_expanded = new Set<string>();

    if (default_expanded_id) {
      new_expanded.add(default_expanded_id);
    }

    if (messages.length > 0) {
      new_expanded.add(messages[messages.length - 1].id);
    }

    messages.forEach((msg) => {
      if (!msg.is_read) {
        new_expanded.add(msg.id);
      }
    });

    set_expanded_ids(new_expanded);
  }, [message_ids_key, default_expanded_id, messages]);

  useEffect(() => {
    auto_read_ids.current = new Set();
  }, [message_ids_key]);

  const mark_as_read = useCallback(
    (msg: DecryptedThreadMessage) => {
      if (read_ids.has(msg.id)) return;

      set_read_ids((prev) => {
        const next = new Set(prev);

        next.add(msg.id);

        return next;
      });

      emit_mail_item_updated({ id: msg.id, is_read: true });

      update_item_metadata(
        msg.id,
        {
          encrypted_metadata: msg.encrypted_metadata,
          metadata_nonce: msg.metadata_nonce,
          is_read: false,
          is_starred: starred_ids.has(msg.id),
        },
        { is_read: true },
      ).then((result) => {
        if (!result.success) {
          set_read_ids((prev) => {
            const next = new Set(prev);

            next.delete(msg.id);

            return next;
          });
          emit_mail_item_updated({ id: msg.id, is_read: false });
        } else {
          window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
        }
      });
    },
    [read_ids, starred_ids],
  );

  useEffect(() => {
    messages.forEach((msg) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded_ids, message_ids_key]);

  const toggle = useCallback(
    (msg: DecryptedThreadMessage) => {
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
    [expanded_ids, read_ids, mark_as_read],
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

      emit_mail_item_updated({ id: msg.id, is_starred: new_starred });

      update_item_metadata(
        msg.id,
        {
          encrypted_metadata: msg.encrypted_metadata,
          metadata_nonce: msg.metadata_nonce,
          is_read: read_ids.has(msg.id),
          is_starred: starred_ids.has(msg.id),
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
          emit_mail_item_updated({ id: msg.id, is_starred: !new_starred });
        } else {
          window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
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

      emit_mail_item_updated({ id: msg.id, is_read: new_read });

      update_item_metadata(
        msg.id,
        {
          encrypted_metadata: msg.encrypted_metadata,
          metadata_nonce: msg.metadata_nonce,
          is_read: is_currently_read,
          is_starred: starred_ids.has(msg.id),
        },
        { is_read: new_read },
      ).then((result) => {
        if (!result.success) {
          if (!new_read) {
            auto_read_ids.current.delete(msg.id);
          }
          set_read_ids((prev) => {
            const next = new Set(prev);

            if (new_read) {
              next.delete(msg.id);
            } else {
              next.add(msg.id);
            }

            return next;
          });
          emit_mail_item_updated({ id: msg.id, is_read: !new_read });
        } else {
          window.dispatchEvent(new CustomEvent("astermail:mail-changed"));
        }
      });

      on_toggle_message_read?.(msg.id);
    },
    [starred_ids, on_toggle_message_read],
  );

  return (
    <div className="flex flex-col gap-2">
      {!hide_counter && (
        <div className="flex items-center justify-end gap-2 px-1">
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {messages.length} {messages.length === 1 ? "message" : "messages"}
          </span>
        </div>
      )}
      {messages.map((msg) => (
        <ThreadMessageBlock
          key={msg.id}
          is_expanded={expanded_ids.has(msg.id)}
          is_own_message={
            msg.sender_email.toLowerCase() === current_user_email.toLowerCase()
          }
          is_read={read_ids.has(msg.id)}
          is_starred={starred_ids.has(msg.id)}
          message={msg}
          on_star_toggle={() => toggle_star(msg)}
          on_toggle={() => toggle(msg)}
          on_toggle_read={() => toggle_read(msg)}
        />
      ))}
    </div>
  );
}
