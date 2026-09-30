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

const hoisted = vi.hoisted(() => ({
  get_profile_note: vi.fn(),
  save_profile_note: vi.fn(),
  delete_profile_note: vi.fn(),
  note_exceeds_limit: vi.fn(() => false),
}));

vi.mock("@/services/api/profile_notes", () => hoisted);

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ has_keys: true }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { ProfileNotesBox } = await import("./profile_notes_box");

let container: HTMLDivElement;
let root: Root;

async function mount(email: string): Promise<void> {
  await act(async () => {
    root.render(<ProfileNotesBox email={email} />);
  });
}

function type_note(value: string): void {
  const textarea = container.querySelector("textarea");

  if (!textarea) throw new Error("textarea missing");

  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;

  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ProfileNotesBox", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hoisted.get_profile_note.mockResolvedValue({ data: null });
    hoisted.save_profile_note.mockResolvedValue({ data: { success: true } });
    hoisted.delete_profile_note.mockResolvedValue({ data: { success: true } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("saves a note that is still inside the debounce window when the panel closes", async () => {
    await mount("someone@example.com");

    act(() => {
      type_note("call back on friday");
    });

    expect(hoisted.save_profile_note).not.toHaveBeenCalled();

    await act(async () => {
      root.render(<></>);
    });

    expect(hoisted.save_profile_note).toHaveBeenCalledWith(
      "someone@example.com",
      "call back on friday",
    );
  });

  it("keeps the pending note attached to the contact it was written for", async () => {
    await mount("first@example.com");

    act(() => {
      type_note("note for the first contact");
    });

    await mount("second@example.com");

    expect(hoisted.save_profile_note).toHaveBeenCalledWith(
      "first@example.com",
      "note for the first contact",
    );
  });

  it("refuses a note the server would reject and says why", async () => {
    hoisted.note_exceeds_limit.mockReturnValue(true);
    await mount("someone@example.com");

    act(() => {
      type_note("a note that is over the size the server accepts");
    });

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(hoisted.save_profile_note).not.toHaveBeenCalled();
    expect(container.textContent).toContain("common.alias_note_too_long");

    await act(async () => {
      root.render(<></>);
    });

    expect(hoisted.save_profile_note).not.toHaveBeenCalled();
  });

  it("does not write anything when the note was never edited", async () => {
    await mount("someone@example.com");

    await act(async () => {
      root.render(<></>);
    });

    expect(hoisted.save_profile_note).not.toHaveBeenCalled();
    expect(hoisted.delete_profile_note).not.toHaveBeenCalled();
  });
});
