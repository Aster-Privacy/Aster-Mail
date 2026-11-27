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
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AttachmentChip, AttachmentChipOverflow } from "./attachment_chip";

import { get_chip_kind } from "@/lib/attachment_utils";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(node));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("get_chip_kind", () => {
  it("maps each content type to its own kind", () => {
    expect(get_chip_kind("application/pdf", "a.pdf")).toBe("pdf");
    expect(get_chip_kind("image/jpeg", "a.jpg")).toBe("image");
    expect(
      get_chip_kind(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "a.docx",
      ),
    ).toBe("document");
    expect(
      get_chip_kind(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "a.xlsx",
      ),
    ).toBe("sheet");
    expect(
      get_chip_kind(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "a.pptx",
      ),
    ).toBe("presentation");
    expect(get_chip_kind("application/zip", "a.zip")).toBe("archive");
    expect(get_chip_kind("audio/mpeg", "a.mp3")).toBe("audio");
    expect(get_chip_kind("video/mp4", "a.mp4")).toBe("video");
    expect(get_chip_kind("application/json", "a.json")).toBe("code");
    expect(get_chip_kind("application/x-unknown", "a.bin")).toBe("file");
  });

  it("falls back to the file extension for a generic content type", () => {
    expect(get_chip_kind("application/octet-stream", "Report.PDF")).toBe("pdf");
    expect(get_chip_kind("application/octet-stream", "photo.heic")).toBe(
      "image",
    );
    expect(get_chip_kind("application/octet-stream", "data.csv")).toBe("sheet");
    expect(get_chip_kind("application/octet-stream", "README")).toBe("file");
    expect(get_chip_kind("application/octet-stream", ".hidden")).toBe("file");
  });
});

describe("AttachmentChip", () => {
  it("shows an icon and the file name instead of a dot and a label", () => {
    render(
      <AttachmentChip
        content_type="application/pdf"
        filename="261127_report.pdf"
        type_label="PDF"
      />,
    );
    const chip = container!.querySelector<HTMLElement>(
      '[data-testid="attachment-chip"]',
    )!;

    expect(chip.dataset.kind).toBe("pdf");
    expect(
      chip.querySelector('[data-testid="attachment-chip-icon"]'),
    ).not.toBeNull();
    expect(chip.querySelector(".rounded-full")).toBeNull();
    expect(chip.getAttribute("title")).toBe("261127_report.pdf");
    expect(chip.querySelector(".sr-only")?.textContent).toBe("PDF ");
  });

  it("uses a different icon for each kind", () => {
    const cases: Array<[string, string]> = [
      ["application/pdf", "a.pdf"],
      ["image/png", "a.png"],
      ["text/plain", "a.txt"],
      ["text/csv", "a.csv"],
      ["application/zip", "a.zip"],
      ["audio/mpeg", "a.mp3"],
      ["video/mp4", "a.mp4"],
      ["application/json", "a.json"],
      ["application/x-unknown", "a.bin"],
    ];

    render(
      <>
        {cases.map(([type, name]) => (
          <AttachmentChip
            key={name}
            content_type={type}
            filename={name}
            type_label="X"
          />
        ))}
      </>,
    );
    const paths = Array.from(
      container!.querySelectorAll('[data-testid="attachment-chip-icon"]'),
    ).map((icon) => icon.innerHTML);

    expect(new Set(paths).size).toBe(cases.length);
  });

  it("shows a compact count for hidden attachments", () => {
    render(<AttachmentChipOverflow count={2} label="+2 more" />);
    const overflow = container!.querySelector(
      '[data-testid="attachment-chip-overflow"]',
    )!;

    expect(overflow.querySelector('[aria-hidden="true"]')?.textContent).toBe(
      "+2",
    );
    expect(overflow.querySelector(".sr-only")?.textContent).toBe("+2 more");
  });

  it("renders nothing when no attachment is hidden", () => {
    render(<AttachmentChipOverflow count={0} label="" />);

    expect(
      container!.querySelector('[data-testid="attachment-chip-overflow"]'),
    ).toBeNull();
  });
});
