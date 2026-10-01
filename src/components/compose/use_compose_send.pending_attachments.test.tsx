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
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  t: (key: string) => key,
  preferences: { encrypt_emails: false },
  user: { email: "me@astermail.org" },
  vault: {},
  send: vi.fn(),
  schedule: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/i18n/context", () => ({ use_i18n: () => ({ t: mocks.t }) }));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: mocks.preferences }),
}));
vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: mocks.user, vault: mocks.vault }),
}));
vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ limits: {}, is_feature_locked: () => false }),
}));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: mocks.toast }));
vi.mock("@/services/contacts_auto_save", () => ({
  auto_save_recipients_to_contacts: vi.fn(),
}));
vi.mock("@/services/api/contact_history", () => ({
  log_contact_activity: vi.fn(),
}));
vi.mock("@/services/thread_service", () => ({
  get_or_create_thread_token: vi.fn(),
}));
vi.mock("@/services/recipient_classification", () => ({
  classify_recipients: async () => {},
  is_internal_recipient: () => true,
}));
vi.mock("@/services/crypto/encrypted_drafts", () => ({ draft_manager: {} }));
vi.mock("@/services/api/scheduled", () => ({
  create_scheduled_email: mocks.schedule,
}));
vi.mock("@/native/capacitor_bridge", () => ({
  get_network_status: async () => ({ connected: true }),
  is_native_platform: () => false,
}));
vi.mock("@/native/offline_queue", () => ({ enqueue_action: vi.fn() }));
vi.mock("@/services/crypto/envelope", () => ({ array_to_base64: vi.fn() }));
vi.mock("@/components/compose/compose_send_actions", () => ({
  execute_internal_send: mocks.send,
  execute_external_email_send: mocks.send,
  execute_external_account_email_send: mocks.send,
}));
vi.mock("@/services/key_trust_consent", () => ({
  ensure_external_key_trust: async () => true,
}));
vi.mock("@/components/compose/compose_failed_send_draft", () => ({
  save_failed_send_as_draft: vi.fn(),
}));
vi.mock("@/services/post_quantum_consent", () => ({
  ensure_post_quantum_consent: async () => ({ proceed: true }),
}));
vi.mock("@/components/compose/expiry_plan_gate", () => ({
  find_locked_expiry_feature: () => null,
  prompt_expiry_upgrade: vi.fn(),
}));
import {
  use_compose_send,
  type UseComposeSendReturn,
  type UseComposeSendOptions,
} from "./use_compose_send";
import { reset_recent_sends } from "./send_lock";
let root: Root;
let hook: UseComposeSendReturn;
let options: UseComposeSendOptions;
function Probe() {
  attachment_hook = use_compose_attachments();
  hook = use_compose_send({
    ...options,
    attachments: attachment_hook.attachments,
    has_pending_attachment_reads: () =>
      attachment_hook.has_pending_attachment_reads?.() ?? false,
  });
  return null;
}
async function render() {
  await act(async () => root.render(<Probe />));
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
  reset_recent_sends();
  mocks.send.mockReset();
  mocks.send.mockResolvedValue(true);
  mocks.schedule.mockReset();
  mocks.schedule.mockResolvedValue({ data: { id: "scheduled-1" } });
  mocks.toast.mockClear();
  options = {
    recipients: { to: ["alice@astermail.org"], cc: [], bcc: [] },
    subject: "Report",
    message: "Hello",
    attachments: [],
    contacts: [],
    selected_sender: {
      id: "primary",
      type: "primary",
      email: "me@astermail.org",
      is_enabled: true,
    },
    has_external_recipients: false,
    expires_at: null,
    expiry_password: null,
    scheduled_time: null,
    session_storage_key: "compose-test",
    on_close: vi.fn(),
    reset_form: vi.fn(),
    clear_all_errors: vi.fn(),
    set_is_scheduling: vi.fn(),
    is_sending_ref: { current: false },
    save_timer_ref: { current: null },
    draft_context_id_ref: { current: null },
  };
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
});

vi.mock("@/services/attachment_limits", () => ({
  MAX_ATTACHMENTS_PER_SEND: 20,
  ensure_attachment_limits: async () => {},
  get_max_attachment_size: () => 1e8,
  get_max_total_attachments_size: () => 1e8,
}));
vi.mock("@/services/attachment_rejection", () => ({
  describe_oversized_file: vi.fn(),
  describe_too_many_attachments: vi.fn(),
  describe_would_exceed_total: vi.fn(),
  prompt_attachment_upgrade: vi.fn(),
}));
vi.mock("@/lib/strip_image_metadata", () => ({ strip_metadata: vi.fn() }));
import {
  use_compose_attachments,
  type UseComposeAttachmentsReturn,
} from "./use_compose_attachments";
let attachment_hook: UseComposeAttachmentsReturn;

