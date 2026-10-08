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
import type { UseForwardModalProps } from "./use_forward_modal/helpers";
import type { DecryptedSignature } from "@/services/api/signatures";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { format_signature_html } from "@/lib/signature_html";

const mocks = vi.hoisted(() => ({
  create_draft: vi.fn(),
  update_draft: vi.fn(),
  editor_change: { current: (_html: string): void => undefined },
}));

const stable = vi.hoisted(() => ({
  i18n: { t: (key: string) => key },
  footer: '<br><br>Secured by <a href="https://astermail.org">Aster Mail</a>',
  preferences: {
    signature_mode: "auto",
    show_aster_branding: true,
    show_badges_in_signature: false,
    show_signature_separator: true,
    undo_send_enabled: true,
    undo_send_seconds: 10,
    undo_send_period: "seconds",
    auto_save_recent_recipients: false,
    signature_placement: "below",
    compose_mode: "rich_text" as string,
  },
  auth: {
    user: { email: "me@astermail.org", username: "me", display_name: "Me" },
    vault: { key: "vault" },
  },
  signatures: {
    signatures: [] as unknown[],
    default_signature: null as unknown,
    is_loading: true,
    get_formatted_signature: (_signature: unknown): string => "",
    resolve_signature: (alias_id: string | null): unknown =>
      (stable.signatures.signatures as { alias_id: string | null }[]).find(
        (s) => alias_id !== null && s.alias_id === alias_id,
      ) ?? null,
  },
  sender: { sender_options: [] as unknown[], loading: false },
  resolved_sender: null as unknown,
  ghost: { is_ghost_enabled: false },
  contacts: [] as unknown[],
  plan: { limits: null, is_feature_locked: () => false },
  editor: {
    format_state: { active_formats: new Set<string>() },
    is_mac: false,
    exec_format: () => undefined,
    insert_text: () => undefined,
  },
}));

vi.mock("@/hooks/use_editor", () => ({
  use_editor: (options: { on_change: (html: string) => void }) => {
    mocks.editor_change.current = options.on_change;

    return stable.editor;
  },
}));

vi.mock("@/services/api/multi_drafts", () => ({
  create_draft: mocks.create_draft,
  update_draft: mocks.update_draft,
  delete_thread_draft: vi.fn(),
}));

vi.mock("@/services/mail_actions", () => ({
  send_forward: vi.fn(),
  build_reply_recipients: (params: { original: { sender_email: string } }) => ({
    to: [params.original.sender_email],
    cc: [],
  }),
}));

vi.mock("@/contexts/auth_context", () => ({ use_auth: () => stable.auth }));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: stable.preferences }),
}));

vi.mock("@/contexts/signatures_context", () => ({
  use_signatures: () => stable.signatures,
}));

vi.mock("@/lib/i18n/context", () => ({ use_i18n: () => stable.i18n }));

vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));

vi.mock("@/hooks/use_draggable_modal", () => ({
  use_draggable_modal: () => ({
    handle_drag_start: () => undefined,
    get_position_style: () => ({}),
  }),
}));

vi.mock("@/hooks/use_sender_aliases", () => ({
  use_sender_aliases: () => stable.sender,
  is_signature_bindable_sender_type: (type: string) =>
    ["alias", "domain", "ghost"].includes(type),
}));

vi.mock("@/hooks/use_ghost_mode", () => ({
  use_ghost_mode: () => stable.ghost,
}));

vi.mock("@/hooks/use_ghost_sender_binding", () => ({
  use_ghost_sender_binding:
    (_ghost: unknown, _sender: unknown, set: (value: unknown) => void) =>
    (value: unknown) =>
      set(value),
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
  resolve_from_sender: () =>
    stable.resolved_sender ? { option: stable.resolved_sender } : null,
}));

vi.mock("@/hooks/use_suggestion_contacts", () => ({
  use_suggestion_contacts: () => stable.contacts,
}));

vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => stable.plan,
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

vi.mock("@/components/compose/compose_shared", () => ({
  EVENT_DISPATCH_DELAY_MS: 100,
  MAX_INLINE_IMAGES: 10,
  MAX_INLINE_IMAGE_SIZE: 1,
  MAX_TOTAL_INLINE_SIZE: 1,
  generate_attachment_id: () => "attachment",
  get_aster_footer: () => stable.footer,
  is_valid_email: () => false,
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
  can_acquire_send_lock: () => true,
}));

