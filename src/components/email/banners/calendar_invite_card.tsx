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
import type { ItipMessage } from "@/services/calendar/itip";
import type { InviteAnswer } from "@/services/calendar/invite_answers";
import type {
  CalendarAttendee,
  CalendarAttendeeResponse,
  DecryptedCalendarEvent,
} from "@/types/calendar";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ExclamationTriangleIcon,
  MapPinIcon,
  QuestionMarkCircleIcon,
  UserIcon,
  VideoCameraIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { IslandDivider } from "@aster/ui";

import { cn } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";
import { use_auth } from "@/contexts/auth/use_auth_hook";
import { show_toast } from "@/components/toast/simple_toast";
import { fetch_attachment_records } from "@/services/attachment_preview_cache";
import {
  get_cached_attachment_meta,
  prefetch_attachment_meta,
} from "@/services/attachment_meta_cache";
import { get_mail_item } from "@/services/api/mail";
import { UNDO_SEND_PREVIEW_ID } from "@/components/email/email_viewer_types";
import {
  decrypt_attachment_data,
  decrypt_attachment_meta,
} from "@/services/crypto/attachment_crypto";
import {
  is_event_organizer,
  is_itip_attachment,
  parse_itip_message,
} from "@/services/calendar/itip";
import {
  format_invite_range,
  send_reply,
} from "@/services/calendar/invite_mail";
import { reply_identity } from "@/services/calendar/invite_sender";
import { is_own_address } from "@/services/calendar/own_addresses";
import { use_invite_senders } from "@/components/calendar/use_invite_senders";
import {
  blob_to_event,
  draft_to_blob,
} from "@/services/calendar/calendar_codec";
import { calendar_available } from "@/services/calendar/calendar_availability";
import {
  read_invite_answer,
  write_invite_answer,
} from "@/services/calendar/invite_answers";
import {
  find_calendar_text,
  find_meeting_link,
  has_calendar_text,
  link_host,
  MAX_INVITE_SOURCE_CHARS,
} from "@/services/calendar/invite_detect";
import {
  apply_cancel,
  apply_reply,
  reply_from_sender,
  find_message_event,
  find_series_master,
  mail_item_provenance,
  message_attendees,
  message_to_draft,
  remove_event,
  set_own_response,
  UNTRUSTED_PROVENANCE,
  save_request_response,
  update_from_organizer,
} from "@/services/calendar/invite_store";
import { get_display_time_zone } from "@/utils/date_format";

interface InviteAttachmentHint {
  name: string;
  mime_type?: string;
}

interface CalendarInviteCardProps {
  email_id: string;
  sender_email?: string;
  attachments?: InviteAttachmentHint[];
  has_attachment?: boolean;
  body?: string;
  html_content?: string;
  className?: string;
}

type LoadState = "idle" | "loading" | "ready" | "none";

const MAX_ATTACHMENT_RECORDS = 25;

const RESPONSE_LABEL: Record<
  CalendarAttendeeResponse,
  | "calendar.attendee_accepted"
  | "calendar.attendee_tentative"
  | "calendar.attendee_declined"
  | "calendar.attendee_pending"
> = {
  accepted: "calendar.attendee_accepted",
  tentative: "calendar.attendee_tentative",
  declined: "calendar.attendee_declined",
  needs_action: "calendar.attendee_pending",
};

const RESPONSE_COLOR: Record<CalendarAttendeeResponse, string> = {
  accepted: "var(--color-success)",
  tentative: "var(--color-warning)",
  declined: "var(--color-danger)",
  needs_action: "var(--text-muted)",
};

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]";

const SECONDARY_BUTTON = cn(
  "h-8 rounded-[var(--aster-radius-control,8px)] border border-edge-primary px-3 text-[13px] font-medium transition-colors duration-150 ease-out hover:bg-[var(--aster-island-hover,var(--aster-hover))] disabled:opacity-60",
  FOCUS_RING,
);

