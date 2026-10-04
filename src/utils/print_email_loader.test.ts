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
import { beforeEach, describe, expect, it, vi } from "vitest";

const module_spies = vi.hoisted(() => ({
  loads: 0,
  print_email: vi.fn(),
  print_thread: vi.fn(),
  setup_thread_print_intercept: vi.fn(() => () => {}),
}));

vi.mock("@/utils/print_email", () => {
  module_spies.loads += 1;

  return {
    print_email: module_spies.print_email,
    print_thread: module_spies.print_thread,
    setup_thread_print_intercept: module_spies.setup_thread_print_intercept,
  };
});

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: vi.fn(),
}));

const loader = await import("./print_email_loader");

const t = (key: string) => key;
const email = {
  subject: "Quarterly report",
  sender: "Ada",
  sender_email: "ada@example.com",
  to: [{ email: "grace@example.com" }],
  timestamp: "Mon",
  body: "<p>Hello</p>",
};

beforeEach(() => {
  module_spies.print_email.mockClear();
  module_spies.print_thread.mockClear();
});

describe("print_email_loader", () => {
  it("does not load the print module until something prints", () => {
    expect(module_spies.loads).toBe(0);
  });

  it("prints once the module arrives on the first request", async () => {
    loader.print_email(email, t);

    expect(module_spies.print_email).not.toHaveBeenCalled();

    await vi.waitFor(() =>
      expect(module_spies.print_email).toHaveBeenCalledTimes(1),
    );
    expect(module_spies.print_email).toHaveBeenCalledWith(email, t);
    expect(module_spies.loads).toBe(1);
  });

  it("prints synchronously once loaded, keeping the click gesture", () => {
    loader.print_email(email, t);
    loader.print_thread({ subject: "Thread", messages: [] }, t);

    expect(module_spies.print_email).toHaveBeenCalledTimes(1);
    expect(module_spies.print_thread).toHaveBeenCalledTimes(1);
    expect(module_spies.loads).toBe(1);
  });

  it("hands the loaded module to preloads without loading it again", async () => {
    const module = await loader.preload_print_email();

    expect(module?.setup_thread_print_intercept).toBe(
      module_spies.setup_thread_print_intercept,
    );
    expect(module_spies.loads).toBe(1);
  });
});
