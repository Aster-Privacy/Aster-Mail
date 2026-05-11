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
import type { DecryptedContact } from "@/types/contacts";
import type { DecryptedRecentRecipient } from "@/types/recent_recipients";
import type { UseComposeReturn } from "@/components/compose/use_compose";

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  memo,
} from "react";

import { is_icon_failed, mark_icon_failed } from "@/lib/icon_cache";
import { get_favicon_url } from "@/lib/favicon_url";
import { CloseIcon, LockIcon } from "@/components/common/icons";
import { EmailAutocomplete } from "@/components/common/email_autocomplete";
import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { get_email_username } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  is_internal_email,
  discover_external_keys_batch,
  has_pgp_key,
} from "@/services/api/keys";
import {
  get_domain_from_email,
  is_valid_email,
} from "@/components/compose/compose_shared";

export const DdgFavicon = memo(function DdgFavicon({
  email,
  size = 16,
}: {
  email: string;
  size?: number;
}) {
  const domain = get_domain_from_email(email);
  const [error, set_error] = useState(() => is_icon_failed(domain));
  const [prev_email, set_prev_email] = useState(email);
  const url = domain && !is_icon_failed(domain) ? get_favicon_url(domain) : "";

  if (email !== prev_email) {
    set_prev_email(email);
    set_error(is_icon_failed(get_domain_from_email(email)));
  }

  if (!url || error) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full flex-shrink-0"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.55,
          fontWeight: 500,
          backgroundColor: "var(--bg-tertiary)",
          color: "var(--text-muted)",
        }}
      >
        {(domain || email).charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center justify-center rounded-full flex-shrink-0 overflow-hidden bg-surf-tertiary"
      style={{
        width: size,
        height: size,
      }}
    >
      <img
        alt=""
        className="object-cover"
        src={url}
        style={{ width: size, height: size }}
        onError={() => {
          if (domain) mark_icon_failed(domain);
          set_error(true);
        }}
      />
    </span>
  );
});

type EncryptionStatus = "encrypted" | "transit" | "checking";

interface RecipientBadgeProps {
  email: string;
  image_url?: string;
  on_remove?: () => void;
  encryption_status?: EncryptionStatus;
}

