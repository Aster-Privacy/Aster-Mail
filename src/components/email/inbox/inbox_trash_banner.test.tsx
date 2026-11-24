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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      `${key}:${String(params?.days)}`,
  }),
}));

const { TrashBanner } =
  await import("@/components/email/inbox/inbox_trash_banner");

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function notice(): HTMLElement {
  const node = container!.querySelector<HTMLElement>(
    '[data-testid="retention-notice"]',
  );

  expect(node).not.toBeNull();

  return node as HTMLElement;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("TrashBanner", () => {
  it("states the trash retention period", () => {
    act(() => {
      root!.render(<TrashBanner retention_days={30} view="trash" />);
    });

    expect(notice().textContent).toBe("mail.trash_auto_delete_notice:30");
  });

  it("states the spam retention period and family policy", () => {
    act(() => {
      root!.render(
        <TrashBanner family_enforced retention_days={14} view="spam" />,
      );
    });

    expect(notice().textContent).toBe("mail.spam_auto_delete_notice_family:14");
  });

  it("renders as a divided strip without a filled panel", () => {
    act(() => {
      root!.render(<TrashBanner />);
    });

    const node = notice();
    const classes = node.className.split(/\s+/);

    expect(node.getAttribute("role")).toBe("note");
    expect(node.getAttribute("style")).toBeNull();
    expect(classes).toContain("border-b");
    expect(classes).toContain("border-edge-secondary");
    expect(classes).not.toContain("border");
    expect(node.className).not.toMatch(/(^|\s)(bg-|rounded)/);
    expect(node.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("lines the icon up with the row avatar column", () => {
    act(() => {
      root!.render(<TrashBanner compact={false} />);
    });

    const slot = notice().querySelector("svg")!.parentElement!;

    expect(slot.className.split(/\s+/)).toContain("w-8");
    expect(notice().className.split(/\s+/)).toContain("py-2.5");

    act(() => {
      root!.render(<TrashBanner compact />);
    });

    const compact_slot = notice().querySelector("svg")!.parentElement!;

    expect(compact_slot.className.split(/\s+/)).toContain("w-7");
    expect(notice().className.split(/\s+/)).toContain("py-2");
  });

  it("lines the icon up with the checkbox when pictures are off", () => {
    act(() => {
      root!.render(<TrashBanner show_profile_pictures={false} />);
    });

    const slot = notice().querySelector("svg")!.parentElement!;

    expect(slot.className.split(/\s+/)).toContain("w-[18px]");
  });
});
