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
  MAX_ATTACHMENTS_PER_SEND: 20,
  ensure_attachment_limits: async () => {},
  get_max_attachment_size: () => 1e8,
  get_max_total_attachments_size: () => 1000,
}));
vi.mock("@/services/attachment_rejection", () => ({
  describe_oversized_file: vi.fn(),
  describe_too_many_attachments: () => "too_many",
  describe_would_exceed_total: () => "exceeds_total",
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
function file(name: string, contents: string): File {
  return {
    name,
    type: "text/plain",
    size: contents.length,
    arrayBuffer: async () => new TextEncoder().encode(contents).buffer,
  } as File;
}
async function attach(files: File[], source: "picker" | "drop") {
  await act(async () => {
    if (source === "drop") await hook.handle_files_drop(files);
    else await hook.handle_file_select({ target: { files } } as never);
  });
}

it.each(["picker", "drop"] as const)(
  "keeps different same-name, same-size files added through the %s",
  async (source) => {
    await attach(
      [file("report.txt", "FIRST"), file("report.txt", "OTHER")],
      source,
    );
    expect(hook.attachments.map((a) => a.name)).toEqual([
      "report.txt",
      "report (2).txt",
    ]);
    expect(
      hook.attachments.map((a) => new TextDecoder().decode(a.data)),
    ).toEqual(["FIRST", "OTHER"]);
  },
);
it.each(["picker", "drop"] as const)(
  "keeps a second file selected in a later %s operation",
  async (source) => {
    await attach([file("report.txt", "FIRST")], source);
    await attach([file("report.txt", "OTHER")], source);
    expect(hook.attachments.map((a) => a.name)).toEqual([
      "report.txt",
      "report (2).txt",
    ]);
  },
);
it("avoids overwriting a filename that already has a numeric suffix", async () => {
  await attach(
    [
      file("report.txt", "FIRST"),
      file("report (2).txt", "OTHER"),
      file("report.txt", "THIRD"),
    ],
    "drop",
  );
  expect(hook.attachments.map((a) => a.name)).toEqual([
    "report.txt",
    "report (2).txt",
    "report (3).txt",
  ]);
});

function deferred_file(name: string, contents: string) {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = {
    name,
    type: "text/plain",
    size: contents.length,
    arrayBuffer: async () => {
      await gate;

      return new TextEncoder().encode(contents).buffer;
    },
  } as File;

  return { pending, release };
}
async function attach_overlapping(first: File[], second: File[]) {
  const releases: (() => void)[] = [];
  const gated = (files: File[]) =>
    files.map((entry) => {
      const { pending, release } = deferred_file(
        entry.name,
        "x".repeat(entry.size),
      );

      releases.push(release);

      return pending;
    });

  await act(async () => {
    const drop = hook.handle_files_drop(gated(first));
    const pick = hook.handle_file_select({
      target: { files: gated(second) },
    } as never);

    releases.reverse().forEach((release) => release());
    await Promise.all([drop, pick]);
  });
}

it("gives unique names to the same file added by overlapping operations", async () => {
  await attach_overlapping(
    [file("report.txt", "FIRST")],
    [file("report.txt", "OTHER")],
  );
  expect(hook.attachments.map((a) => a.name)).toEqual([
    "report.txt",
    "report (2).txt",
  ]);
});
it("enforces the attachment count across overlapping operations", async () => {
  const batch = (prefix: string) =>
    Array.from({ length: 15 }, (_, index) =>
      file(`${prefix}${index}.txt`, "x"),
    );

  await attach_overlapping(batch("a"), batch("b"));
  expect(hook.attachments).toHaveLength(20);
  expect(hook.attachment_error).toBe("too_many");
  expect(hook.has_pending_attachment_reads()).toBe(false);
});
it("enforces the total size across overlapping operations", async () => {
  await attach_overlapping(
    [file("a.txt", "x".repeat(600))],
    [file("b.txt", "x".repeat(600))],
  );
  expect(hook.attachments.map((a) => a.name)).toEqual(["a.txt"]);
  expect(hook.attachment_error).toBe("exceeds_total");
});
