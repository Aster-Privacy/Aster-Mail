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

const { ProfileNotesInline } = await import("./profile_notes_inline");

let container: HTMLDivElement;
let root: Root;

async function mount(email: string): Promise<void> {
  await act(async () => {
    root.render(<ProfileNotesInline email={email} />);
  });
}

async function unmount_panel(): Promise<void> {
  await act(async () => {
    root.render(<></>);
  });
}

function get_textarea(): HTMLTextAreaElement {
  const textarea = container.querySelector("textarea");

  if (!textarea) throw new Error("textarea missing");

  return textarea;
}

function type_note(value: string): void {
  const textarea = get_textarea();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;

  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function find_button(label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label,
  );

  if (!button) throw new Error(`button ${label} missing`);

  return button;
}

function saved_note(content: string) {
  return {
    data: {
      id: "note-id",
      email_token: "token",
      content,
      created_at: "2026-11-26T00:00:00Z",
      updated_at: "2026-11-26T00:00:00Z",
    },
  };
}

describe("ProfileNotesInline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hoisted.note_exceeds_limit.mockReturnValue(false);
    hoisted.get_profile_note.mockResolvedValue({ data: null });
    hoisted.save_profile_note.mockImplementation(
      async (_email: string, content: string) => saved_note(content),
    );
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

  it("shows an empty editable note when the sender has no note yet", async () => {
    await mount("someone@example.com");

    const textarea = get_textarea();

    expect(textarea.value).toBe("");
    expect(textarea.placeholder).toBe("common.add_note_placeholder");
    expect(container.querySelector("[role='alert']")).toBeNull();
    expect(container.textContent).not.toContain(
      "common.something_went_wrong_try_again",
    );
    expect(container.textContent).not.toContain(
      "common.sender_note_load_failed",
    );
  });

  it("labels the note field", async () => {
    await mount("someone@example.com");

    const label = container.querySelector("label");

    expect(label?.textContent).toBe("common.notes");
    expect(label?.getAttribute("for")).toBe(get_textarea().id);
  });

  it("shows the saved note content", async () => {
    hoisted.get_profile_note.mockResolvedValue(saved_note("met at the expo"));
    await mount("someone@example.com");

    expect(get_textarea().value).toBe("met at the expo");
  });

  it("shows an inline error with a retry when the note fails to load", async () => {
    hoisted.get_profile_note.mockResolvedValueOnce({ error: "load failed" });
    await mount("someone@example.com");

    const alert = container.querySelector("[role='alert']");

    expect(alert?.textContent).toContain("common.sender_note_load_failed");
    expect(container.querySelector("textarea")).toBeNull();

    hoisted.get_profile_note.mockResolvedValueOnce(saved_note("second try"));

    await act(async () => {
      find_button("common.retry").click();
    });

    expect(hoisted.get_profile_note).toHaveBeenCalledTimes(2);
    expect(container.querySelector("[role='alert']")).toBeNull();
    expect(get_textarea().value).toBe("second try");
  });

  it("treats a thrown load as a failure instead of showing it as content", async () => {
    hoisted.get_profile_note.mockRejectedValueOnce(new Error("network"));
    await mount("someone@example.com");

    expect(container.querySelector("[role='alert']")).not.toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("saves after typing and loads the same note on the next open", async () => {
    await mount("someone@example.com");

    act(() => {
      type_note("prefers calls in the morning");
    });

    await act(async () => {
      vi.advanceTimersByTime(1600);
    });

    expect(hoisted.save_profile_note).toHaveBeenCalledWith(
      "someone@example.com",
      "prefers calls in the morning",
    );

    await unmount_panel();

    hoisted.get_profile_note.mockResolvedValue(
      saved_note("prefers calls in the morning"),
    );
    await mount("someone@example.com");

    expect(get_textarea().value).toBe("prefers calls in the morning");
  });

  it("shows a save error with a retry that saves again", async () => {
    hoisted.save_profile_note.mockResolvedValueOnce({ error: "save failed" });
    await mount("someone@example.com");

    act(() => {
      type_note("follow up next week");
    });

    await act(async () => {
      vi.advanceTimersByTime(1600);
    });

    expect(container.textContent).toContain("common.sender_note_save_failed");
    expect(get_textarea().value).toBe("follow up next week");

    await act(async () => {
      find_button("common.retry").click();
    });

    expect(hoisted.save_profile_note).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain(
      "common.sender_note_save_failed",
    );
  });

  it("deletes the note when it is cleared", async () => {
    hoisted.get_profile_note.mockResolvedValue(saved_note("old note"));
    await mount("someone@example.com");

    act(() => {
      type_note("");
    });

    await act(async () => {
      vi.advanceTimersByTime(1600);
    });

    expect(hoisted.delete_profile_note).toHaveBeenCalledWith(
      "someone@example.com",
    );
    expect(hoisted.save_profile_note).not.toHaveBeenCalled();
  });
});
