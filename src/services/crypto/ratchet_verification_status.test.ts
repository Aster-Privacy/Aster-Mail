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
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clear_ratchet_verification_status,
  get_message_sender_identity,
  record_message_sender_identity,
  subscribe_message_sender_identity,
} from "./ratchet_verification_status";

describe("message sender identity", () => {
  afterEach(() => {
    clear_ratchet_verification_status();
  });

  it("tells listeners when a message status is recorded", () => {
    const listener = vi.fn();
    const stop = subscribe_message_sender_identity(listener);

    record_message_sender_identity("mail-1", "unverified");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(get_message_sender_identity("mail-1")).toBe("unverified");
    stop();
  });

  it("tells listeners when a status changes but not when it repeats", () => {
    const listener = vi.fn();
    const stop = subscribe_message_sender_identity(listener);

    record_message_sender_identity("mail-1", "verified");
    record_message_sender_identity("mail-1", "verified");
    record_message_sender_identity("mail-1", "mismatch");

    expect(listener).toHaveBeenCalledTimes(2);
    expect(get_message_sender_identity("mail-1")).toBe("mismatch");
    stop();
  });

  it("stops telling a listener after it unsubscribes", () => {
    const listener = vi.fn();
    const stop = subscribe_message_sender_identity(listener);

    stop();
    record_message_sender_identity("mail-1", "unverified");

    expect(listener).not.toHaveBeenCalled();
  });

  it("tells listeners when every status is cleared", () => {
    record_message_sender_identity("mail-1", "unverified");

    const listener = vi.fn();
    const stop = subscribe_message_sender_identity(listener);

    clear_ratchet_verification_status();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(get_message_sender_identity("mail-1")).toBeNull();
    stop();
  });

  it("ignores a record with no message key", () => {
    const listener = vi.fn();
    const stop = subscribe_message_sender_identity(listener);

    record_message_sender_identity("", "mismatch");

    expect(listener).not.toHaveBeenCalled();
    stop();
  });
});