vi.mock("@/components/compose/expiry_plan_gate", () => ({
  find_locked_expiry_feature: () => null,
  prompt_expiry_upgrade: () => undefined,
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

vi.mock("@/hooks/use_undo_send", () => ({
  undo_send_manager: { add: vi.fn() },
  store_pending_send_payload: vi.fn(),
}));

vi.mock("@/services/send_queue", () => ({
  get_undo_send_delay_ms: () => 10_000,
}));

vi.mock("@/hooks/mail_events", () => ({
  emit_email_sent: vi.fn(),
  emit_scheduled_changed: vi.fn(),
}));

vi.mock("@/services/api/scheduled", () => ({
  create_scheduled_email: vi.fn(),
}));

vi.mock("@/services/api/external_accounts", () => ({
  send_via_external_account: vi.fn(),
}));

vi.mock("@/services/api/attachments", () => ({ list_attachments: vi.fn() }));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  decrypt_attachment_meta: vi.fn(),
  decrypt_attachment_data: vi.fn(),
  prepare_external_attachments: () => [],
}));

vi.mock("@/services/forward_store", () => ({
  get_forward_mail_id: () => null,
  clear_forward_mail_id: () => undefined,
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

vi.mock("@/services/contacts_auto_save", () => ({
  auto_save_recipients_to_contacts: () => Promise.resolve(),
}));

vi.mock("@/services/iconic_sounds", () => ({ play_iconic_sound: vi.fn() }));

vi.mock("@/lib/review_prompt", () => ({
  record_review_prompt_action: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/components/toast/email_sent_toast", () => ({
  show_email_sent_toast: vi.fn(),
}));

vi.mock("@/lib/overlay_layer_stack", () => ({
  use_escape_layer: () => undefined,
}));

vi.mock("@/lib/ignore_error", () => ({ ignore_error: () => undefined }));

const { use_reply_modal_state } = await import("./use_reply_modal_state");
const { use_forward_modal } = await import("./use_forward_modal");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const signature: DecryptedSignature = {
  id: "sig_1",
  name: "Work",
  content: "Sam Doe",
  is_default: true,
  is_html: false,
  alias_id: null,
  placement: null,
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-01T10:00:00.000Z",
};
stable.signatures.get_formatted_signature = (value) =>
  format_signature_html(value as DecryptedSignature | null, true);

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let reply: ReturnType<typeof use_reply_modal_state> | null = null;
let forward: ReturnType<typeof use_forward_modal> | null = null;

function ReplyHarness(props: UseReplyModalProps) {
  reply = use_reply_modal_state(props);

  return (
    <div
      ref={reply.message_editor_ref}
      contentEditable
      suppressContentEditableWarning
    />
  );
}

function ForwardHarness(props: UseForwardModalProps) {
  forward = use_forward_modal(props);

  return (
    <div
      ref={forward.message_editor_ref}
      contentEditable
      suppressContentEditableWarning
    />
  );
}

function reply_props(): UseReplyModalProps {
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
  };
}

function forward_props(): UseForwardModalProps {
  return {
    is_open: true,
    on_close: vi.fn(),
    sender_name: "Sam",
    sender_email: "sam@example.com",
    email_subject: "Plans",
    email_body: "<p>older text</p>",
    email_timestamp: "2026-09-01T10:00:00.000Z",
    is_external: false,
  };
}

async function render_reply(props: UseReplyModalProps) {
  await act(async () => {
    root!.render(<ReplyHarness {...props} />);
  });
}

async function render_forward(props: UseForwardModalProps) {
  await act(async () => {
    root!.render(<ForwardHarness {...props} />);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function finish_signature_load(default_signature: DecryptedSignature | null) {
  stable.signatures.is_loading = false;
  stable.signatures.default_signature = default_signature;
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.create_draft.mockReset();
  mocks.update_draft.mockReset();
  stable.signatures.is_loading = true;
  stable.signatures.default_signature = null;
  stable.signatures.signatures = [];
  stable.sender = { sender_options: [], loading: false };
  stable.resolved_sender = null;
  stable.preferences.compose_mode = "rich_text";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  reply = null;
  forward = null;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

async function open_reply(reply_all = false) {
  finish_signature_load(signature);
  await render_reply({ ...reply_props(), reply_all });
  await advance(0);
}

async function open_forward() {
  finish_signature_load(signature);
  await render_forward(forward_props());
  await advance(0);
}

describe("reply window format when it opens", () => {
  it.each([false, true])(
    "starts in rich text by default (reply all: %s)",
    async (reply_all) => {
      await open_reply(reply_all);

      expect(reply!.is_plain_text_mode).toBe(false);
      expect(reply!.reply_message).toContain("<");
    },
  );

  it.each([false, true])(
    "starts in plain text when that is the default (reply all: %s)",
    async (reply_all) => {
      stable.preferences.compose_mode = "plain_text";
      await open_reply(reply_all);

      expect(reply!.is_plain_text_mode).toBe(true);
      expect(reply!.reply_message).toContain("Sam Doe");
      expect(reply!.reply_message).not.toContain("<");
      expect(
        reply!.message_editor_ref.current!.querySelector(
          "[data-aster-signature]",
        ),
      ).toBeNull();
    },
  );

  it("goes back to the default on the next reply after a switch", async () => {
    stable.preferences.compose_mode = "plain_text";
    const props = reply_props();

    await open_reply();
    await act(async () => reply!.set_is_plain_text_mode(false));
    expect(reply!.is_plain_text_mode).toBe(false);

    await render_reply({ ...props, is_open: false });
    await render_reply(props);
    await advance(0);

    expect(reply!.is_plain_text_mode).toBe(true);
  });

  it("reopens a saved rich text reply draft in rich text", async () => {
    stable.preferences.compose_mode = "plain_text";
    finish_signature_load(signature);
    await render_reply({
      ...reply_props(),
      existing_draft: {
        id: "draft_1",
        version: 1,
        reply_to_id: "email_1",
        content: {
          to_recipients: ["sam@example.com"],
          cc_recipients: [],
          bcc_recipients: [],
          subject: "Re: Plans",
          message: "<p><b>Saved</b> reply</p>",
        },
      } as never,
    });
    await advance(0);

    expect(reply!.is_plain_text_mode).toBe(false);
    expect(reply!.reply_message).toContain("<b>Saved</b>");
  });

  it("reopens a saved plain text reply draft in plain text", async () => {
    finish_signature_load(signature);
    await render_reply({
      ...reply_props(),
      existing_draft: {
        id: "draft_1",
        version: 1,
        reply_to_id: "email_1",
        content: {
          to_recipients: ["sam@example.com"],
          cc_recipients: [],
          bcc_recipients: [],
          subject: "Re: Plans",
          message: "Saved &lt;plain&gt; reply",
          is_plain_text: true,
        },
      } as never,
    });
    await advance(0);

    expect(reply!.is_plain_text_mode).toBe(true);
    expect(reply!.reply_message).toBe("Saved <plain> reply");
  });
});

describe("forward window format when it opens", () => {
  it("starts in rich text by default", async () => {
    await open_forward();

    expect(forward!.is_plain_text_mode).toBe(false);
    expect(forward!.forward_message).toContain("<");
  });

  it("starts in plain text when that is the default", async () => {
    stable.preferences.compose_mode = "plain_text";
    await open_forward();

    expect(forward!.is_plain_text_mode).toBe(true);
    expect(forward!.forward_message).toContain("Sam Doe");
    expect(forward!.forward_message).not.toContain("<");
    expect(
      forward!.message_editor_ref.current!.querySelector(
        "[data-aster-signature]",
      ),
    ).toBeNull();
  });

  it("still lets the toolbar switch this forward to rich text", async () => {
    stable.preferences.compose_mode = "plain_text";
    await open_forward();

    await act(async () => forward!.toggle_plain_text_mode());

    expect(forward!.is_plain_text_mode).toBe(false);
    expect(stable.preferences.compose_mode).toBe("plain_text");

    await render_forward({ ...forward_props(), is_open: false });
    await render_forward(forward_props());
    await advance(0);

    expect(forward!.is_plain_text_mode).toBe(true);
  });
});
