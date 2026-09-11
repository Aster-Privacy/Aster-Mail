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
}));

vi.mock("@/hooks/use_ghost_mode", () => ({
  use_ghost_mode: () => stable.ghost,
}));

vi.mock("@/hooks/use_ghost_sender_binding", () => ({
  use_ghost_sender_binding: () => () => undefined,
}));

vi.mock("@/lib/preferred_sender", () => ({
  get_preferred_sender_id: () => null,
  set_preferred_sender_id: () => undefined,
  subscribe_preferred_sender: () => () => undefined,
}));

vi.mock("@/hooks/use_preferred_sender_ready", () => ({
  use_preferred_sender_ready: () => true,
}));

vi.mock("@/components/compose/resolve_from_sender", () => ({
  resolve_from_sender: () => mocks.sender_state.resolved,
}));

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

vi.mock("@/services/lockdown_store", () => ({
  is_any_lockdown_active: () => false,
}));

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
});
