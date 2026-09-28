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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => {
  class FakePasswordError extends Error {
    reason: "required" | "incorrect";

    constructor(reason: "required" | "incorrect") {
      super(reason);
      this.reason = reason;
    }
  }

  return {
    FakePasswordError,
    correct: "open-sesame",
    attempts: [] as (string | undefined)[],
    destroyed: 0,
    lengths: [] as number[],
  };
});

vi.mock("@/lib/i18n/context", () => {
  const t = (k: string) => k;

  return { use_i18n: () => ({ t }) };
});

vi.mock("@/lib/use_dialog_shell", () => ({
  use_dialog_shell: () => ({
    dialog_ref: { current: null },
    handle_backdrop_pointer_down: () => {},
  }),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: vi.fn() }));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  decrypt_attachment_meta: vi.fn(async () => ({
    session_key: "k",
    filename: "statement.pdf",
    content_type: "application/pdf",
  })),
  decrypt_attachment_data: vi.fn(async () => new Uint8Array(16).buffer),
  download_decrypted_attachment: vi.fn(),
}));

vi.mock("@/lib/pdf_utils", () => ({
  is_pdf_password_error: (e: unknown) => e instanceof state.FakePasswordError,
  load_pdf_document: vi.fn(async (data: ArrayBuffer, password?: string) => {
    state.attempts.push(password);
    state.lengths.push(data.byteLength);
    if (password === undefined) throw new state.FakePasswordError("required");
    if (password !== state.correct)
      throw new state.FakePasswordError("incorrect");

    return {
      numPages: 2,
      destroy: () => {
        state.destroyed += 1;
      },
    };
  }),
  render_pdf_page: vi.fn(async () => {}),
}));

import { PdfPreviewModal } from "./pdf_preview_modal";

const att = {
  id: "a1",
  mail_item_id: "m1",
  seq_num: 0,
  filename: "statement.pdf",
  content_type: "application/pdf",
  size_bytes: 16,
  encrypted_data: "x",
  data_nonce: "n",
  encrypted_meta: "m",
  meta_nonce: "mn",
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function flush() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      createElement(PdfPreviewModal, {
        att,
        filename: "statement.pdf",
        on_close: () => {},
        reduce_motion: true,
      }),
    );
  });
  await flush();
}

function q(id: string) {
  return document.querySelector(`[data-testid='${id}']`);
}

async function type_and_submit(value: string) {
  const input = q("pdf-password-input") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;

  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    (q("pdf-password-form") as HTMLFormElement).requestSubmit();
  });
  await flush();
}

describe("PdfPreviewModal password flow", () => {
  let url_counter = 0;

  beforeEach(() => {
    state.attempts = [];
    state.lengths = [];
    state.destroyed = 0;
    url_counter = 0;
    URL.createObjectURL = vi.fn(() => `blob:page-${++url_counter}`);
    URL.revokeObjectURL = vi.fn();
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(["png"]));
    };
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("asks for a password instead of failing", async () => {
    await mount();

    expect(q("pdf-password-form")).not.toBeNull();
    expect(q("pdf-password-error")).toBeNull();
    expect(document.body.textContent).not.toContain("mail.pdf_preview_failed");
    expect(state.attempts).toEqual([undefined]);
  });

  it("uses a masked input that password managers skip", async () => {
    await mount();

    const input = q("pdf-password-input") as HTMLInputElement;

    expect(input.type).toBe("password");
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("data-lpignore")).toBe("true");
    expect(input.maxLength).toBe(1024);
    expect(input.name).not.toBe("password");
  });

  it("shows an error for a wrong password and clears the field", async () => {
    await mount();
    await type_and_submit("wrong");

    expect(q("pdf-password-error")).not.toBeNull();
    expect((q("pdf-password-input") as HTMLInputElement).value).toBe("");
    expect(q("pdf-password-input")!.getAttribute("aria-invalid")).toBe("true");
    expect(q("pdf-pages")).toBeNull();
  });

  it("renders every page after the right password", async () => {
    await mount();
    await type_and_submit("wrong");
    await type_and_submit(state.correct);

    expect(q("pdf-password-form")).toBeNull();
    expect(q("pdf-pages")!.querySelectorAll("img").length).toBe(2);
    expect(state.attempts).toEqual([undefined, "wrong", state.correct]);
    expect(document.body.innerHTML).not.toContain(state.correct);
  });

  it("gives the engine a fresh copy of the bytes on every attempt", async () => {
    await mount();
    await type_and_submit("wrong");
    await type_and_submit(state.correct);

    expect(state.lengths).toEqual([16, 16, 16]);
  });

  it("does not submit an empty password", async () => {
    await mount();
    await act(async () => {
      (q("pdf-password-form") as HTMLFormElement).requestSubmit();
    });
    await flush();

    expect(state.attempts).toEqual([undefined]);
  });

  it("destroys the document and revokes page URLs on close", async () => {
    await mount();
    await type_and_submit(state.correct);

    act(() => {
      root?.unmount();
    });
    root = null;

    expect(state.destroyed).toBe(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:page-1");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:page-2");
  });
});