export function RecipientBadge({
  email,
  image_url,
  on_remove,
  encryption_status,
}: RecipientBadgeProps) {
  const { t } = use_i18n();

  return (
    <div className="flex items-center gap-1.5 bg-default-100 rounded-full px-2 py-1 border border-edge-secondary">
      {encryption_status && (
        <span
          className="flex-shrink-0 flex items-center"
          style={{
            color:
              encryption_status === "encrypted"
                ? "rgb(59, 130, 246)"
                : "var(--text-muted)",
            opacity: encryption_status === "checking" ? 0.4 : 1,
          }}
          title={
            encryption_status === "encrypted"
              ? t("common.end_to_end_encrypted_label")
              : encryption_status === "transit"
                ? t("common.protected_in_transit")
                : undefined
          }
        >
          <LockIcon size={12} />
        </span>
      )}
      <ProfileAvatar
        use_domain_logo
        email={email}
        image_url={image_url}
        name={get_email_username(email)}
        size="xs"
      />
      <span
        className="text-sm text-default-900 max-w-[200px] truncate"
        title={email}
      >
        {email}
      </span>
      {on_remove && (
        <button
          className="text-default-400 hover:text-default-600 transition-colors"
          onClick={on_remove}
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

interface RecipientFieldProps {
  label: string;
  recipients: string[];
  input_value: string;
  on_input_change: (val: string) => void;
  on_add_recipient: (email: string) => void;
  on_remove_recipient: (email: string) => void;
  on_remove_last: () => void;
  on_close?: () => void;
  show_cc_bcc_buttons?: boolean;
  on_show_cc?: () => void;
  on_show_bcc?: () => void;
  show_cc?: boolean;
  show_bcc?: boolean;
  contacts?: DecryptedContact[];
  recent_recipients?: DecryptedRecentRecipient[];
  auto_focus?: boolean;
}

export function RecipientField({
  label,
  recipients,
  input_value,
  on_input_change,
  on_add_recipient,
  on_remove_recipient,
  on_remove_last,
  on_close,
  show_cc_bcc_buttons,
  on_show_cc,
  on_show_bcc,
  show_cc,
  show_bcc,
  contacts = [],
  recent_recipients,
  auto_focus = false,
}: RecipientFieldProps) {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const [is_expanded, set_is_expanded] = useState(false);
  const [overflow_count, set_overflow_count] = useState(0);
  const measure_ref = useRef<HTMLDivElement>(null);
  const [encryption_map, set_encryption_map] = useState<
    Map<string, EncryptionStatus>
  >(new Map());
  const resolved_ref = useRef<Set<string>>(new Set());
  const in_flight_ref = useRef<Set<string>>(new Set());
  const retry_count_ref = useRef<Map<string, number>>(new Map());
  const [discovery_tick, set_discovery_tick] = useState(0);

  const show_locks = preferences.show_encryption_indicators;

  useEffect(() => {
    if (!show_locks) return;

    const current_set = new Set(recipients);
    const to_discover: string[] = [];

    for (const email of recipients) {
      if (resolved_ref.current.has(email)) continue;
      if (in_flight_ref.current.has(email)) continue;

      if (is_internal_email(email)) {
        resolved_ref.current.add(email);
        set_encryption_map((prev) => {
          const next = new Map(prev);

          next.set(email, "encrypted");

          return next;
        });
      } else {
        const retries = retry_count_ref.current.get(email) || 0;

        if (retries >= 3) continue;

        in_flight_ref.current.add(email);
        set_encryption_map((prev) => {
          const next = new Map(prev);

          next.set(email, "checking");

          return next;
        });
        to_discover.push(email);
      }
    }

    for (const key of [...resolved_ref.current]) {
      if (!current_set.has(key)) {
        resolved_ref.current.delete(key);
        retry_count_ref.current.delete(key);
        set_encryption_map((prev) => {
          const next = new Map(prev);

          next.delete(key);

          return next;
        });
      }
    }

    for (const key of [...in_flight_ref.current]) {
      if (!current_set.has(key)) {
        in_flight_ref.current.delete(key);
        retry_count_ref.current.delete(key);
        set_encryption_map((prev) => {
          const next = new Map(prev);

          next.delete(key);

          return next;
        });
      }
    }

    if (to_discover.length > 0) {
      discover_external_keys_batch(to_discover)
        .then((result) => {
          const key_map = new Map<string, boolean>();

          if (result.data) {
            for (const info of result.data) {
              key_map.set(info.email.toLowerCase(), has_pgp_key(info));
            }
          }

          set_encryption_map((prev) => {
            const next = new Map(prev);

            for (const email of to_discover) {
              const found = key_map.get(email.toLowerCase());

              if (found !== undefined) {
                next.set(email, found ? "encrypted" : "transit");
                resolved_ref.current.add(email);
                in_flight_ref.current.delete(email);
              } else if (!result.data || result.data.length === 0) {
                in_flight_ref.current.delete(email);
                const count = (retry_count_ref.current.get(email) || 0) + 1;

                retry_count_ref.current.set(email, count);
                if (count < 3) {
                  next.set(email, "checking");
                  setTimeout(
                    () => set_discovery_tick((t) => t + 1),
                    2000 * count,
                  );
                } else {
                  next.set(email, "transit");
                }
              } else {
                next.set(email, "transit");
                resolved_ref.current.add(email);
                in_flight_ref.current.delete(email);
              }
            }

            return next;
          });
        })
        .catch(() => {
          let should_retry = false;

          for (const email of to_discover) {
            in_flight_ref.current.delete(email);
            const count = (retry_count_ref.current.get(email) || 0) + 1;

            retry_count_ref.current.set(email, count);

            if (count < 3) {
              should_retry = true;
            }
          }

          set_encryption_map((prev) => {
            const next = new Map(prev);

            for (const email of to_discover) {
              const count = retry_count_ref.current.get(email) || 0;

              next.set(email, count >= 3 ? "transit" : "checking");
            }

            return next;
          });

          if (should_retry) {
            const max_count = Math.max(
              ...to_discover.map((e) => retry_count_ref.current.get(e) || 1),
            );

            setTimeout(
              () => set_discovery_tick((t) => t + 1),
              2000 * max_count,
            );
          }
        });
    }
  }, [recipients, show_locks, discovery_tick]);

  const contact_avatar_map = useMemo(() => {
    const map = new Map<string, string>();

    for (const contact of contacts) {
      if (!contact.avatar_url) continue;
      for (const email of contact.emails) {
        if (email) map.set(email.toLowerCase(), contact.avatar_url);
      }
    }

    return map;
  }, [contacts]);

  useLayoutEffect(() => {
    if (recipients.length <= 1) {
      set_is_expanded(false);
      set_overflow_count(0);

      return;
    }

    const container = measure_ref.current;

    if (!container) return;

    const calculate = () => {
      const badges = container.querySelectorAll(
        "[data-measure]",
      ) as NodeListOf<HTMLElement>;
      const more_el = container.querySelector(
        "[data-measure-more]",
      ) as HTMLElement | null;

      if (badges.length === 0) {
        set_overflow_count(0);

        return;
      }

      const available = container.clientWidth;
      const more_width = more_el ? more_el.offsetWidth : 60;
      const input_min = 120;
      const gap = 6;

      let used = 0;
      let fits = 0;

      for (let i = 0; i < badges.length; i++) {
        const w = badges[i].offsetWidth;
        const gap_before = i > 0 ? gap : 0;
        const width_after = used + gap_before + w;
        const remaining = badges.length - (i + 1);

        let space_needed = gap + input_min;

        if (remaining > 0) {
          space_needed += gap + more_width;
        }

        if (width_after + space_needed <= available || i === 0) {
          fits++;
          used = width_after;
        } else {
          break;
        }
      }

      set_overflow_count(Math.max(0, recipients.length - fits));
    };

    calculate();

    const observer = new ResizeObserver(calculate);

    observer.observe(container);

    return () => observer.disconnect();
  }, [recipients, is_expanded]);

  const visible_count =
    overflow_count > 0 ? recipients.length - overflow_count : recipients.length;
  const visible_recipients = is_expanded
    ? recipients
    : recipients.slice(0, visible_count);
  const hidden_count = is_expanded ? 0 : overflow_count;

  const handle_key_down = (e: React.KeyboardEvent) => {
    if (e["key"] === "Backspace" && !input_value && recipients.length > 0) {
      on_remove_last();
    }
  };

  const handle_select = (email: string) => {
    if (is_valid_email(email) && !recipients.includes(email)) {
      on_add_recipient(email);
      on_input_change("");
    }
  };

  return (
    <div className="flex items-start gap-2">
      <span className="text-sm flex-shrink-0 py-1.5 text-txt-tertiary">
        {label}
      </span>
      <div className="flex-1 relative min-w-0">
        {recipients.length > 1 && (
          <div
            ref={measure_ref}
            aria-hidden="true"
            className="absolute inset-x-0 top-0 flex items-center gap-1.5 invisible pointer-events-none overflow-hidden"
            style={{ height: 0 }}
          >
            {recipients.map((email) => (
              <div
                key={email}
                data-measure
                className="flex items-center gap-1.5 rounded-full px-2 py-1 flex-shrink-0"
                style={{ border: "1px solid transparent" }}
              >
                {show_locks && (
                  <span className="flex-shrink-0" style={{ width: 12 }} />
                )}
                <span className="w-5 h-5 flex-shrink-0 rounded-full" />
                <span className="text-sm max-w-[200px] truncate">{email}</span>
                <span className="w-5 h-5 flex-shrink-0" />
              </div>
            ))}
            <div
              data-measure-more
              className="flex items-center px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0"
              style={{ border: "1px solid transparent" }}
            >
              {t("common.n_more_recipients", { count: recipients.length - 1 })}
            </div>
          </div>
        )}
        <div
          className={`flex flex-wrap items-center gap-1.5${is_expanded && overflow_count > 0 ? " max-h-[160px] overflow-y-auto pr-1" : ""}`}
          role="presentation"
          onKeyDown={handle_key_down}
        >
          {visible_recipients.map((email) => (
            <RecipientBadge
              key={email}
              email={email}
              encryption_status={
                show_locks ? encryption_map.get(email) : undefined
              }
              image_url={contact_avatar_map.get(email.toLowerCase())}
              on_remove={() => on_remove_recipient(email)}
            />
          ))}
          {hidden_count > 0 && (
            <button
              className="flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors border cursor-pointer bg-surf-tertiary border-edge-secondary text-txt-secondary"
              type="button"
              onClick={() => set_is_expanded(true)}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
              }}
            >
              {t("common.n_more_recipients", { count: hidden_count })}
            </button>
          )}
          {is_expanded && overflow_count > 0 && (
            <button
              className="flex items-center px-2 py-1 rounded-full text-xs transition-colors cursor-pointer text-txt-muted"
              type="button"
              onClick={() => set_is_expanded(false)}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              {t("common.show_less")}
            </button>
          )}
          <div className="flex-1 min-w-[120px] compose_recipient_input">
            <EmailAutocomplete
              auto_focus={auto_focus}
              contacts={contacts}
              existing_emails={recipients}
              on_change={on_input_change}
              on_select={handle_select}
              placeholder={
                recipients.length === 0 ? t("common.recipients") : ""
              }
              recent_recipients={recent_recipients}
              value={input_value}
            />
          </div>
        </div>
      </div>
      {show_cc_bcc_buttons && (
        <div className="flex items-center gap-1 flex-shrink-0 py-1">
          {!show_cc && (
            <button
              className="text-xs px-2 py-1 rounded transition-colors hover_bg text-txt-tertiary"
              title={t("common.carbon_copy")}
              onClick={on_show_cc}
            >
              Cc
            </button>
          )}
          {!show_bcc && (
            <button
              className="text-xs px-2 py-1 rounded transition-colors hover_bg text-txt-tertiary"
              title={t("common.blind_carbon_copy")}
              onClick={on_show_bcc}
            >
              Bcc
            </button>
          )}
        </div>
      )}
      {on_close && (
        <button
          className="h-8 flex items-center px-1 rounded transition-colors flex-shrink-0 hover_bg text-txt-muted"
          onClick={on_close}
        >
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

interface ComposeFormFieldsProps {
  compose: UseComposeReturn;
  auto_focus_to?: boolean;
}

export function ComposeFormFields({
  compose,
  auto_focus_to = false,
}: ComposeFormFieldsProps) {
  const { t } = use_i18n();

  return (
    <>
      <div className="py-2 border-b border-edge-secondary">
        <RecipientField
          show_cc_bcc_buttons
          auto_focus={auto_focus_to}
          contacts={compose.contacts}
          input_value={compose.inputs.to}
          label={t("mail.to")}
          on_add_recipient={(email) => compose.add_recipient("to", email)}
          on_input_change={(val) => compose.update_input("to", val)}
          on_remove_last={() => compose.remove_last_recipient("to")}
          on_remove_recipient={(email) => compose.remove_recipient("to", email)}
          on_show_bcc={compose.show_bcc_field}
          on_show_cc={compose.show_cc_field}
          recent_recipients={compose.recent_recipients}
          recipients={compose.recipients.to}
          show_bcc={compose.visibility.bcc}
          show_cc={compose.visibility.cc}
        />
      </div>

      {compose.visibility.cc && (
        <div className="py-2 border-b border-edge-secondary">
          <RecipientField
            contacts={compose.contacts}
            input_value={compose.inputs.cc}
            label={t("mail.cc")}
            on_add_recipient={(email) => compose.add_recipient("cc", email)}
            on_close={compose.hide_cc_field}
            on_input_change={(val) => compose.update_input("cc", val)}
            on_remove_last={() => compose.remove_last_recipient("cc")}
            on_remove_recipient={(email) =>
              compose.remove_recipient("cc", email)
            }
            recent_recipients={compose.recent_recipients}
            recipients={compose.recipients.cc}
          />
        </div>
      )}

      {compose.visibility.bcc && (
        <div className="py-2 border-b border-edge-secondary">
          <RecipientField
            contacts={compose.contacts}
            input_value={compose.inputs.bcc}
            label={t("mail.bcc")}
            on_add_recipient={(email) => compose.add_recipient("bcc", email)}
            on_close={compose.hide_bcc_field}
            on_input_change={(val) => compose.update_input("bcc", val)}
            on_remove_last={() => compose.remove_last_recipient("bcc")}
            on_remove_recipient={(email) =>
              compose.remove_recipient("bcc", email)
            }
            recent_recipients={compose.recent_recipients}
            recipients={compose.recipients.bcc}
          />
        </div>
      )}

      <div className="flex items-start gap-2 py-2 border-b border-edge-secondary">
        <span className="text-sm flex-shrink-0 py-1.5 text-txt-tertiary">
          {t("mail.subject")}
        </span>
        <input
          className="flex-1 w-full bg-transparent border-none outline-none py-1.5 text-sm text-txt-primary placeholder:text-txt-muted"
          maxLength={998}
          placeholder=""
          type="text"
          value={compose.subject}
          onChange={(e) => compose.set_subject(e.target.value)}
        />
      </div>
    </>
  );
}
