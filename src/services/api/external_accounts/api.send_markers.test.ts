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

import { send_via_external_account } from "@/services/api/external_accounts/api";

function sent_body(): unknown {
  return (post_mock.mock.calls[0][1] as { body: unknown }).body;
}

describe("send_via_external_account", () => {
  beforeEach(() => {
    post_mock.mockReset();
    post_mock.mockResolvedValue({ data: { success: true, message: "ok" } });
  });

  it("removes signature markers from an html body", async () => {
    await send_via_external_account(
      "token-1",
      ["someone@example.com"],
      [],
      [],
      "Hello",
      '<p>Hi</p><div data-aster-signature-id="sig-1" class="sig">Thanks</div>',
    );

    expect(post_mock).toHaveBeenCalledTimes(1);
    expect(sent_body()).toBe('<p>Hi</p><div class="sig">Thanks</div>');
  });

  it("removes markers from a reply body as well", async () => {
    await send_via_external_account(
      "token-1",
      ["someone@example.com"],
      [],
      [],
      "Re: Hello",
      "<div data-aster-signature-id='sig-2'>Sig</div><blockquote>old</blockquote>",
      undefined,
      "<parent@example.com>",
    );

    expect(sent_body()).toBe("<div>Sig</div><blockquote>old</blockquote>");
  });

  it("leaves a plain text body exactly as typed", async () => {
    const typed = 'literal <div data-aster-signature-id="x">text</div>';

    await send_via_external_account(
      "token-1",
      ["someone@example.com"],
      [],
      [],
      "Hello",
      typed,
      undefined,
      undefined,
      true,
    );

    expect(sent_body()).toBe(typed);
  });
});
