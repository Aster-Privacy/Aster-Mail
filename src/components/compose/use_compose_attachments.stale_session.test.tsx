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
vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: { strip_exif_on_compose: false } }),
}));
vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/services/attachment_limits", () => ({
  MAX_ATTACHMENTS_PER_SEND: 50,
  ensure_attachment_limits: async () => {},
  get_max_attachment_size: () => 25 * 1024 * 1024,
  get_max_total_attachments_size: () => 25 * 1024 * 1024,
}));
vi.mock("@/services/attachment_rejection", () => ({
  describe_oversized_file: vi.fn(),
  describe_too_many_attachments: vi.fn(),
  describe_would_exceed_total: vi.fn(),
  prompt_attachment_upgrade: vi.fn(),
}));
vi.mock("@/lib/strip_image_metadata", () => ({ strip_metadata: vi.fn() }));
vi.mock("@/services/iconic_sounds", () => ({ play_iconic_sound: vi.fn() }));
import {
  use_compose_attachments,
  type UseComposeAttachmentsReturn,
} from "./use_compose_attachments";
let hook: UseComposeAttachmentsReturn;
let root: Root;
function Probe() {
  hook = use_compose_attachments();
  return null;
}
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
});
afterEach(async () => {
  await act(async () => root.unmount());
});

function slow_file(name: string, contents: string) {
  const f = new File([contents], name, { type: "text/plain" });
  let release!: () => void;
  let reject_read!: () => void;
  vi.spyOn(f, "arrayBuffer").mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        release = () => resolve(new TextEncoder().encode(contents).buffer);
        reject_read = () => reject(new Error("read failed"));
      }),
  );
  return { f, release: () => release(), fail: () => reject_read() };
}

async function start(source: "picker" | "drop", files: File[]) {
  const pending =
    source === "drop"
      ? hook.handle_files_drop(files)
      : (hook.handle_file_select({
          target: { files },
        } as never) as unknown as Promise<void>);
  await act(async () => {});
  return { done: pending };
}

it.each(["picker", "drop"] as const)(
  "a %s read that finishes after the session resets is dropped",
  async (source) => {
    const slow = slow_file("contact_a.txt", "FOR A");
    const pending = (await start(source, [slow.f])).done;
    expect(hook.is_loading_attachments).toBe(true);
    await act(async () => hook.reset_attachment_session());
    expect(hook.is_loading_attachments).toBe(false);
    expect(hook.has_pending_attachment_reads()).toBe(false);
    slow.release();
    await pending;
    await act(async () => {});
    expect(hook.attachments).toHaveLength(0);
    expect(hook.is_loading_attachments).toBe(false);
    expect(hook.has_pending_attachment_reads()).toBe(false);
  },
);

it("a stale read does not come back when the session reopens", async () => {
  const slow = slow_file("contact_a.txt", "FOR A");
  const pending = (await start("drop", [slow.f])).done;
  await act(async () => hook.reset_attachment_session());
  await act(async () => hook.reset_attachment_session());
  slow.release();
  await pending;
  await act(async () => {});
  expect(hook.attachments).toHaveLength(0);
});

it("the new session keeps its own reads while a stale read lands", async () => {
  const slow = slow_file("contact_a.txt", "FOR A");
  const stale = (await start("drop", [slow.f])).done;
  await act(async () => hook.reset_attachment_session());
  const fresh_slow = slow_file("contact_b.txt", "FOR B");
  const fresh = (await start("picker", [fresh_slow.f])).done;
  slow.release();
  await stale;
  await act(async () => {});
  expect(hook.attachments).toHaveLength(0);
  expect(hook.is_loading_attachments).toBe(true);
  expect(hook.has_pending_attachment_reads()).toBe(true);
  fresh_slow.release();
  await fresh;
  await act(async () => {});
  expect(hook.attachments.map((a) => a.name)).toEqual(["contact_b.txt"]);
  expect(hook.is_loading_attachments).toBe(false);
  expect(hook.has_pending_attachment_reads()).toBe(false);
});

it("a read in a session that stays open is still attached", async () => {
  const slow = slow_file("report.txt", "KEEP");
  const pending = (await start("drop", [slow.f])).done;
  slow.release();
  await pending;
  await act(async () => {});
  expect(hook.attachments.map((a) => a.name)).toEqual(["report.txt"]);
  expect(hook.is_loading_attachments).toBe(false);
});

it("reset clears attachments that were already added", async () => {
  await start("drop", [new File(["x"], "added.txt")]);
  expect(hook.attachments).toHaveLength(1);
  await act(async () => hook.reset_attachment_session());
  expect(hook.attachments).toHaveLength(0);
});

it("a stale read that fails does not touch the new session", async () => {
  const slow = slow_file("contact_a.txt", "FOR A");
  const pending = (await start("drop", [slow.f])).done;
  await act(async () => hook.reset_attachment_session());
  await start("drop", [new File(["B"], "contact_b.txt")]);
  slow.fail();
  await pending;
  await act(async () => {});
  expect(hook.attachments.map((a) => a.name)).toEqual(["contact_b.txt"]);
  expect(hook.is_loading_attachments).toBe(false);
});

it("a read that finishes after unmount is ignored", async () => {
  const slow = slow_file("contact_a.txt", "FOR A");
  const pending = (await start("drop", [slow.f])).done;
  const before_unmount = hook;
  await act(async () => root.unmount());
  slow.release();
  await pending;
  await act(async () => {});
  expect(before_unmount.has_pending_attachment_reads()).toBe(false);
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
});
