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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

function line_with(text: string, fragment: string): string {
  const line = text.split(/\r?\n/).find((entry) => entry.includes(fragment));

  expect(line, fragment).toBeDefined();

  return line!;
}

describe("message chrome is not selectable", () => {
  it("keeps the header actions and avatar out of drag selection", () => {
    const block = source("src/components/email/thread_message_block.tsx");

    expect(line_with(block, "items-center gap-0.5 -mt-1.5 -me-2")).toContain(
      "select-none",
    );
    expect(line_with(block, 'className="flex-shrink-0 mt-0.5')).toContain(
      "select-none",
    );
    expect(
      line_with(block, "flex-shrink-0 mt-0.5 select-none rounded-full"),
    ).toContain("select-none");
  });

  it("keeps the reply, forward and reaction bars out of drag selection", () => {
    const actions = source("src/components/email/thread_message_actions.tsx");
    const reply = source("src/components/email/email_reply_section.tsx");

    expect(line_with(actions, "thread_message_actions flex")).toContain(
      "select-none",
    );
    expect(line_with(actions, "gap-1.5 px-4 pt-3 pb-1")).toContain(
      "select-none",
    );
    expect(line_with(reply, "px-6 py-3 border-t")).toContain("select-none");
  });

  it("keeps label chips out of drag selection in both readers", () => {
    for (const path of [
      "src/components/email/full_email_viewer.tsx",
      "src/components/email/split_email_viewer.tsx",
    ]) {
      const viewer = source(path);
      const tag_classes = viewer
        .split(/\r?\n/)
        .map((line, index, lines) =>
          line.includes("<EmailTag")
            ? lines.slice(index + 1, index + 3).join(" ")
            : null,
        )
        .filter((line): line is string => !!line && line.includes("className"));

      expect(tag_classes.length, path).toBe(2);
      tag_classes.forEach((line) =>
        expect(line, path).toContain("select-none"),
      );
    }
  });

  it("marks every reader and message frame for select all", () => {
    for (const path of [
      "src/components/email/full_email_viewer.tsx",
      "src/components/email/split_email_viewer.tsx",
      "src/components/email/email_popup_viewer.tsx",
      "src/pages/mobile/mobile_mail_detail.tsx",
    ]) {
      expect(source(path), path).toContain('data-reading-pane=""');
    }

    expect(
      source("src/components/email/sandboxed_email_renderer/renderer.tsx"),
    ).toContain('data-message-frame=""');
  });

  it("keeps the in-frame quote toggle and banners unselectable", () => {
    const renderer = source(
      "src/components/email/sandboxed_email_renderer/renderer.tsx",
    );

    expect(
      line_with(
        renderer,
        ".aster-quote-toggle, .aster-forwarded-collapse > summary",
      ),
    ).toContain("user-select: none");
  });
});
