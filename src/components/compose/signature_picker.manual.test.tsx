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
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SignaturePicker } from "./signature_picker";

import { use_editor } from "@/hooks/use_editor";
import { format_signature_html } from "@/lib/signature_html";

const signatures = vi.hoisted(() => [
  {
    id: "sig-1",
    name: "Work",
    content: "Dana Reyes\nAster Communications",
    is_html: false,
    is_default: true,
  },
]);

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));
vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { signature_mode: "manual", strip_exif_on_compose: false },
  }),
}));
vi.mock("@/contexts/signatures_context", () => ({
  use_signatures: () => ({
    signatures,
    default_signature: signatures[0],
    is_loading: false,
    get_formatted_signature: (signature: (typeof signatures)[number]) =>
      format_signature_html(signature, true),
  }),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const changes: string[] = [];

function Harness({ plain_text }: { plain_text: boolean }) {
  const editor_ref = useRef<HTMLDivElement | null>(null);
  const editor = use_editor({
    editor_ref,
    on_change: (value) => changes.push(value),
    is_plain_text_mode: plain_text,
  });

  return (
    <div>
      <div
        ref={editor_ref}
        contentEditable
        suppressContentEditableWarning
        data-testid="editor"
      >
        <div>Hello there</div>
      </div>
      <SignaturePicker
        on_select={(content) => editor.apply_signature(content || null)}
      />
    </div>
  );
}

describe("signature picker in manual mode", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    changes.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const editor = () =>
    container.querySelector<HTMLDivElement>('[data-testid="editor"]')!;

  const pick_signature = async () => {
    const trigger = container.querySelector<HTMLButtonElement>(
      'button[title="mail.insert_signature"]',
    )!;

    await act(async () => {
      trigger.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const item = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("Work"));

    expect(item).toBeTruthy();

    await act(async () => {
      item!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  it("inserts the chosen signature into a rich text message", async () => {
    await act(async () => root.render(<Harness plain_text={false} />));
    await pick_signature();

    expect(
      editor().querySelector("[data-aster-signature='1']")?.textContent,
    ).toContain("Dana Reyes");
    expect(editor().textContent).toContain("Hello there");
    expect(changes.at(-1)).toContain("Dana Reyes");
  });

  it("inserts the chosen signature into a plain text message", async () => {
    await act(async () => root.render(<Harness plain_text={true} />));
    await pick_signature();

    expect(editor().textContent).toContain("Hello there");
    expect(editor().textContent).toContain("Dana Reyes");
    expect(editor().textContent).toContain("Aster Communications");
    expect(changes.at(-1)).toContain("Dana Reyes");
  });

  it("replaces a signature that is already in a plain text message", async () => {
    await act(async () => root.render(<Harness plain_text={true} />));
    await pick_signature();
    await pick_signature();

    const text = editor().textContent ?? "";

    expect(text.split("Dana Reyes").length - 1).toBe(1);
  });

  it("removes the signature when No signature is chosen", async () => {
    await act(async () => root.render(<Harness plain_text={false} />));
    await pick_signature();

    const trigger = container.querySelector<HTMLButtonElement>(
      'button[title="mail.insert_signature"]',
    )!;

    await act(async () => {
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const none = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("mail.no_signature"));

    await act(async () => {
      none!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(editor().querySelector("[data-aster-signature='1']")).toBeNull();
    expect(editor().textContent).toContain("Hello there");
  });
});