function has_itip_attachment(
  attachments: InviteAttachmentHint[] | undefined,
): boolean {
  return (attachments ?? []).some((attachment) =>
    is_itip_attachment({
      filename: attachment.name,
      content_type: attachment.mime_type ?? null,
    }),
  );
}

async function has_itip_attachment_meta(email_id: string): Promise<boolean> {
  if (!email_id || email_id === UNDO_SEND_PREVIEW_ID) {
    return false;
  }

  await prefetch_attachment_meta([email_id]);

  return (get_cached_attachment_meta(email_id) ?? []).some((meta) =>
    is_itip_attachment(meta),
  );
}

async function read_itip_from_attachments(
  email_id: string,
): Promise<ItipMessage | null> {
  const records = await fetch_attachment_records(email_id);

  for (const record of records.slice(0, MAX_ATTACHMENT_RECORDS)) {
    try {
      const meta = await decrypt_attachment_meta(
        record.encrypted_meta,
        record.meta_nonce,
        record.mail_item_id,
        record.seq_num,
      );

      if (
        !is_itip_attachment(meta) ||
        (meta.size_bytes ?? 0) > MAX_INVITE_SOURCE_CHARS
      ) {
        continue;
      }

      const data = await decrypt_attachment_data(
        record.encrypted_data,
        record.data_nonce,
        meta.session_key,
        record.mail_item_id,
        record.seq_num,
      );

      if (data.byteLength > MAX_INVITE_SOURCE_CHARS) {
        continue;
      }

      const message = parse_itip_message(new TextDecoder().decode(data));

      if (message) {
        return message;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function date_badge(
  entry: ItipMessage["event"],
  language: string,
): { month: string; day: string } {
  const start = new Date(entry.starts_at);

  if (Number.isNaN(start.getTime())) {
    return { month: "", day: "" };
  }

  const time_zone = entry.is_all_day ? undefined : get_display_time_zone();

  try {
    return {
      month: new Intl.DateTimeFormat(language, {
        month: "short",
        timeZone: time_zone,
      }).format(start),
      day: new Intl.DateTimeFormat(language, {
        day: "numeric",
        timeZone: time_zone,
      }).format(start),
    };
  } catch {
    return { month: "", day: String(start.getDate()) };
  }
}

function ResponseChip({
  attendee,
  label,
}: {
  attendee: CalendarAttendee;
  label: string;
}) {
  const name = attendee.display_name || attendee.email;

  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-edge-primary px-2.5 py-0.5 text-[12px] leading-5 text-txt-primary"
      title={`${attendee.email} - ${label}`}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{
          backgroundColor:
            RESPONSE_COLOR[attendee.response] ?? RESPONSE_COLOR.needs_action,
        }}
      />
      <span className="truncate">{name}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function CalendarInviteCard({
  email_id,
  sender_email,
  attachments,
  has_attachment,
  body,
  html_content,
  className,
}: CalendarInviteCardProps) {
  const { t, language } = use_i18n();
  const { user } = use_auth();
  const self_email = (user?.email ?? "").trim().toLowerCase();
  const self_name = user?.display_name ?? null;
  const account_id = user?.id ?? "";
  const invite_senders = use_invite_senders();

  const itip_named = has_itip_attachment(attachments);
  const candidate =
    itip_named || has_calendar_text(body) || has_calendar_text(html_content);
  const probe = has_attachment === true || (attachments?.length ?? 0) > 0;

  const [state, set_state] = useState<LoadState>(
    candidate ? "loading" : "idle",
  );
  const [message, set_message] = useState<ItipMessage | null>(null);
  const [event, set_event] = useState<DecryptedCalendarEvent | null>(null);
  const [series, set_series] = useState<DecryptedCalendarEvent | null>(null);
  const [provenance, set_provenance] = useState(UNTRUSTED_PROVENANCE);
  const [is_own_copy, set_is_own_copy] = useState(false);
  const [calendar_ok, set_calendar_ok] = useState(false);
  const [stored_answer, set_stored_answer] = useState<InviteAnswer | null>(
    null,
  );
  const [optimistic, set_optimistic] =
    useState<CalendarAttendeeResponse | null>(null);
  const [calendar_note, set_calendar_note] = useState(false);
  const [is_busy, set_is_busy] = useState(false);
  const [reply_note, set_reply_note] = useState<string | null>(null);
  const busy_ref = useRef(false);
  const applied_reply = useRef<string | null>(null);
  const active_email = useRef(email_id);
  const trusted_sender = provenance.trusted ? sender_email : undefined;

  useEffect(() => {
    let cancelled = false;

    set_state(candidate ? "loading" : "idle");
    set_message(null);
    set_event(null);
    set_series(null);
    set_provenance(UNTRUSTED_PROVENANCE);
    set_is_own_copy(false);
    set_calendar_ok(false);
    set_stored_answer(null);
    set_optimistic(null);
    set_calendar_note(false);
    set_reply_note(null);

    const run = async () => {
      let parsed: ItipMessage | null = null;

      const read_attachments =
        probe ||
        itip_named ||
        (!candidate &&
          (await has_itip_attachment_meta(email_id).catch(() => false)));

      if (cancelled) {
        return;
      }

      if (read_attachments) {
        try {
          parsed = await read_itip_from_attachments(email_id);
        } catch {
          parsed = null;
        }
      }

      if (!parsed) {
        parsed = parse_itip_message(find_calendar_text(body, html_content));
      }

      if (cancelled) {
        return;
      }

      if (!parsed) {
        set_state("none");

        return;
      }

      const [item, available, answer] = await Promise.all([
        get_mail_item(email_id)
          .then((response) => response.data ?? null)
          .catch(() => null),
        calendar_available().catch(() => false),
        read_invite_answer({
          account_id,
          uid: parsed.uid,
          recurrence_id: parsed.recurrence_id,
        }).catch(() => null),
      ]);

      if (cancelled) {
        return;
      }

      set_message(parsed);
      set_provenance(mail_item_provenance(item));
      set_is_own_copy(item?.item_type === "sent");
      set_calendar_ok(available);
      set_stored_answer(answer);

      if (available) {
        try {
          const matched = await find_message_event(parsed);
          const master = matched ? null : await find_series_master(parsed);

          if (!cancelled) {
            set_event(matched);
            set_series(master);
          }
        } catch {
          if (!cancelled) {
            set_event(null);
          }
        }
      }

      if (!cancelled) {
        set_state("ready");
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [account_id, body, candidate, email_id, html_content, itip_named, probe]);

  useEffect(() => {
    active_email.current = email_id;
  }, [email_id]);

  useEffect(() => {
    if (
      state !== "ready" ||
      !message ||
      message.method !== "REPLY" ||
      !calendar_ok ||
      applied_reply.current === `${email_id}:${trusted_sender ?? ""}`
    ) {
      return;
    }

    applied_reply.current = `${email_id}:${trusted_sender ?? ""}`;

    if (!event) {
      set_reply_note(t("calendar.invite_card_reply_no_event"));

      return;
    }

    if (!reply_from_sender(message, event, trusted_sender)) {
      set_reply_note(t("calendar.invite_card_reply_unmatched"));

      return;
    }

    let cancelled = false;

    apply_reply(
      message,
      event,
      trusted_sender,
      self_email,
      provenance.received_at,
    )
      .then((updated) => {
        if (cancelled) {
          return;
        }

        if (!updated) {
          set_reply_note(t("calendar.invite_save_failed"));

          return;
        }

        if (updated === event) {
          set_reply_note(t("calendar.invite_card_reply_unchanged"));

          return;
        }

        set_event(updated);
        set_reply_note(t("calendar.invite_card_reply_recorded"));
      })
      .catch(() => {
        if (!cancelled) {
          set_reply_note(t("calendar.invite_save_failed"));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    calendar_ok,
    email_id,
    event,
    message,
    provenance.received_at,
    self_email,
    state,
    t,
    trusted_sender,
  ]);

  const when_label = useMemo(() => {
    if (!message) {
      return "";
    }

    return format_invite_range(
      {
        starts_at: message.event.starts_at,
        ends_at: message.event.ends_at,
        is_all_day: message.event.is_all_day,
      },
      language,
    );
  }, [language, message]);

  const badge = useMemo(
    () => (message ? date_badge(message.event, language) : null),
    [language, message],
  );

  const meeting_link = useMemo(
    () => (message ? find_meeting_link(message.event) : null),
    [message],
  );

  if (state === "idle" || state === "none") {
    return null;
  }

  if (state === "loading" || !message) {
    return (
      <div
        aria-busy="true"
        className={cn(
          "aster_island px-4 py-3 text-[13px] text-txt-muted",
          className,
        )}
        data-testid="calendar-invite-card-loading"
      >
        {t("calendar.invite_card_loading")}
      </div>
    );
  }

  const organizer = message.organizer;
  const is_self_organizer = organizer
    ? is_own_address(organizer.email, self_email)
    : event
      ? is_event_organizer(event, self_email)
      : false;
  const attendees = (
    event?.attendees.length ? event.attendees : message.attendees
  ).filter((attendee) => !attendee.is_organizer);
  const event_response =
    event?.attendees.find(
      (attendee) =>
        !attendee.is_organizer && is_own_address(attendee.email, self_email),
    )?.response ?? null;
  const remembered =
    stored_answer && stored_answer.sequence >= message.sequence
      ? stored_answer.response
      : null;
  const own_response =
    optimistic ??
    (event_response && event_response !== "needs_action"
      ? event_response
      : remembered);
  const self_is_guest = attendees.some((attendee) =>
    is_own_address(attendee.email, self_email),
  );
  const can_respond = !is_self_organizer || self_is_guest;
  const target = event ?? series;
  const foreign_update =
    target !== null &&
    message.method !== "REPLY" &&
    !update_from_organizer(message, target, trusted_sender);
  const show_unverified =
    !provenance.trusted &&
    message.method !== "REPLY" &&
    !(is_own_copy && is_self_organizer);
  const instance_cancelled =
    !event &&
    series !== null &&
    message.recurrence_id !== null &&
    series.recurrence_exceptions.includes(message.recurrence_id);
  const is_canceled =
    message.method === "CANCEL" || event?.status === "cancelled";
  const title =
    message.event.title.trim().length > 0
      ? message.event.title
      : t("calendar.untitled_event");
  const heading =
    message.method === "CANCEL"
      ? t("calendar.invite_card_cancel")
      : message.method === "REPLY"
        ? t("calendar.invite_card_reply")
        : message.sequence > 0
          ? t("calendar.invite_card_update")
          : t("calendar.invite_card_request");
  const location = message.event.location.trim();
  const show_location = location.length > 0 && location !== meeting_link;
  const response_label_id = `calendar-invite-response-${email_id}`;
  const shown_attendees = attendees.map((attendee) =>
    is_own_address(attendee.email, self_email)
      ? {
          ...attendee,
          display_name: t("calendar.invite_card_you"),
          response:
            message.method === "REQUEST" && own_response
              ? own_response
              : attendee.response,
        }
      : attendee,
  );

  const respond = async (next: CalendarAttendeeResponse | null) => {
    if (busy_ref.current || self_email.length === 0) {
      return;
    }

    if (next !== null && own_response === next) {
      return;
    }

    busy_ref.current = true;
    set_is_busy(true);

    const origin = email_id;
    const is_current = () => active_email.current === origin;
    const previous = own_response;
    const answer_target = {
      account_id,
      uid: message.uid,
      recurrence_id: message.recurrence_id,
    };
    const identity = reply_identity(
      invite_senders.all_options,
      [...(event?.attendees ?? []), ...message.attendees]
        .filter((attendee) => !attendee.is_organizer)
        .map((attendee) => attendee.email),
      self_email,
      self_name,
    );
    const roll_back = () => {
      if (is_current()) {
        set_optimistic(null);
      }
    };
    const remember = async (response: CalendarAttendeeResponse) => {
      await write_invite_answer(answer_target, response, message.sequence);

      if (is_current()) {
        set_stored_answer({
          response,
          sequence: message.sequence,
          at: Date.now(),
        });
      }
    };

    if (next !== null) {
      set_optimistic(next);
      set_calendar_note(false);
    }

    try {
      const created = event === null;
      const saved = calendar_ok
        ? await save_request_response(
            message,
            identity.attendee_email,
            next,
            event,
            trusted_sender,
            series,
          ).catch(() => null)
        : null;

      if (next === null) {
        if (!saved) {
          show_toast(t("calendar.invite_save_failed"), "error");

          return;
        }

        if (is_current()) {
          set_event(saved);
        }
        show_toast(t("calendar.invite_added_toast"), "success");

        return;
      }

      const organizer_email = organizer?.email ?? saved?.organizer_email ?? "";
      const needs_reply =
        organizer_email.length > 0 &&
        !is_own_address(organizer_email, self_email);

      if (!needs_reply) {
        if (!saved) {
          roll_back();
          show_toast(t("calendar.invite_save_failed"), "error");

          return;
        }

        if (is_current()) {
          set_event(saved);
        }
        await remember(next);
        show_toast(
          next === "declined"
            ? t("calendar.invite_declined_toast")
            : t("calendar.invite_added_toast"),
          "success",
        );

        return;
      }

      const reply_event =
        saved ??
        blob_to_event(
          draft_to_blob(
            message_to_draft(
              message,
              "",
              message_attendees(message, identity.attendee_email, next),
              null,
            ),
          ),
          "",
          "",
          new Date().toISOString(),
        );
      const sent = await send_reply({
        event: reply_event,
        organizer: organizer ?? { email: organizer_email, display_name: null },
        attendee: {
          email: identity.reply_email,
          display_name: identity.display_name,
        },
        sender: identity.sender,
        response: next,
        t,
        language,
      }).catch(() => false);

      if (!sent) {
        if (saved && created) {
          await remove_event(saved.id).catch(() => false);
        } else if (saved) {
          const restored = await set_own_response(
            saved,
            identity.attendee_email,
            previous ?? "needs_action",
          ).catch(() => null);

          if (is_current()) {
            set_event(restored ?? event);
          }
        }
        roll_back();
        show_toast(t("calendar.invite_card_reply_send_failed"), "error");

        return;
      }

      if (is_current() && saved) {
        set_event(saved);
      }
      await remember(next);

      if (is_current()) {
        set_calendar_note(calendar_ok && !saved);
      }
      show_toast(t("calendar.invite_card_reply_sent"), "success");
    } catch {
      roll_back();
      show_toast(t("calendar.invite_save_failed"), "error");
    } finally {
      busy_ref.current = false;
      set_is_busy(false);
    }
  };

  const handle_remove = async () => {
    if (
      busy_ref.current ||
      !event ||
      foreign_update ||
      message.method !== "CANCEL"
    ) {
      return;
    }

    busy_ref.current = true;
    set_is_busy(true);
    const origin = email_id;

    try {
      const removed = await remove_event(event.id);

      if (removed) {
        if (active_email.current === origin) {
          set_event(null);
        }
        show_toast(t("calendar.invite_card_removed_toast"), "success");
      } else {
        show_toast(t("calendar.invite_save_failed"), "error");
      }
    } catch {
      show_toast(t("calendar.invite_save_failed"), "error");
    } finally {
      busy_ref.current = false;
      set_is_busy(false);
    }
  };

  const handle_cancel_sync = async () => {
    if (
      busy_ref.current ||
      !target ||
      (event ? event.status === "cancelled" : instance_cancelled)
    ) {
      return;
    }

    busy_ref.current = true;
    set_is_busy(true);
    const origin = email_id;

    try {
      const updated = await apply_cancel(message, target, trusted_sender);

      if (!updated) {
        show_toast(t("calendar.invite_save_failed"), "error");
      } else if (active_email.current !== origin) {
        return;
      } else if (event) {
        set_event(updated);
      } else {
        set_series(updated);
      }
    } catch {
      show_toast(t("calendar.invite_save_failed"), "error");
    } finally {
      busy_ref.current = false;
      set_is_busy(false);
    }
  };

  const response_button = (
    value: CalendarAttendeeResponse,
    label: string,
    icon: React.ReactNode,
  ) => {
    const active = own_response === value;

    return (
      <button
        key={value}
        aria-pressed={active}
        className={cn(
          "flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[var(--aster-radius-control,8px)] border px-3 text-[13px] font-medium transition-colors duration-150 ease-out disabled:cursor-default sm:h-8 sm:flex-none",
          FOCUS_RING,
          "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--aster-island-fill,var(--bg-primary))]",
          active
            ? "border-transparent bg-brand text-[var(--accent-fg,#ffffff)]"
            : "border-edge-primary text-txt-secondary hover:bg-[var(--aster-island-hover,var(--aster-hover))] disabled:opacity-60",
        )}
        data-testid={`calendar-invite-${value}`}
        disabled={is_busy}
        type="button"
        onClick={() => void respond(value)}
      >
        <span aria-hidden="true" className="[&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </button>
    );
  };

  return (
    <section
      aria-label={title}
      className={cn("aster_island overflow-hidden", className)}
      data-testid="calendar-invite-card"
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div
          aria-hidden="true"
          className={cn(
            "flex h-12 w-11 flex-shrink-0 flex-col items-center justify-center overflow-hidden rounded-[10px] border border-edge-primary bg-[var(--bg-primary)]",
            is_canceled && "opacity-60",
          )}
        >
          <span className="text-[10px] font-semibold uppercase leading-3 tracking-[0.04em] text-[var(--accent-color)]">
            {badge?.month}
          </span>
          <span className="text-[18px] font-semibold leading-6 tabular-nums text-txt-primary">
            {badge?.day}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-txt-muted">
            {heading}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn(
                "min-w-0 break-words text-[15px] font-semibold leading-5 text-txt-primary",
                is_canceled && "line-through",
              )}
            >
              {title}
            </span>
            {is_canceled && (
              <span className="rounded-full border border-edge-primary px-2 text-[11px] leading-5 text-[var(--color-danger)]">
                {t("calendar.invite_card_canceled_chip")}
              </span>
            )}
            {!is_canceled && event && (
              <span className="rounded-full border border-edge-primary px-2 text-[11px] leading-5 text-txt-muted">
                {t("calendar.invite_card_in_calendar")}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[13px] text-txt-secondary">
            {when_label}
          </div>

          {show_unverified && (
            <div
              className="mt-2 flex items-start gap-1.5 text-[12px] leading-4 text-[var(--color-warning)]"
              data-testid="calendar-invite-unverified"
              role="note"
            >
              <ExclamationTriangleIcon
                aria-hidden="true"
                className="h-3.5 w-3.5 flex-shrink-0"
              />
              <span>
                {t("calendar.invite_card_unverified_sender", {
                  email: sender_email || organizer?.email || "",
                })}
              </span>
            </div>
          )}

          {((meeting_link && !is_canceled) || show_location || organizer) && (
            <div className="mt-2 flex flex-col gap-1">
              {meeting_link && !is_canceled && (
                <div className="flex min-w-0 items-center gap-1.5 text-[12px]">
                  <VideoCameraIcon
                    aria-hidden="true"
                    className="h-3.5 w-3.5 flex-shrink-0 text-txt-muted"
                  />
                  <a
                    className={cn(
                      "flex-shrink-0 rounded-[4px] font-medium text-[var(--accent-color)] hover:underline",
                      FOCUS_RING,
                    )}
                    data-testid="calendar-invite-join"
                    href={meeting_link}
                    referrerPolicy="no-referrer"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {t("calendar.invite_card_join")}
                  </a>
                  <span className="min-w-0 truncate text-txt-muted">
                    {link_host(meeting_link)}
                  </span>
                </div>
              )}
              {show_location && (
                <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-txt-muted">
                  <MapPinIcon
                    aria-hidden="true"
                    className="h-3.5 w-3.5 flex-shrink-0"
                  />
                  <span className="truncate">{location}</span>
                </div>
              )}
              {organizer && (
                <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-txt-muted">
                  <UserIcon
                    aria-hidden="true"
                    className="h-3.5 w-3.5 flex-shrink-0"
                  />
                  <span className="truncate">
                    {t("calendar.invite_card_organizer_label", {
                      name: is_self_organizer
                        ? t("calendar.invite_card_you")
                        : organizer.display_name || organizer.email,
                    })}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {shown_attendees.length > 0 && (
        <div className="px-4 pb-3.5">
          <div className="mb-1.5 text-[11px] font-medium text-txt-muted">
            {t("calendar.invite_card_guests")}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {shown_attendees.map((attendee) => (
              <ResponseChip
                key={attendee.email}
                attendee={attendee}
                label={t(
                  RESPONSE_LABEL[attendee.response] ??
                    RESPONSE_LABEL.needs_action,
                )}
              />
            ))}
          </div>
        </div>
      )}

      {message.method === "REQUEST" && can_respond && !foreign_update && (
        <>
          <IslandDivider />
          <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <span
              className="text-[12px] font-medium text-txt-muted sm:mr-1"
              id={response_label_id}
            >
              {t("calendar.invite_your_response")}
            </span>
            <div
              aria-busy={is_busy}
              aria-labelledby={response_label_id}
              className="flex w-full gap-2 sm:w-auto"
              role="group"
            >
              {response_button(
                "accepted",
                t("calendar.invite_yes"),
                <CheckIcon />,
              )}
              {response_button(
                "tentative",
                t("calendar.invite_maybe"),
                <QuestionMarkCircleIcon />,
              )}
              {response_button(
                "declined",
                t("calendar.invite_no"),
                <XMarkIcon />,
              )}
            </div>
            {calendar_ok && !event && own_response === null && (
              <button
                className={cn(
                  "h-8 self-start rounded-[var(--aster-radius-control,8px)] px-2 text-[13px] font-medium text-[var(--accent-color)] transition-colors duration-150 ease-out hover:underline disabled:opacity-60 sm:ml-auto sm:self-auto",
                  FOCUS_RING,
                )}
                disabled={is_busy}
                type="button"
                onClick={() => void respond(null)}
              >
                {t("calendar.invite_card_add")}
              </button>
            )}
          </div>
          {calendar_note && (
            <div
              className="px-4 pb-3 text-[12px] text-txt-muted"
              data-testid="calendar-invite-calendar-note"
              role="status"
            >
              {t("calendar.invite_card_calendar_failed")}
            </div>
          )}
        </>
      )}

      {message.method === "REQUEST" && !can_respond && !foreign_update && (
        <>
          <IslandDivider />
          <div className="px-4 py-3 text-[12px] text-txt-muted">
            {t("calendar.invite_card_organizer_self")}
          </div>
        </>
      )}

      {foreign_update && (
        <>
          <IslandDivider />
          <div className="px-4 py-3 text-[12px] text-txt-muted">
            {t("calendar.invite_card_update_unmatched")}
          </div>
        </>
      )}

      {message.method === "CANCEL" && target && !foreign_update && (
        <>
          <IslandDivider />
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            {(event ? event.status !== "cancelled" : !instance_cancelled) && (
              <button
                className={cn(SECONDARY_BUTTON, "text-txt-secondary")}
                disabled={is_busy}
                type="button"
                onClick={() => void handle_cancel_sync()}
              >
                {t("calendar.invite_card_canceled_chip")}
              </button>
            )}
            {event && (
              <button
                className={cn(SECONDARY_BUTTON, "text-[var(--color-danger)]")}
                disabled={is_busy}
                type="button"
                onClick={() => void handle_remove()}
              >
                {t("calendar.invite_card_remove_canceled")}
              </button>
            )}
          </div>
        </>
      )}

      {message.method === "REPLY" && reply_note && (
        <>
          <IslandDivider />
          <div className="px-4 py-3 text-[12px] text-txt-muted">
            {reply_note}
          </div>
        </>
      )}
    </section>
  );
}
