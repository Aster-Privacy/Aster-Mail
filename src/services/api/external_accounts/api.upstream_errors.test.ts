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
import { describe, it, expect, beforeEach, vi } from "vitest";

const post_mock = vi.fn();

vi.mock("@/services/api/client", () => ({
  api_client: { post: (...args: unknown[]) => post_mock(...args) },
}));

import {
  external_account_error_message,
  list_account_folders,
} from "@/services/api/external_accounts/api";
import { en } from "@/lib/i18n/translations";

const credentials = {
  host: "imap.example.com",
  port: 993,
  username: "person@example.com",
  password: "secret",
  protocol: "imap",
  use_tls: true,
};

describe("external account upstream error codes", () => {
  beforeEach(() => {
    post_mock.mockReset();
  });

  it("maps every typed server code to its translated message", () => {
    expect(
      external_account_error_message("EXTERNAL_ACCOUNT_SIGN_IN_REJECTED"),
    ).toBe(en.settings.external_sign_in_rejected);
    expect(
      external_account_error_message("EXTERNAL_ACCOUNT_SERVER_UNREACHABLE"),
    ).toBe(en.settings.external_server_unreachable);
    expect(
      external_account_error_message("EXTERNAL_ACCOUNT_RECONNECT_REQUIRED"),
    ).toBe(en.settings.external_reconnect_required);
    expect(
      external_account_error_message("EXTERNAL_ACCOUNT_MESSAGE_REJECTED"),
    ).toBe(en.settings.external_message_rejected);
  });

  it("ignores codes it does not own", () => {
    expect(external_account_error_message(undefined)).toBeUndefined();
    expect(external_account_error_message("VALIDATION_ERROR")).toBeUndefined();
    expect(external_account_error_message("constructor")).toBeUndefined();
  });

  it("shows the translated sign-in message when the server rejects credentials", async () => {
    post_mock.mockResolvedValue({
      error: "server wording",
      server_code: "EXTERNAL_ACCOUNT_SIGN_IN_REJECTED",
    });

    const result = await list_account_folders(credentials);

    expect(result.error).toBe(en.settings.external_sign_in_rejected);
    expect(result.server_code).toBe("EXTERNAL_ACCOUNT_SIGN_IN_REJECTED");
    expect(result.data).toBeUndefined();
  });

  it("keeps the server wording for errors without a typed code", async () => {
    post_mock.mockResolvedValue({ error: "server wording" });

    const result = await list_account_folders(credentials);

    expect(result.error).toBe("server wording");
    expect(result.server_code).toBeUndefined();
  });
});
