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
async function attach(files: File[], source: "picker" | "drop") {
  await act(async () => {
    if (source === "drop") await hook.handle_files_drop(files);
    else await hook.handle_file_select({ target: { files } } as never);
  });
}

function slow_file(name: string, contents: string) {
  const f = new File([contents], name, { type: "text/plain" });
  let release!: () => void;
  vi.spyOn(f, "arrayBuffer").mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve(new TextEncoder().encode(contents).buffer);
      }),
  );
  return { f, release: () => release() };
}
it("serial drops keep names unique (control)", async () => {
  await attach([new File(["FIRST"], "report.txt")], "drop");
  await attach([new File(["OTHER"], "report.txt")], "drop");
  expect(hook.attachments.map((a) => a.name)).toEqual([
    "report.txt",
    "report (2).txt",
  ]);
});
it.each(["picker", "drop"] as const)(
  "overlapping %s reads keep names unique",
  async (source) => {
    const slow = slow_file("report.txt", "FIRST");
    let pending!: Promise<void>;
    await act(async () => {
      pending =
        source === "drop"
          ? hook.handle_files_drop([slow.f])
          : (hook.handle_file_select({
              target: { files: [slow.f] },
            } as never) as unknown as Promise<void>);
    });
    await attach([new File(["OTHER"], "report.txt")], source);
    await act(async () => {
      slow.release();
      await pending;
    });
    expect(hook.attachments).toHaveLength(2);
    expect(new Set(hook.attachments.map((a) => a.name)).size).toBe(2);
  },
);
it("serial uploads respect real 50-file limit (control)", async () => {
  await attach(
    Array.from({ length: 50 }, (_, i) => new File(["x"], `file-${i}.txt`)),
    "drop",
  );
  await attach([new File(["x"], "extra.txt")], "drop");
  expect(hook.attachments).toHaveLength(50);
});
it("overlapping uploads respect real 50-file limit", async () => {
  await attach(
    Array.from({ length: 49 }, (_, i) => new File(["x"], `file-${i}.txt`)),
    "drop",
  );
  const slow = slow_file("slow.txt", "FIRST");
  let pending!: Promise<void>;
  await act(async () => {
    pending = hook.handle_files_drop([slow.f]);
  });
  await attach([new File(["OTHER"], "fast.txt")], "drop");
  await act(async () => {
    slow.release();
    await pending;
  });
  expect(hook.attachments.length).toBeLessThanOrEqual(50);
});

it("overlapping reads respect the 25 MiB total byte limit", async () => {
  const contents = "x".repeat(13 * 1024 * 1024);
  const slow = slow_file("slow.txt", contents);
  let pending!: Promise<void>;
  await act(async () => {
    pending = hook.handle_files_drop([slow.f]);
  });
  await attach([new File([contents], "fast.txt")], "drop");
  await act(async () => {
    slow.release();
    await pending;
  });
  expect(
    hook.attachments.reduce((sum, a) => sum + a.size_bytes, 0),
  ).toBeLessThanOrEqual(25 * 1024 * 1024);
  expect(hook.attachments).toHaveLength(1);
  expect(hook.has_pending_attachment_reads()).toBe(false);
});
