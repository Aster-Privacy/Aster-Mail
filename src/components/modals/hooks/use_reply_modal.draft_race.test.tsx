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
import type { UseReplyModalProps } from "./reply_modal_types";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mocks = vi.hoisted(() => ({
  create_draft: vi.fn(),
  update_draft: vi.fn(),
  delete_thread_draft: vi.fn(),
  send_reply: vi.fn(),
  send_via_external_account: vi.fn(),
  undo_add: vi.fn(),
  sender_state: {
    options: [] as unknown[],
    resolved: null as unknown,
  },
}));

const stable = vi.hoisted(() => ({
  t: (key: string) => key,
  preferences: {
    signature_mode: "off",
    show_aster_branding: false,
    show_badges_in_signature: false,
    undo_send_enabled: true,
    undo_send_seconds: 10,
    undo_send_period: "seconds",
    auto_save_recent_recipients: false,
    signature_placement: "below",
  },
  auth: {
    user: { email: "me@astermail.org", username: "me", display_name: "Me" },
    vault: { key: "vault" },
  },
  signatures: {
    default_signature: null,
    get_formatted_signature: () => "",
    resolve_signature: () => null,
    is_loading: false,
    signatures: [],
  },
  ghost: { is_ghost_enabled: false },
  editor_change: { current: (_html: string) => undefined as void },
  editor: {
    format_state: { active_formats: new Set<string>() },
    is_mac: false,
    exec_format: () => undefined,
    insert_text: () => undefined,
  },
}));

vi.mock("@/services/api/multi_drafts", () => ({
  create_draft: mocks.create_draft,
  update_draft: mocks.update_draft,
  delete_thread_draft: mocks.delete_thread_draft,
}));

vi.mock("@/services/mail_actions", () => ({
  send_reply: mocks.send_reply,
  build_reply_recipients: (params: { original: { sender_email: string } }) => ({
    to: [params.original.sender_email],
    cc: [],
  }),
}));

vi.mock("@/services/api/external_accounts", () => ({
  send_via_external_account: mocks.send_via_external_account,
}));

vi.mock("@/hooks/use_undo_send", () => ({
  undo_send_manager: { add: mocks.undo_add },
  store_pending_send_payload: vi.fn(),
}));

vi.mock("@/services/send_queue", () => ({
  get_undo_send_delay_ms: () => 10_000,
}));

vi.mock("@/hooks/mail_events", async (import_original) => ({
  ...(await import_original<typeof import("@/hooks/mail_events")>()),
  emit_email_sent: vi.fn(),
  emit_thread_reply_optimistic: vi.fn(),
  emit_thread_reply_sent: vi.fn(),
  emit_thread_reply_cancelled: vi.fn(),
  emit_scheduled_changed: vi.fn(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ key: "vault" }),
  wait_for_keys_ready: () => Promise.resolve(),
  are_keys_ready: () => true,
}));

vi.mock("@/services/api/csrf", () => ({ has_csrf_token: () => true }));

vi.mock("@/services/api/client", () => ({
  api_client: { refresh_session: () => Promise.resolve() },
}));

vi.mock("@/hooks/use_draggable_modal", () => ({
  use_draggable_modal: () => ({
    handle_drag_start: () => undefined,
    get_position_style: () => ({}),
  }),
}));

vi.mock("@/hooks/use_editor", () => ({
  use_editor: (options: { on_change: (html: string) => void }) => {
    stable.editor_change.current = options.on_change;

    return stable.editor;
  },
}));

vi.mock("@/contexts/auth_context", () => ({ use_auth: () => stable.auth }));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: stable.preferences }),
}));

vi.mock("@/contexts/signatures_context", () => ({
  use_signatures: () => stable.signatures,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: stable.t }),
}));

vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: vi.fn(),
}));

vi.mock("@/hooks/use_sender_aliases", () => ({
  use_sender_aliases: () => ({
    sender_options: mocks.sender_state.options,
    loading: false,
  }),
  is_signature_bindable_sender_type: () => false,
}));

vi.mock("@/hooks/use_ghost_mode", () => ({
  use_ghost_mode: () => stable.ghost,
}));

vi.mock("@/hooks/use_ghost_sender_binding", () => ({
  use_ghost_sender_binding: (
    _ghost: unknown,
    _sender: unknown,
    set_sender: (sender: unknown) => void,
  ) => set_sender,
}));

