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
import type { DecryptedSecureAttachment } from "@/services/crypto/secure_message_crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/components/email/pdf_preview_modal", () => ({
  PdfPreviewModal: ({
    filename,
    on_close,
  }: {
    filename: string;
    on_close: () => void;
  }) => (
    <div data-testid="pdf-modal-stub">
      {filename}
      <button type="button" onClick={on_close}>
        close-pdf
      </button>
    </div>
  ),
}));

vi.mock("@/components/email/attachment_list/preview_modal", () => ({
  ImagePreviewModal: ({
    src,
    on_close,
  }: {
    src: string;
    on_close: () => void;
  }) => (
    <div data-src={src} data-testid="image-modal-stub">
      <button type="button" onClick={on_close}>
        close-image
      </button>
    </div>
  ),
}));

const { SecureViewAttachments } = await import("./secure_view_attachments");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const encoder = new TextEncoder();
const translate = ((key: string) => key) as Parameters<
  typeof SecureViewAttachments
>[0]["t"];

function attachment(
  filename: string,
  content_type: string,
  data: Uint8Array,
): DecryptedSecureAttachment {
  return { filename, content_type, size_bytes: data.byteLength, data };
}

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const ATTACHMENTS = [
  attachment("photo.png", "image/png", PNG),
  attachment("notes.txt", "text/plain", encoder.encode("<b>not markup</b>")),
  attachment(
    "logo.png",
    "image/png",
    encoder.encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
  ),
  attachment("report.pdf", "application/pdf", encoder.encode("%PDF-1.7\n")),
];

let container: HTMLDivElement;
let root: Root;
let created: string[];
let revoked: string[];

function by_testid(id: string): HTMLElement[] {
  return [
    ...document.body.querySelectorAll(`[data-testid="${id}"]`),
  ] as HTMLElement[];
}

function button_with_text(text: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === text,
  );

  if (!found) throw new Error(`button missing: ${text}`);

  return found;
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
  });
}

describe("SecureViewAttachments", () => {
  beforeEach(async () => {
    created = [];
    revoked = [];
    let counter = 0;

    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      counter += 1;
      const url = `blob:test/${counter}`;

      created.push(url);

      return url;
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url: string) => {
      revoked.push(url);
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <SecureViewAttachments
          reduce_motion
          attachments={ATTACHMENTS}
          t={translate}
        />,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("offers previews only for files whose bytes are safe to show", () => {
    const rows = by_testid("secure-attachment");

    expect(rows).toHaveLength(4);
    expect(
      rows.map((row) =>
        Boolean(row.querySelector('[data-testid="secure-attachment-preview"]')),
      ),
    ).toEqual([true, true, false, true]);
    expect(by_testid("secure-attachment-download")).toHaveLength(4);
  });

  it("opens an image through a blob url and revokes it on close", async () => {
    await click(by_testid("secure-attachment-preview")[0]);

    expect(by_testid("image-modal-stub")[0].dataset.src).toBe(created[0]);

    await click(button_with_text("close-image"));

    expect(revoked).toContain(created[0]);
    expect(by_testid("image-modal-stub")).toHaveLength(0);
  });

  it("shows text as plain text, never as markup", async () => {
    await click(by_testid("secure-attachment-preview")[1]);

    const pre = by_testid("secure-text-preview")[0];

    expect(pre.tagName).toBe("PRE");
    expect(pre.textContent).toBe("<b>not markup</b>");
    expect(pre.querySelector("b")).toBeNull();
    expect(created).toHaveLength(0);
  });

  it("opens a pdf in the viewer without a blob url", async () => {
    await click(by_testid("secure-attachment-preview")[2]);

    expect(by_testid("pdf-modal-stub")[0].textContent).toContain("report.pdf");
    expect(created).toHaveLength(0);
  });

  it("downloads as an opaque file and revokes the url on unmount", async () => {
    const downloads: { href: string; download: string }[] = [];

    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function (this: HTMLAnchorElement) {
        downloads.push({
          href: this.getAttribute("href") ?? "",
          download: this.download,
        });
      },
    );

    await click(by_testid("secure-attachment-download")[2]);

    expect(downloads).toEqual([{ href: created[0], download: "logo.png" }]);

    await act(async () => root.unmount());
    root = createRoot(container);

    expect(revoked).toContain(created[0]);
  });
});
