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
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  RECEIPT_STYLE_MARKERS,
  build_receipt_style_html,
} from "./receipt_style_message_fixture";

const renderer = vi.hoisted(() => ({
  should_throw: true,
  ready_ids: [] as string[],
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string) => key,
    language: "en",
  }),
}));

vi.mock("@/components/email/sandboxed_email_renderer", () => ({
  SandboxedEmailRenderer: ({ sanitized_html }: { sanitized_html: string }) => {
    if (renderer.should_throw) throw new Error("renderer failed");

    return <div data-testid="rendered-body">{sanitized_html.length}</div>;
  },
  dispatch_iframe_ready: (email_id: string) => {
    renderer.ready_ids.push(email_id);
  },
}));

vi.mock("@/components/modals/view_source_modal", () => ({
  tokenize_html: () => [],
  TOKEN_COLORS: {},
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: () => undefined,
}));

const { ThreadMessageBody } = await import("./thread_message_body");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  renderer.should_throw = true;
  renderer.ready_ids = [];
  vi.restoreAllMocks();
});

function render(html: string) {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <div>
        <ThreadMessageBody
          clean_body={html}
          email_id="item-1"
          is_plain_text={false}
          load_remote_content={false}
          sanitized_html={html}
          set_wrap_source={() => undefined}
          viewing_source={false}
          wrap_source={false}
        />
        <div data-testid="attachment-list">invoice.pdf receipt.pdf</div>
      </div>,
    );
  });
}

describe("message body when the HTML renderer throws", () => {
  it("shows the readable text and keeps the attachments mounted", () => {
    render(build_receipt_style_html());

    const fallback = container!.querySelector<HTMLElement>(
      "[data-testid='readable-body-fallback']",
    );

    expect(fallback).not.toBeNull();
    for (const marker of RECEIPT_STYLE_MARKERS) {
      expect(fallback!.textContent).toContain(marker);
    }
    expect(fallback!.querySelector("table")).toBeNull();
    expect(
      container!.querySelector("[data-testid='attachment-list']"),
    ).not.toBeNull();
  });

  it("releases the viewer loading state for that message", () => {
    render(build_receipt_style_html());

    expect(renderer.ready_ids).toEqual(["item-1"]);
  });

  it("renders the normal body when the renderer works", () => {
    renderer.should_throw = false;
    render(build_receipt_style_html());

    expect(
      container!.querySelector("[data-testid='rendered-body']"),
    ).not.toBeNull();
    expect(
      container!.querySelector("[data-testid='readable-body-fallback']"),
    ).toBeNull();
    expect(renderer.ready_ids).toEqual([]);
  });
});