vi.mock("@/lib/preferred_sender", () => ({
  get_preferred_sender_id: () => null,
  set_preferred_sender_id: () => undefined,
  subscribe_preferred_sender: () => () => undefined,
}));

vi.mock("@/hooks/use_preferred_sender_ready", () => ({
  use_preferred_sender_ready: () => true,
}));

vi.mock("@/components/compose/resolve_from_sender", async (import_original) => {
  const original =
    await import_original<
      typeof import("@/components/compose/resolve_from_sender")
    >();

  return {
    resolve_from_sender: (
      input: Parameters<typeof original.resolve_from_sender>[0],
    ) => mocks.sender_state.resolved ?? original.resolve_from_sender(input),
  };
});

vi.mock("@/services/api/contacts", () => ({
  list_contacts: () => new Promise(() => undefined),
  decrypt_contacts: () => Promise.resolve([]),
}));

vi.mock("@/lib/html_sanitizer", () => ({
  sanitize_html: (html: string) => ({ html }),
  sanitize_outgoing_html: (html: string) => html,
  repair_comment_markup: (html: string) => html,
}));

vi.mock("@/lib/forward_css_inliner", () => ({
  inline_email_css: (html: string) => html,
}));

vi.mock("@/services/scheduled_send_gate", () => ({
  check_scheduled_send: vi.fn(async () => ({
    proceed: true,
    allow_non_post_quantum: false,
  })),
}));

vi.mock("@/services/thread_service", () => ({
  get_or_create_thread_token: vi.fn(
    async (_email_id: string, existing?: string) => existing ?? "thread_new",
  ),
}));

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
}));

vi.mock("@/hooks/use_plan_limits", () => {
  const plan = { limits: null, is_feature_locked: () => false };

  return { use_plan_limits: () => plan };
});

vi.mock("@/services/api/user", () => ({
  fetch_my_badges: () => Promise.resolve({ data: [] }),
}));

vi.mock("@/stores/my_badge_prefs_store", () => ({
  use_my_badge_prefs: () => null,
}));

vi.mock("@/components/compose/compose_draft_helpers", () => ({
  attachments_to_draft_data: () => [],
  build_badge_html: () => "",
  draft_data_to_attachments: () => [],
}));

vi.mock("@/lib/overlay_layer_stack", () => ({
  use_escape_layer: () => undefined,
}));

vi.mock("@/lib/contact_trash", () => ({ is_contact_trashed: () => false }));
vi.mock("@/hooks/use_suggestion_contacts", () => ({
  use_suggestion_contacts: () => [],
}));

vi.mock("@/components/compose/compose_shared", () => ({
  EVENT_DISPATCH_DELAY_MS: 100,
  generate_attachment_id: () => "attachment",
  get_aster_footer: () => "",
  recipients_reducer: (
    state: { to: string[]; cc: string[]; bcc: string[] },
    action: { type: string; field: "to" | "cc" | "bcc"; emails?: string[] },
  ) =>
    action.type === "SET"
      ? { ...state, [action.field]: action.emails ?? [] }
      : state,
}));

vi.mock("@/components/compose/send_lock", () => ({
  SEND_LOCK_STALL_MS: 60_000,
  can_acquire_send_lock: (lock: { held: boolean }) => !lock.held,
  is_repeat_send: () => false,
  build_send_fingerprint: () => "fingerprint",
  is_duplicate_send: () => false,
  record_send: () => undefined,
  forget_send: () => undefined,
}));

vi.mock("@/components/email/build_reply_from_address", () => ({
  is_reply_from_mismatch: () => false,
  resolve_own_recipient_address: () => undefined,
}));

vi.mock("@/services/contacts_auto_save", () => ({
  auto_save_recipients_to_contacts: () => Promise.resolve(),
}));

vi.mock("@/services/api/scheduled", () => ({
  create_scheduled_email: vi.fn(),
}));

vi.mock("@/services/attachment_limits", () => ({
  MAX_ATTACHMENTS_PER_SEND: 20,
  ensure_attachment_limits: () => Promise.resolve(),
  get_max_attachment_size: () => 1,
  get_max_total_attachments_size: () => 1,
}));

vi.mock("@/services/attachment_rejection", () => ({
  describe_oversized_file: () => ({ message: "" }),
  describe_too_many_attachments: () => "",
  describe_would_exceed_total: () => "",
  prompt_attachment_upgrade: () => undefined,
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  prepare_external_attachments: () => [],
}));

vi.mock("@/lib/ignore_error", () => ({ ignore_error: () => undefined }));

