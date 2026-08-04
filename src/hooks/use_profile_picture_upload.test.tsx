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
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const hoisted = vi.hoisted(() => ({
  update_profile_picture: vi.fn(async () => ({
    data: { success: true },
    error: null,
  })),
  update_user: vi.fn(async () => undefined),
  show_toast: vi.fn(),
  user: { email: "a@astermail.org", profile_picture: "data:image/webp;base64,old" },
}));

vi.mock("@/services/api/user", () => ({
  update_profile_picture: (value: string | null) =>
    hoisted.update_profile_picture(value),
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: (...args: unknown[]) => hoisted.show_toast(...args),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ user: hoisted.user, update_user: hoisted.update_user }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

import {
  PROFILE_PICTURE_ACCEPT,
  use_profile_picture_upload,
} from "./use_profile_picture_upload";

type HookValue = ReturnType<typeof use_profile_picture_upload>;

let container: HTMLDivElement;
let root: Root;
let latest: HookValue;

function Probe() {
  latest = use_profile_picture_upload();

  return null;
}

function make_change_event(file: File | null) {
  const input = document.createElement("input");

  Object.defineProperty(input, "files", {
    value: file ? [file] : [],
    configurable: true,
  });

  return {
    target: input,
  } as unknown as React.ChangeEvent<HTMLInputElement>;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(Probe));
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  hoisted.update_profile_picture.mockClear();
  hoisted.update_user.mockClear();
  hoisted.show_toast.mockClear();
});

describe("use_profile_picture_upload", () => {
  it("accepts only the three supported image types", () => {
    expect(PROFILE_PICTURE_ACCEPT).toBe("image/jpeg,image/png,image/webp");
  });

  it("rejects a file whose type is not an accepted image", async () => {
    const file = new File(["x"], "notes.pdf", { type: "application/pdf" });

    await act(async () => {
      await latest.handle_file(make_change_event(file));
    });

    expect(latest.error).toBe("common.valid_image_error");
    expect(hoisted.update_profile_picture).not.toHaveBeenCalled();
  });

  it("rejects an image larger than five megabytes", async () => {
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", {
      type: "image/png",
    });

    await act(async () => {
      await latest.handle_file(make_change_event(file));
    });

    expect(latest.error).toBe("common.image_size_error");
    expect(hoisted.update_profile_picture).not.toHaveBeenCalled();
  });

  it("does nothing when no file was chosen", async () => {
    await act(async () => {
      await latest.handle_file(make_change_event(null));
    });

    expect(latest.error).toBeNull();
    expect(hoisted.update_profile_picture).not.toHaveBeenCalled();
  });

  it("clears the stored picture when removing succeeds", async () => {
    await act(async () => {
      await latest.remove_picture();
    });

    expect(hoisted.update_profile_picture).toHaveBeenCalledWith(null);
    expect(hoisted.update_user).toHaveBeenCalledWith(
      expect.objectContaining({ profile_picture: undefined }),
    );
    expect(hoisted.show_toast).toHaveBeenCalledWith(
      "common.profile_picture_removed",
      "success",
    );
  });

  it("surfaces a server error when removing fails", async () => {
    hoisted.update_profile_picture.mockResolvedValueOnce({
      data: null,
      error: "nope",
    } as never);

    await act(async () => {
      await latest.remove_picture();
    });

    expect(latest.error).toBe("nope");
    expect(hoisted.update_user).not.toHaveBeenCalled();
  });

  it("reports errors through the on_error callback when supplied", async () => {
    const seen: (string | null)[] = [];

    function CallbackProbe() {
      latest = use_profile_picture_upload({
        on_error: (message) => seen.push(message),
      });

      return null;
    }

    act(() => root.render(createElement(CallbackProbe)));

    const file = new File(["x"], "notes.pdf", { type: "application/pdf" });

    await act(async () => {
      await latest.handle_file(make_change_event(file));
    });

    expect(seen).toContain("common.valid_image_error");
  });
});
