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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}:${Object.values(values).join("|")}` : key,
    language: "en",
  }),
}));

vi.mock("@/contexts/auth/use_auth_hook", () => ({
  use_auth: () => ({
    user: { id: "account-1", email: "me@example.com", display_name: "Me" },
  }),
}));

const show_toast = vi.fn();

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => show_toast(...args),
}));

vi.mock("@/components/calendar/use_invite_senders", () => ({
  use_invite_senders: () => ({ all_options: [] }),
}));

vi.mock("@/services/api/mail", () => ({
  get_mail_item: vi.fn(async () => ({ data: null })),
}));

const fetch_attachment_records = vi.fn(async (_id: string) => [] as unknown[]);

vi.mock("@/services/attachment_preview_cache", () => ({
  fetch_attachment_records: (id: string) => fetch_attachment_records(id),
}));

const cached_meta = new Map<
  string,
  { filename: string | null; content_type: string | null }[]
>();
const prefetch_attachment_meta = vi.fn(async (_ids: string[]) => undefined);

vi.mock("@/services/attachment_meta_cache", () => ({
  prefetch_attachment_meta: (ids: string[]) => prefetch_attachment_meta(ids),
  get_cached_attachment_meta: (id: string) => cached_meta.get(id) ?? null,
}));

let attached_ics = "";

vi.mock("@/services/crypto/attachment_crypto", () => ({
  decrypt_attachment_meta: vi.fn(async () => ({
    filename: "invite.ics",
    content_type: "text/calendar; method=REQUEST",
    session_key: "session",
    size_bytes: attached_ics.length,
  })),
  decrypt_attachment_data: vi.fn(
    async () => new TextEncoder().encode(attached_ics).buffer,
  ),
}));

let calendar_on = true;

vi.mock("@/services/calendar/calendar_availability", () => ({
  calendar_available: async () => calendar_on,
}));

const answers = new Map<string, unknown>();

vi.mock("@/services/calendar/invite_answers", () => ({
  read_invite_answer: async (target: { uid: string }) =>
    answers.get(target.uid) ?? null,
  write_invite_answer: async (
    target: { uid: string },
    response: string,
    sequence: number,
  ) => {
    answers.set(target.uid, { response, sequence, at: 1 });
  },
}));

const send_reply = vi.fn(async (_options: unknown) => true);

vi.mock("@/services/calendar/invite_mail", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/calendar/invite_mail")
  >()),
  send_reply: (options: unknown) => send_reply(options),
}));

const saved_event = {
  id: "event-1",
  calendar_id: "calendar-1",
  title: "Planning review",
  starts_at: "2026-10-12T13:00:00.000Z",
  ends_at: "2026-10-12T14:00:00.000Z",
  is_all_day: false,
  status: "confirmed",
  organizer_email: "olivia@example.com",
  recurrence_exceptions: [],
  attendees: [
    {
      email: "me@example.com",
      display_name: "Me",
      response: "accepted",
      is_organizer: false,
    },
  ],
  sequence: 0,
};

const save_request_response = vi.fn(
  async (..._args: unknown[]): Promise<unknown> => saved_event,
);
const remove_event = vi.fn(async (_id: string) => true);
const set_own_response = vi.fn(async (..._args: unknown[]) => null);

vi.mock("@/services/calendar/invite_store", async (import_original) => ({
  ...(await import_original<
    typeof import("@/services/calendar/invite_store")
  >()),
  apply_cancel: vi.fn(),
  apply_reply: vi.fn(),
  find_message_event: vi.fn(async () => null),
  find_series_master: vi.fn(async () => null),
  mail_item_provenance: vi.fn(() => ({ trusted: true, received_at: null })),
  remove_event: (id: string) => remove_event(id),
  save_request_response: (...args: unknown[]) => save_request_response(...args),
  set_own_response: (...args: unknown[]) => set_own_response(...args),
  update_from_organizer: vi.fn(() => true),
}));

function ics(lines: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Example//Planner//EN",
    ...lines,
    "END:VCALENDAR",
  ].join("\r\n");
}

function request(uid: string, extra: string[] = []): string {
  return ics([
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "DTSTAMP:20261010T140000Z",
    "DTSTART:20261012T130000Z",
    "DTEND:20261012T140000Z",
    "SUMMARY:Planning review",
    "SEQUENCE:0",
    "ORGANIZER;CN=Olivia:mailto:olivia@example.com",
    "ATTENDEE;CN=Me;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:me@example.com",
    ...extra,
    "END:VEVENT",
  ]);
}

const { CalendarInviteCard } = await import("./calendar_invite_card");
const { EXTERNAL_LINK_EVENT } = await import("@/utils/external_link_request");
const { record_message_sender_identity } = await import(
  "@/services/crypto/ratchet_verification_status"
);
const { get_mail_item } = await import("@/services/api/mail");
const { mail_item_provenance } = await import(
  "@/services/calendar/invite_store"
);

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function render(element: React.ReactElement): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element);
  });
  await settle();

  return container;
}

function unmount(): void {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
}

function response_button(view: HTMLElement, value: string): HTMLButtonElement {
  const button = view.querySelector<HTMLButtonElement>(
    `[data-testid="calendar-invite-${value}"]`,
  );

  if (!button) {
    throw new Error(`no ${value} button`);
  }

  return button;
}

async function tap(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  calendar_on = true;
  answers.clear();
  cached_meta.clear();
});

afterEach(() => {
  unmount();
  vi.clearAllMocks();
});

describe("CalendarInviteCard", () => {
  it("renders nothing for a message without calendar content", async () => {
    const view = await render(
      <CalendarInviteCard body="Hello there" email_id="mail-0" />,
    );

    expect(view.innerHTML).toBe("");
    expect(prefetch_attachment_meta).toHaveBeenCalledWith(["mail-0"]);
    expect(fetch_attachment_records).not.toHaveBeenCalled();
  });

  it("finds an attached invite from its metadata when the viewer gives no hint", async () => {
    calendar_on = false;
    attached_ics = request("uid-11");
    cached_meta.set("mail-11", [
      { filename: "invite.ics", content_type: "text/calendar; method=REQUEST" },
    ]);
    fetch_attachment_records.mockResolvedValueOnce([
      {
        encrypted_meta: "meta",
        meta_nonce: "nonce",
        mail_item_id: "mail-11",
        seq_num: 0,
        encrypted_data: "data",
        data_nonce: "nonce",
      },
    ]);

    const view = await render(
      <CalendarInviteCard
        body="See the attached invitation."
        email_id="mail-11"
      />,
    );

    expect(fetch_attachment_records).toHaveBeenCalledWith("mail-11");
    expect(response_button(view, "accepted")).toBeTruthy();
  });

  it("shows the title, three responses and a labeled group", async () => {
    const view = await render(
      <CalendarInviteCard body={request("uid-1")} email_id="mail-1" />,
    );
    const card = view.querySelector('[data-testid="calendar-invite-card"]');

    expect(card?.getAttribute("aria-label")).toBe("Planning review");
    expect(card?.textContent).toContain("calendar.invite_card_request");

    const group = view.querySelector('[role="group"]');
    const label_id = group?.getAttribute("aria-labelledby") ?? "";

    expect(document.getElementById(label_id)?.textContent).toBe(
      "calendar.invite_your_response",
    );

    for (const value of ["accepted", "tentative", "declined"]) {
      expect(response_button(view, value).getAttribute("aria-pressed")).toBe(
        "false",
      );
    }
  });

  it("marks Yes at once, saves the event and sends one reply", async () => {
    let finish_send: (value: boolean) => void = () => {};

    send_reply.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finish_send = resolve;
        }),
    );

    const view = await render(
      <CalendarInviteCard
        body={request("uid-2")}
        email_id="mail-2"
        sender_email="olivia@example.com"
      />,
    );

    await tap(response_button(view, "accepted"));

    expect(response_button(view, "accepted").getAttribute("aria-pressed")).toBe(
      "true",
    );

    await act(async () => {
      finish_send(true);
    });
    await settle();

    expect(save_request_response).toHaveBeenCalledTimes(1);
    expect(save_request_response.mock.calls[0][2]).toBe("accepted");
    expect(send_reply).toHaveBeenCalledTimes(1);
    expect(send_reply.mock.calls[0][0]).toMatchObject({
      response: "accepted",
      organizer: { email: "olivia@example.com" },
    });
    expect(answers.get("uid-2")).toMatchObject({ response: "accepted" });
    expect(show_toast).toHaveBeenLastCalledWith(
      "calendar.invite_card_reply_sent",
      "success",
    );

    await tap(response_button(view, "accepted"));
    await settle();

    expect(send_reply).toHaveBeenCalledTimes(1);
  });

  it("rolls Maybe back when the reply does not send", async () => {
    send_reply.mockResolvedValueOnce(false);

    const view = await render(
      <CalendarInviteCard body={request("uid-3")} email_id="mail-3" />,
    );

    await tap(response_button(view, "tentative"));
    await settle();

    expect(save_request_response.mock.calls[0][2]).toBe("tentative");
    expect(remove_event).toHaveBeenCalledWith("event-1");
    expect(
      response_button(view, "tentative").getAttribute("aria-pressed"),
    ).toBe("false");
    expect(answers.has("uid-3")).toBe(false);
    expect(show_toast).toHaveBeenLastCalledWith(
      "calendar.invite_card_reply_send_failed",
      "error",
    );
  });

  it("sends No without a calendar and keeps the answer after a reload", async () => {
    calendar_on = false;

    const view = await render(
      <CalendarInviteCard body={request("uid-4")} email_id="mail-4" />,
    );

    expect(view.textContent).not.toContain("calendar.invite_card_add");

    await tap(response_button(view, "declined"));
    await settle();

    expect(save_request_response).not.toHaveBeenCalled();
    expect(send_reply).toHaveBeenCalledTimes(1);
    expect(send_reply.mock.calls[0][0]).toMatchObject({
      response: "declined",
    });
    expect(answers.get("uid-4")).toMatchObject({ response: "declined" });
    expect(
      view.querySelector('[data-testid="calendar-invite-calendar-note"]'),
    ).toBeNull();

    unmount();

    const reloaded = await render(
      <CalendarInviteCard body={request("uid-4")} email_id="mail-4" />,
    );

    expect(
      response_button(reloaded, "declined").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("tells the guest when the reply went out but the save failed", async () => {
    save_request_response.mockRejectedValueOnce(new Error("offline"));

    const view = await render(
      <CalendarInviteCard body={request("uid-5")} email_id="mail-5" />,
    );

    await tap(response_button(view, "accepted"));
    await settle();

    expect(send_reply).toHaveBeenCalledTimes(1);
    expect(
      view.querySelector('[data-testid="calendar-invite-calendar-note"]'),
    ).not.toBeNull();
    expect(response_button(view, "accepted").getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("links only http and https meeting addresses", async () => {
    const safe = await render(
      <CalendarInviteCard
        body={request("uid-6", ["LOCATION:https://meet.example.com/abc-def"])}
        email_id="mail-6"
      />,
    );
    const link = safe.querySelector<HTMLAnchorElement>(
      '[data-testid="calendar-invite-join"]',
    );

    expect(link?.getAttribute("href")).toBe("https://meet.example.com/abc-def");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");

    unmount();

    const unsafe = await render(
      <CalendarInviteCard
        body={request("uid-7", ["LOCATION:javascript:alert(1)"])}
        email_id="mail-7"
      />,
    );

    expect(
      unsafe.querySelector('[data-testid="calendar-invite-join"]'),
    ).toBeNull();
    expect(unsafe.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it("shows no response buttons to the organizer", async () => {
    const body = ics([
      "METHOD:REQUEST",
      "BEGIN:VEVENT",
      "UID:uid-8",
      "DTSTAMP:20261010T140000Z",
      "DTSTART:20261012T130000Z",
      "DTEND:20261012T140000Z",
      "SUMMARY:Team sync",
      "ORGANIZER;CN=Me:mailto:me@example.com",
      "ATTENDEE;CN=Olivia;PARTSTAT=NEEDS-ACTION:mailto:olivia@example.com",
      "END:VEVENT",
    ]);
    const view = await render(
      <CalendarInviteCard body={body} email_id="mail-8" />,
    );

    expect(
      view.querySelector('[data-testid="calendar-invite-accepted"]'),
    ).toBeNull();
    expect(view.textContent).toContain("calendar.invite_card_organizer_self");
  });

  it("shows a canceled event without response buttons", async () => {
    const body = ics([
      "METHOD:CANCEL",
      "BEGIN:VEVENT",
      "UID:uid-9",
      "DTSTAMP:20261010T140000Z",
      "DTSTART:20261012T130000Z",
      "DTEND:20261012T140000Z",
      "SUMMARY:Planning review",
      "SEQUENCE:1",
      "STATUS:CANCELLED",
      "ORGANIZER;CN=Olivia:mailto:olivia@example.com",
      "ATTENDEE;CN=Me:mailto:me@example.com",
      "END:VEVENT",
    ]);
    const view = await render(
      <CalendarInviteCard body={body} email_id="mail-9" />,
    );

    expect(view.textContent).toContain("calendar.invite_card_cancel");
    expect(view.textContent).toContain("calendar.invite_card_canceled_chip");
    expect(
      view.querySelector('[data-testid="calendar-invite-accepted"]'),
    ).toBeNull();
  });

  it("reads an attached invite.ics through the encrypted attachment path", async () => {
    calendar_on = false;
    attached_ics = request("uid-10");
    fetch_attachment_records.mockResolvedValueOnce([
      {
        encrypted_meta: "meta",
        meta_nonce: "nonce",
        mail_item_id: "mail-10",
        seq_num: 0,
        encrypted_data: "data",
        data_nonce: "nonce",
      },
    ]);

    const view = await render(
      <CalendarInviteCard
        has_attachment
        attachments={[{ name: "invite.ics", mime_type: "text/calendar" }]}
        body="See the attached invitation."
        email_id="mail-10"
      />,
    );

    expect(fetch_attachment_records).toHaveBeenCalledWith("mail-10");
    expect(
      view.querySelector('[data-testid="calendar-invite-card"]'),
    ).not.toBeNull();
    expect(response_button(view, "accepted")).toBeTruthy();
  });

  it("opens the meeting link through the external link check", async () => {
    const requested: string[] = [];
    const listener = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          url: string;
          on_result?: (opened: boolean) => void;
        }>
      ).detail;

      event.preventDefault();
      requested.push(detail.url);
      detail.on_result?.(false);
    };

    window.addEventListener(EXTERNAL_LINK_EVENT, listener);

    try {
      const view = await render(
        <CalendarInviteCard
          body={request("uid-20", ["LOCATION:https://meet.example.com/abc-def"])}
          email_id="mail-20"
        />,
      );
      const link = view.querySelector<HTMLAnchorElement>(
        '[data-testid="calendar-invite-join"]',
      );
      let not_prevented = true;

      await act(async () => {
        not_prevented = link!.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });

      expect(not_prevented).toBe(false);
      expect(requested).toEqual(["https://meet.example.com/abc-def"]);
    } finally {
      window.removeEventListener(EXTERNAL_LINK_EVENT, listener);
    }
  });

  it("warns when the organizer is not the sender and confirms before replying", async () => {
    const view = await render(
      <CalendarInviteCard
        body={request("uid-21")}
        email_id="mail-21"
        sender_email="assistant@example.net"
      />,
    );

    expect(
      view.querySelector('[data-testid="calendar-invite-organizer-mismatch"]')
        ?.textContent,
    ).toContain("assistant@example.net|olivia@example.com");

    await tap(response_button(view, "accepted"));
    await settle();

    expect(send_reply).not.toHaveBeenCalled();
    expect(save_request_response).not.toHaveBeenCalled();

    const cancel = view.querySelector<HTMLButtonElement>(
      '[data-testid="calendar-invite-reply-confirm-cancel"]',
    );

    await tap(cancel!);

    expect(
      view.querySelector('[data-testid="calendar-invite-reply-confirm"]'),
    ).toBeNull();

    await tap(response_button(view, "declined"));

    const send = view.querySelector<HTMLButtonElement>(
      '[data-testid="calendar-invite-reply-confirm-send"]',
    );

    await tap(send!);
    await settle();

    expect(send_reply).toHaveBeenCalledTimes(1);
    expect(send_reply.mock.calls[0][0]).toMatchObject({
      response: "declined",
      organizer: { email: "olivia@example.com" },
    });
    expect(
      view.querySelector('[data-testid="calendar-invite-reply-confirm"]'),
    ).toBeNull();
  });

  it("shows no organizer warning when the organizer sent the invite", async () => {
    const view = await render(
      <CalendarInviteCard
        body={request("uid-22")}
        email_id="mail-22"
        sender_email="Olivia@Example.com"
      />,
    );

    expect(
      view.querySelector('[data-testid="calendar-invite-organizer-mismatch"]'),
    ).toBeNull();

    await tap(response_button(view, "accepted"));
    await settle();

    expect(
      view.querySelector('[data-testid="calendar-invite-reply-confirm"]'),
    ).toBeNull();
    expect(send_reply).toHaveBeenCalledTimes(1);
  });

  it("passes the sender identity result to the invite provenance", async () => {
    const item = { item_type: "received", is_external: false };

    vi.mocked(get_mail_item).mockResolvedValueOnce({
      data: item,
    } as unknown as Awaited<ReturnType<typeof get_mail_item>>);
    record_message_sender_identity("mail-23", "mismatch");

    await render(
      <CalendarInviteCard body={request("uid-23")} email_id="mail-23" />,
    );

    expect(mail_item_provenance).toHaveBeenCalledWith(item, "mismatch");
  });
});
