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
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  execute_send: vi.fn(),
}));

vi.mock("@/components/toast/simple_toast", () => ({ show_toast: h.toast }));

vi.mock("./send_queue_encryption", async (import_original) => ({
  ...(await import_original<typeof import("./send_queue_encryption")>()),
  check_send_readiness_internal: () => ({ ready: true }),
  execute_send: h.execute_send,
}));

import { send_queue } from "./send_queue";

import { CryptoModuleLoadError } from "@/services/crypto/openpgp_loader";
import { en } from "@/lib/i18n/translations/en";

describe("send queue when the encryption module cannot load", () => {
  it("reports the load error and hands the email back instead of sending", async () => {
    h.execute_send.mockRejectedValueOnce(
      new CryptoModuleLoadError(
        new TypeError("Failed to fetch dynamically imported module"),
        en.errors.crypto_module_unavailable,
      ),
    );

    const on_error = vi.fn();
    const on_cancel = vi.fn();
    const on_complete = vi.fn();
    const id = send_queue.queue(
      {
        to: ["sam@example.com"],
        subject: "Hello",
        body: "Body",
        on_complete,
        on_cancel,
        on_error,
      },
      60_000,
    );

    expect(id).not.toBeNull();

    await send_queue.send_now(id!);

    expect(on_complete).not.toHaveBeenCalled();
    expect(on_cancel).toHaveBeenCalledTimes(1);
    expect(on_error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: en.errors.crypto_module_unavailable,
      }),
    );
    expect(h.toast).toHaveBeenCalledWith(
      en.errors.crypto_module_unavailable,
      "error",
    );
  });
});