it.each(["picker", "drop"] as const)(
  "waits for files from the %s before handing off a send",
  async (source) => {
    await render();
    let release!: (data: ArrayBuffer) => void;
    const file = {
      name: "report.txt",
      type: "text/plain",
      size: 5,
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((resolve) => {
          release = resolve;
        }),
    } as File;
    let pending!: Promise<void>;
    await act(async () => {
      pending =
        source === "drop"
          ? attachment_hook.handle_files_drop([file])
          : Promise.resolve(
              attachment_hook.handle_file_select({
                target: { files: [file] },
              } as never),
            );
    });
    await act(async () => hook.handle_send());
    expect(mocks.send).not.toHaveBeenCalled();
    await act(async () => {
      release(new TextEncoder().encode("hello").buffer);
      await pending;
    });
    await act(async () => hook.handle_send());
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][1].attachments).toHaveLength(1);
  },
);
it("does not clear the loading guard when only one of two reads finishes", async () => {
  await render();
  let release_first!: (data: ArrayBuffer) => void;
  let release_second!: (data: ArrayBuffer) => void;
  const first = {
    name: "first.txt",
    type: "text/plain",
    size: 1,
    arrayBuffer: () =>
      new Promise<ArrayBuffer>((r) => {
        release_first = r;
      }),
  } as File;
  const second = {
    name: "second.txt",
    type: "text/plain",
    size: 1,
    arrayBuffer: () =>
      new Promise<ArrayBuffer>((r) => {
        release_second = r;
      }),
  } as File;
  let first_read!: Promise<void>;
  let second_read!: Promise<void>;
  await act(async () => {
    first_read = attachment_hook.handle_files_drop([first]);
    second_read = attachment_hook.handle_files_drop([second]);
  });
  await act(async () => {
    release_first(new Uint8Array([1]).buffer);
    await first_read;
  });
  await act(async () => hook.handle_send());
  expect(mocks.send).not.toHaveBeenCalled();
  await act(async () => {
    release_second(new Uint8Array([2]).buffer);
    await second_read;
  });
  await act(async () => hook.handle_send());
  expect(mocks.send.mock.calls[0][1].attachments).toHaveLength(2);
});
it("releases the guard when reading a file fails", async () => {
  await render();
  const file = new File(["x"], "unreadable.txt", { type: "text/plain" });
  vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("read failed"));
  await act(async () => attachment_hook.handle_files_drop([file]));
  await act(async () => hook.handle_send());
  expect(mocks.send).toHaveBeenCalledTimes(1);
});

it("blocks an immediate keyboard send before the loading state renders", async () => {
  await render();
  let release!: (data: ArrayBuffer) => void;
  const file = {
    name: "report.txt",
    type: "text/plain",
    size: 5,
    arrayBuffer: () =>
      new Promise<ArrayBuffer>((resolve) => {
        release = resolve;
      }),
  } as File;
  let pending!: Promise<void>;
  await act(async () => {
    pending = attachment_hook.handle_files_drop([file]);
    await hook.handle_send();
  });
  expect(mocks.send).not.toHaveBeenCalled();
  await act(async () => {
    release(new TextEncoder().encode("hello").buffer);
    await pending;
  });
  await act(async () => hook.handle_send());
  expect(mocks.send.mock.calls[0][1].attachments).toHaveLength(1);
});
it("does not schedule a message while an attachment read is pending", async () => {
  options.scheduled_time = new Date("2026-10-02T12:00:00Z");
  await render();
  let release!: (data: ArrayBuffer) => void;
  const file = {
    name: "report.txt",
    type: "text/plain",
    size: 5,
    arrayBuffer: () =>
      new Promise<ArrayBuffer>((resolve) => {
        release = resolve;
      }),
  } as File;
  let pending!: Promise<void>;
  await act(async () => {
    pending = attachment_hook.handle_files_drop([file]);
  });
  await act(async () => hook.handle_scheduled_send());
  expect(mocks.schedule).not.toHaveBeenCalled();
  await act(async () => {
    release(new TextEncoder().encode("hello").buffer);
    await pending;
  });
  await act(async () => hook.handle_scheduled_send());
  expect(mocks.schedule).not.toHaveBeenCalled();
  expect(mocks.toast).toHaveBeenCalledWith(
    "common.scheduled_no_attachments",
    "error",
  );
});