const { use_reply_modal } = await import("./use_reply_modal");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type HookResult = ReturnType<typeof use_reply_modal>;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latest: HookResult | null = null;

function Harness(props: UseReplyModalProps) {
  latest = use_reply_modal(props);

  return null;
}

function base_props(overrides: Partial<UseReplyModalProps> = {}) {
  return {
    is_open: true,
    on_close: vi.fn(),
    recipient_name: "Sam",
    recipient_email: "sam@example.com",
    original_subject: "Plans",
    original_body: "<p>older text</p>",
    original_timestamp: "2026-09-01T10:00:00.000Z",
    reply_all: false,
    thread_token: "thread_1",
    original_email_id: "email_1",
    is_external: false,
    on_draft_saved: vi.fn(),
    existing_draft: null,
    ...overrides,
  };
}

async function render_hook(props: UseReplyModalProps) {
  await act(async () => {
    root!.render(<Harness {...props} />);
  });
}

async function type_reply(text: string) {
  await act(async () => {
    stable.editor_change.current(text);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function queued_send_result() {
  return {
    success: true,
    queued_id: "queue_1",
    thread_token: "thread_1",
    is_server_queued: true,
  };
}

describe("reply modal drafts around a send", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.create_draft.mockReset();
    mocks.update_draft.mockReset();
    mocks.delete_thread_draft.mockReset();
    mocks.delete_thread_draft.mockResolvedValue({ data: { success: true } });
    mocks.send_reply.mockReset();
    mocks.send_via_external_account.mockReset();
    mocks.undo_add.mockReset();
    mocks.sender_state.options = [];
    mocks.sender_state.resolved = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    latest = null;
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
  });

  it("deletes a draft whose create lands after the send", async () => {
    const create = deferred<unknown>();

    mocks.create_draft.mockReturnValue(create.promise);
    mocks.send_reply.mockResolvedValue(queued_send_result());
    const props = base_props();

    await render_hook(props);
    await type_reply("<p>See you on Friday</p>");
    await advance(1_600);

    expect(mocks.create_draft).toHaveBeenCalledTimes(1);

    await act(async () => {
      await latest!.handle_send();
    });

    await act(async () => {
      create.resolve({ data: { id: "late_draft", version: 1 } });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mocks.delete_thread_draft).toHaveBeenCalledWith(
      "late_draft",
      "thread_1",
    );
    expect(props.on_draft_saved).not.toHaveBeenCalled();
    expect(latest!.draft_id).toBeNull();
  });

  it("waits for an in-flight draft update before deleting the draft", async () => {
    const update = deferred<unknown>();

    mocks.update_draft.mockReturnValue(update.promise);
    mocks.send_reply.mockResolvedValue(queued_send_result());
    const props = base_props({
      existing_draft: {
        id: "draft_1",
        version: 1,
        reply_to_id: "email_1",
        content: {
          to_recipients: ["sam@example.com"],
          cc_recipients: [],
          bcc_recipients: [],
          subject: "Re: Plans",
          message: "<p>See you</p>",
        },
      },
    });

    await render_hook(props);
    await type_reply("<p>See you on Friday</p>");
    await advance(1_600);

    expect(mocks.update_draft).toHaveBeenCalledTimes(1);

    await act(async () => {
      await latest!.handle_send();
    });
    await advance(0);

    expect(mocks.delete_thread_draft).not.toHaveBeenCalled();

    await act(async () => {
      update.resolve({ data: { id: "draft_1", version: 2 } });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mocks.delete_thread_draft).toHaveBeenCalledTimes(1);
    expect(mocks.delete_thread_draft).toHaveBeenCalledWith(
      "draft_1",
      "thread_1",
    );
    expect(props.on_draft_saved).not.toHaveBeenCalled();
  });

  it("creates a new draft when the saved draft no longer exists", async () => {
    mocks.update_draft.mockResolvedValue({
      error: "missing",
      code: "NOT_FOUND",
    });
    mocks.create_draft.mockResolvedValue({
      data: { id: "draft_2", version: 1 },
    });
    const props = base_props({
      existing_draft: {
        id: "draft_1",
        version: 3,
        reply_to_id: "email_1",
        content: {
          to_recipients: ["sam@example.com"],
          cc_recipients: [],
          bcc_recipients: [],
          subject: "Re: Plans",
          message: "<p>See you</p>",
        },
      },
    });

    await render_hook(props);
    await type_reply("<p>See you on Friday</p>");
    await advance(1_600);

    expect(mocks.update_draft).toHaveBeenCalledTimes(1);
    expect(mocks.create_draft).toHaveBeenCalledTimes(1);
    expect(latest!.draft_id).toBe("draft_2");
    expect(latest!.draft_status).toBe("saved");
    expect(props.on_draft_saved).toHaveBeenCalledWith(
      expect.objectContaining({ id: "draft_2", version: 1 }),
    );
  });

  it("retries a draft update once with the server version", async () => {
    mocks.update_draft
      .mockResolvedValueOnce({
        error: "conflict",
        code: "CONFLICT",
        data: { id: "draft_1", version: 5 },
      })
      .mockResolvedValueOnce({ data: { id: "draft_1", version: 6 } });
    const props = base_props({
      existing_draft: {
        id: "draft_1",
        version: 3,
        reply_to_id: "email_1",
        content: {
          to_recipients: ["sam@example.com"],
          cc_recipients: [],
          bcc_recipients: [],
          subject: "Re: Plans",
          message: "<p>See you</p>",
        },
      },
    });

    await render_hook(props);
    await type_reply("<p>See you on Friday</p>");
    await advance(1_600);

    expect(mocks.update_draft).toHaveBeenCalledTimes(2);
    expect(mocks.update_draft.mock.calls[1][2]).toBe(5);
    expect(mocks.create_draft).not.toHaveBeenCalled();
    expect(latest!.draft_status).toBe("saved");
  });

  it("does not autosave while a send is in flight", async () => {
    const send = deferred<unknown>();

    mocks.send_reply.mockReturnValue(send.promise);
    const props = base_props();

    await render_hook(props);
    await type_reply("<p>See you on Friday</p>");
    await advance(500);

    let sending: Promise<void> = Promise.resolve();

    await act(async () => {
      sending = latest!.handle_send();
    });
    await advance(5_000);

    expect(mocks.create_draft).not.toHaveBeenCalled();

    await act(async () => {
      send.resolve(queued_send_result());
      await sending;
    });
    await advance(5_000);

    expect(mocks.create_draft).not.toHaveBeenCalled();
    expect(mocks.update_draft).not.toHaveBeenCalled();
  });

  it("does not save a draft when the composer closes after an external send", async () => {
    const external = {
      id: "external_1",
      email: "me@elsewhere.example",
      type: "external",
      is_enabled: true,
      address_hash: "hash_1",
    };

    mocks.sender_state.options = [external];
    mocks.sender_state.resolved = { option: external };
    mocks.send_via_external_account.mockResolvedValue({ data: {} });
    const props = base_props();

    await render_hook(props);
    await type_reply("<p>See you on Friday</p>");

    await act(async () => {
      await latest!.handle_send();
    });

    expect(mocks.send_via_external_account).toHaveBeenCalledTimes(1);
    expect(props.on_close).toHaveBeenCalled();

    await render_hook({ ...props, is_open: false });
    await advance(5_000);

    expect(mocks.create_draft).not.toHaveBeenCalled();
    expect(mocks.update_draft).not.toHaveBeenCalled();
  });
  it("sends visible text after switching a formatted reply to plain text", async () => {
    mocks.send_reply.mockResolvedValue(queued_send_result());
    await render_hook(base_props());
    const element = document.createElement("div");

    element.innerHTML = "<b>Meet at 10</b>";
    Object.assign(latest!.message_editor_ref, { current: element });
    await type_reply(element.innerHTML);
    await act(async () => latest!.toggle_plain_text_mode());

    expect(latest!.reply_message).toBe("Meet at 10");
    expect(element.querySelector("b")).toBeNull();
    await act(async () => {
      await latest!.handle_send();
    });
    expect(mocks.send_reply.mock.calls[0][0].message).toContain("Meet at 10");
    expect(mocks.send_reply.mock.calls[0][0].message).not.toContain(
      "&lt;b&gt;",
    );
  });

  it("sends a plain text reply with the original quoted as text", async () => {
    mocks.send_reply.mockResolvedValue(queued_send_result());
    await render_hook(
      base_props({ original_body: "<p>older <b>text</b></p><p>more</p>" }),
    );
    const element = document.createElement("div");

    Object.assign(latest!.message_editor_ref, { current: element });
    await act(async () => latest!.toggle_plain_text_mode());
    Object.defineProperty(element, "innerText", {
      configurable: true,
      writable: true,
      value: "Sounds good",
    });
    await type_reply(element.innerText);
    await act(async () => {
      await latest!.handle_send();
    });

    const params = mocks.send_reply.mock.calls[0][0];

    expect(params.is_plain_text).toBe(true);
    expect(params.message).toContain("&gt; older text<br>&gt; more");
    expect(params.message).not.toContain("<blockquote");
    expect(params.message).not.toContain("<b>");
  });

  it("keeps the html quote and no plain flag for a rich reply", async () => {
    mocks.send_reply.mockResolvedValue(queued_send_result());
    await render_hook(base_props());
    await type_reply("Sounds good");
    await act(async () => {
      await latest!.handle_send();
    });

    const params = mocks.send_reply.mock.calls[0][0];

    expect(params.is_plain_text).toBeFalsy();
    expect(params.message).toContain("<blockquote");
  });

  it("keeps literal markup and line breaks when switching back to rich text", async () => {
    await render_hook(base_props());
    const element = document.createElement("div");

    Object.assign(latest!.message_editor_ref, { current: element });
    await act(async () => latest!.toggle_plain_text_mode());
    Object.defineProperty(element, "innerText", {
      configurable: true,
      writable: true,
      value: "Use <project> & check\nThen restart.",
    });
    await type_reply(element.innerText);
    await act(async () => latest!.toggle_plain_text_mode());

    expect(latest!.is_plain_text_mode).toBe(false);
    expect(latest!.reply_message).toBe(
      "Use &lt;project&gt; &amp; check<br>Then restart.",
    );
    expect(element.querySelector("project")).toBeNull();
    expect(element.querySelectorAll("br")).toHaveLength(1);
  });

  it("selects the catch-all delivery address and preserves it in a draft", async () => {
    const primary = {
      id: "primary",
      email: "me@astermail.org",
      type: "primary",
      is_enabled: true,
    };
    const received = {
      id: "catch-all-d1-shopping",
      email: "shopping@my.example",
      type: "domain",
      is_enabled: true,
      is_catch_all: true,
    };

    mocks.sender_state.options = [primary, received];
    mocks.create_draft.mockResolvedValue({
      data: { id: "draft_1", version: 1 },
    });
    await render_hook(
      base_props({
        reply_from_address: received.email,
        original_to: ["deals@lists.example"],
      }),
    );
    expect(latest!.selected_sender?.email).toBe(received.email);
    await type_reply("<p>Thanks!</p>");
    await advance(1600);
    expect(mocks.create_draft.mock.calls[0][0].from_email).toBe(received.email);
  });

  it("keeps a saved address in To ahead of a catch-all delivery address", async () => {
    const primary = {
      id: "primary",
      email: "me@astermail.org",
      type: "primary",
      is_enabled: true,
    };
    const received = {
      id: "catch-all-d1-shopping",
      email: "shopping@my.example",
      type: "domain",
      is_enabled: true,
      is_catch_all: true,
    };

    mocks.sender_state.options = [primary, received];
    await render_hook(
      base_props({
        reply_from_address: received.email,
        original_to: [primary.email],
      }),
    );
    expect(latest!.selected_sender?.email).toBe(primary.email);
  });

  it.each([{ is_catch_all: true }, { is_catch_all: false }])(
    "keeps a reply refused after the undo window as a draft: %j",
    async ({ is_catch_all }) => {
      const { show_toast } = await import("@/components/toast/simple_toast");
      const sender = {
        id: is_catch_all ? "catch-all-d1-shopping" : "domain-a1",
        email: "shopping@my.example",
        type: "domain",
        is_enabled: true,
        address_hash: is_catch_all ? undefined : "hash_1",
        is_catch_all,
      };
      let fail: (error: string) => void = () => undefined;

      vi.mocked(show_toast).mockClear();
      mocks.sender_state.options = [sender];
      mocks.create_draft.mockResolvedValue({
        data: { id: "draft_2", version: 1 },
      });
      mocks.send_reply.mockImplementation(
        async (_params, callbacks: { on_error: (error: string) => void }) => {
          fail = callbacks.on_error;

          return queued_send_result();
        },
      );
      const props = base_props({ reply_from_address: sender.email });

      await render_hook(props);
      await type_reply("<p>Thanks!</p>");
      await act(async () => {
        await latest!.handle_send();
      });
      expect(props.on_close).toHaveBeenCalled();
      expect(mocks.send_reply.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          sender_email: sender.email,
          sender_alias_hash: sender.address_hash,
        }),
      );
      expect(mocks.undo_add).toHaveBeenCalledWith(
        expect.objectContaining({ sender_email: sender.email }),
      );
      await act(async () => fail("Sender not allowed"));
      await advance(0);

      expect(mocks.create_draft).toHaveBeenCalledTimes(1);
      expect(mocks.create_draft.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          from_email: sender.email,
          message: "<p>Thanks!</p>",
          to_recipients: ["sam@example.com"],
        }),
      );
      expect(mocks.create_draft.mock.calls[0].slice(2)).toEqual([
        "reply",
        "email_1",
        undefined,
        "thread_1",
      ]);
      expect(show_toast).toHaveBeenCalledWith(
        "Sender not allowed",
        "error",
        10000,
      );
      expect(show_toast).not.toHaveBeenCalledWith(
        "common.failed_to_save",
        "error",
      );
    },
  );

  async function send_and_capture_callbacks() {
    const callbacks: {
      on_complete?: (sent_id?: string) => void;
      on_error?: (error: string) => void;
    } = {};

    mocks.send_reply.mockImplementation(async (_params, given) => {
      Object.assign(callbacks, given);

      return queued_send_result();
    });
    const props = base_props();

    await render_hook(props);
    await type_reply("<p>See you on Friday</p>");
    await act(async () => {
      await latest!.handle_send();
    });
    expect(props.on_close).toHaveBeenCalled();
    mocks.create_draft.mockClear();

    return callbacks;
  }

  it("puts a failed reply from the primary address back in its thread's drafts", async () => {
    const { show_toast } = await import("@/components/toast/simple_toast");

    vi.mocked(show_toast).mockClear();
    mocks.create_draft.mockResolvedValue({
      data: { id: "draft_2", version: 1 },
    });
    const callbacks = await send_and_capture_callbacks();

    await act(async () => callbacks.on_error!(""));
    await advance(0);

    expect(mocks.create_draft).toHaveBeenCalledTimes(1);
    expect(mocks.create_draft.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        message: "<p>See you on Friday</p>",
        subject: "mail.reply_subject_prefix Plans",
        to_recipients: ["sam@example.com"],
        cc_recipients: [],
      }),
    );
    expect(mocks.create_draft.mock.calls[0].slice(2)).toEqual([
      "reply",
      "email_1",
      undefined,
      "thread_1",
    ]);
    expect(show_toast).toHaveBeenCalledWith(
      "common.failed_to_send_reply",
      "error",
      10000,
    );
  });

  it("says so when a failed reply cannot be saved as a draft", async () => {
    const { show_toast } = await import("@/components/toast/simple_toast");

    vi.mocked(show_toast).mockClear();
    mocks.create_draft.mockResolvedValue({ error: "offline" });
    const callbacks = await send_and_capture_callbacks();

    await act(async () => callbacks.on_error!("Server unavailable"));
    await advance(0);

    expect(mocks.create_draft).toHaveBeenCalledTimes(1);
    expect(show_toast).toHaveBeenCalledWith("common.failed_to_save", "error");
  });

  it("does not create a draft when a queued reply sends", async () => {
    mocks.create_draft.mockResolvedValue({
      data: { id: "draft_2", version: 1 },
    });
    const callbacks = await send_and_capture_callbacks();

    await act(async () => callbacks.on_complete!("sent_1"));
    await advance(5_000);

    expect(mocks.create_draft).not.toHaveBeenCalled();
  });

  it("schedules a catch-all reply with the literal From and no address hash", async () => {
    const { create_scheduled_email } = await import("@/services/api/scheduled");
    const sender = {
      id: "catch-all-d1-shopping",
      email: "shopping@my.example",
      type: "domain",
      is_enabled: true,
      is_catch_all: true,
    };

    vi.mocked(create_scheduled_email).mockResolvedValue({
      data: { id: "s1", scheduled_at: "x", success: true },
    } as never);
    mocks.sender_state.options = [sender];
    await render_hook(base_props({ reply_from_address: sender.email }));
    await type_reply("<p>Thanks!</p>");
    await act(async () =>
      latest!.set_scheduled_time(new Date("2030-01-01T09:00:00.000Z")),
    );
    await act(async () => {
      await latest!.handle_scheduled_send();
    });

    expect(create_scheduled_email).toHaveBeenCalledWith(
      stable.auth.vault,
      expect.objectContaining({ from: { name: "", email: sender.email } }),
      expect.objectContaining({
        sender_email: sender.email,
        allow_non_post_quantum: false,
      }),
    );
  });

  it("schedules a reply from a saved alias with its From and address hash", async () => {
    const { create_scheduled_email } = await import("@/services/api/scheduled");
    const sender = {
      id: "alias-1",
      email: "orders@alias.example",
      type: "alias",
      is_enabled: true,
      address_hash: "hash-1",
    };

    vi.mocked(create_scheduled_email).mockResolvedValue({
      data: { id: "s2", scheduled_at: "x", success: true },
    } as never);
    mocks.sender_state.options = [sender];
    await render_hook(base_props({ reply_from_address: sender.email }));
    await type_reply("<p>Thanks!</p>");
    await act(async () =>
      latest!.set_scheduled_time(new Date("2030-01-01T09:00:00.000Z")),
    );
    await act(async () => {
      await latest!.handle_scheduled_send();
    });

    expect(create_scheduled_email).toHaveBeenCalledWith(
      stable.auth.vault,
      expect.objectContaining({ from: { name: "", email: sender.email } }),
      expect.objectContaining({
        sender_alias_hash: "hash-1",
        sender_email: sender.email,
        allow_non_post_quantum: false,
      }),
    );
  });

  it("refuses to schedule a reply from a connected account", async () => {
    const { create_scheduled_email } = await import("@/services/api/scheduled");
    const sender = {
      id: "account-1",
      email: "me@connected.example",
      type: "external",
      is_enabled: true,
      address_hash: "account-token",
    };

    vi.mocked(create_scheduled_email).mockClear();
    vi.mocked(create_scheduled_email).mockResolvedValue({
      data: { id: "s4", scheduled_at: "x", success: true },
    } as never);
    mocks.sender_state.options = [sender];
    await render_hook(base_props({ reply_from_address: sender.email }));
    await type_reply("<p>Thanks!</p>");
    await act(async () =>
      latest!.set_scheduled_time(new Date("2030-01-01T09:00:00.000Z")),
    );
    await act(async () => {
      await latest!.handle_scheduled_send();
    });

    expect(create_scheduled_email).not.toHaveBeenCalled();
    expect(latest!.error_message).toBe("common.scheduled_connected_account");
  });

  it("schedules a reply that stays in the original thread", async () => {
    const { create_scheduled_email } = await import("@/services/api/scheduled");

    vi.mocked(create_scheduled_email).mockClear();
    vi.mocked(create_scheduled_email).mockResolvedValue({
      data: { id: "s3", scheduled_at: "x", success: true },
    } as never);
    await render_hook(
      base_props({ original_rfc_message_id: "<original@example.com>" }),
    );
    await type_reply("<p>Thanks!</p>");
    await act(async () =>
      latest!.set_scheduled_time(new Date("2030-01-01T09:00:00.000Z")),
    );
    await act(async () => {
      await latest!.handle_scheduled_send();
    });

    const content = vi.mocked(create_scheduled_email).mock.calls[0][1];

    expect(content.in_reply_to).toBe("<original@example.com>");
    expect(content.thread_id).toBe("thread_1");
    expect(content.from).toBeUndefined();
  });

  it("restores the draft sender ahead of the delivery address", async () => {
    const received = {
      id: "catch-all-d1-shopping",
      email: "shopping@my.example",
      type: "domain",
      is_enabled: true,
      is_catch_all: true,
    };
    const restored = {
      ...received,
      id: "catch-all-d1-billing",
      email: "billing@my.example",
    };

    mocks.sender_state.options = [received, restored];
    await render_hook(
      base_props({
        reply_from_address: received.email,
        existing_draft: {
          id: "draft_1",
          version: 1,
          reply_to_id: "email_1",
          content: {
            to_recipients: ["sam@example.com"],
            cc_recipients: [],
            bcc_recipients: [],
            subject: "Re: Plans",
            message: "<p>Thanks!</p>",
            from_email: restored.email,
          },
        },
      }),
    );
    expect(latest!.selected_sender?.email).toBe(restored.email);
  });
  it("saves a manual sender change even when the reply text is unchanged", async () => {
    const received = {
      id: "catch-all-d1-shopping",
      email: "shopping@my.example",
      type: "domain",
      is_enabled: true,
      is_catch_all: true,
    };
    const primary = {
      id: "primary",
      email: "me@astermail.org",
      type: "primary",
      is_enabled: true,
    };

    mocks.sender_state.options = [primary, received];
    mocks.create_draft.mockResolvedValue({
      data: { id: "draft_1", version: 1 },
    });
    mocks.update_draft.mockResolvedValue({
      data: { id: "draft_1", version: 2 },
    });
    await render_hook(base_props({ reply_from_address: received.email }));
    await type_reply("<p>Thanks!</p>");
    await advance(1600);
    await act(async () =>
      latest!.set_selected_sender(
        primary as Parameters<HookResult["set_selected_sender"]>[0],
      ),
    );
    await advance(1600);
    expect(latest!.selected_sender?.email).toBe(primary.email);
    expect(mocks.update_draft.mock.calls.at(-1)![1].from_email).toBe(
      primary.email,
    );
  });

  describe("plain text drafts", () => {
    const typed =
      "Use <project> & \"quotes\" 'here'\n\n  indented\ttab\n&amp; stays";
    const stored =
      "Use &lt;project&gt; &amp; &quot;quotes&quot; &#039;here&#039;<br><br>  indented\ttab<br>&amp;amp; stays";

    async function type_plain(text: string) {
      const element = document.createElement("div");

      Object.assign(latest!.message_editor_ref, { current: element });
      await act(async () => latest!.toggle_plain_text_mode());
      Object.defineProperty(element, "innerText", {
        configurable: true,
        writable: true,
        value: text,
      });
      await type_reply(text);

      return element;
    }

    it("saves the typed text escaped with line breaks, like the compose window", async () => {
      mocks.create_draft.mockResolvedValue({
        data: { id: "draft_1", version: 1 },
      });
      await render_hook(base_props());
      await type_plain(typed);
      await advance(1_600);

      expect(mocks.create_draft).toHaveBeenCalledTimes(1);
      expect(mocks.create_draft.mock.calls[0][0]).toMatchObject({
        message: stored,
        is_plain_text: true,
      });
    });

    it("reopens a saved plain draft in plain mode with the text as typed", async () => {
      mocks.create_draft.mockResolvedValue({
        data: { id: "draft_1", version: 1 },
      });
      await render_hook(base_props());
      await type_plain(typed);
      await advance(1_600);

      const saved = mocks.create_draft.mock.calls[0][0];

      await act(async () => root!.unmount());
      root = createRoot(container!);
      mocks.create_draft.mockClear();
      await render_hook(
        base_props({
          existing_draft: {
            id: "draft_1",
            version: 1,
            reply_to_id: "email_1",
            content: saved,
          },
        }),
      );
      const element = document.createElement("div");

      Object.defineProperty(element, "innerText", {
        configurable: true,
        writable: true,
        value: "",
      });
      Object.assign(latest!.message_editor_ref, { current: element });
      await advance(0);

      expect(latest!.is_plain_text_mode).toBe(true);
      expect(element.innerText).toBe(typed);
      expect(latest!.reply_message).toBe(typed);

      await advance(1_600);

      expect(mocks.create_draft).not.toHaveBeenCalled();
      expect(mocks.update_draft).not.toHaveBeenCalled();

      mocks.update_draft.mockResolvedValue({ data: { version: 2 } });
      await type_reply(`${typed}\nmore`);
      await advance(1_600);

      expect(mocks.update_draft.mock.calls[0][1]).toMatchObject({
        message: `${stored}<br>more`,
        is_plain_text: true,
      });
    });

    it("keeps a rich draft's html and leaves it unmarked", async () => {
      mocks.create_draft.mockResolvedValue({
        data: { id: "draft_1", version: 1 },
      });
      await render_hook(base_props());
      await type_reply("<p>See <b>you</b></p>");
      await advance(1_600);

      expect(mocks.create_draft.mock.calls[0][0].message).toBe(
        "<p>See <b>you</b></p>",
      );
      expect(mocks.create_draft.mock.calls[0][0].is_plain_text).toBeUndefined();
    });

    it("saves a reply that fails after the send in the same encoding", async () => {
      mocks.create_draft.mockResolvedValue({
        data: { id: "kept", version: 1 },
      });
      mocks.send_reply.mockImplementation(
        async (
          _params: unknown,
          callbacks: { on_error: (error: string) => void },
        ) => {
          setTimeout(() => callbacks.on_error("failed"), 10);

          return queued_send_result();
        },
      );
      await render_hook(base_props());
      await type_plain(typed);
      await act(async () => {
        await latest!.handle_send();
      });
      mocks.create_draft.mockClear();
      await advance(20);

      expect(mocks.create_draft).toHaveBeenCalledTimes(1);
      expect(mocks.create_draft.mock.calls[0][0]).toMatchObject({
        message: stored,
        is_plain_text: true,
      });
    });
  });
});
