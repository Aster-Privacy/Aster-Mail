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
import { describe, expect, it } from "vitest";

import { array_to_base64 } from "./base64";
import {
  SCHEDULED_TAG_CONTEXT,
  compute_scheduled_content_tag,
  scheduled_tag_message,
  verify_scheduled_content_tag,
} from "./scheduled_content_tag";

async function tag_under(identity_key: string, content: typeof rich) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity_key + SCHEDULED_TAG_CONTEXT),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return array_to_base64(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, scheduled_tag_message(content)),
    ),
  );
}

const rich = {
  to_recipients: ["friend@example.com"],
  cc_recipients: [],
  bcc_recipients: ["hidden@example.org"],
  subject: "lunch",
  body: "<p>see you at noon</p>",
  from: { name: "Me", email: "me@astermail.org" },
};

const plain = {
  to_recipients: ["a@example.com", "b@example.com"],
  cc_recipients: ["c@example.com"],
  bcc_recipients: [],
  subject: "Grüße",
  body: "line one<br>line two",
  plain_body: "line one\nline two",
  is_plain_text: true,
  in_reply_to: "<x@y>",
  thread_id: "t1",
  reply_to_id: "r1",
};

describe("scheduled content tag", () => {
  it("matches the shared vectors", async () => {
    expect(await compute_scheduled_content_tag("identity-current", rich)).toBe(
      "6cZ1oM3Sq8Z7Z/8lSNvcAMVKMac+WBhNY1ecX5JeMv0=",
    );
    expect(await compute_scheduled_content_tag("identity-current", plain)).toBe(
      "LRKYB/KcQHjpcbqTEo1/c8gLNJWtgHPX93u2/I//NY0=",
    );
  });

  it("treats the older plain text flag the same way", async () => {
    expect(
      await compute_scheduled_content_tag("identity-current", {
        ...plain,
        is_plain_text: undefined,
        plain_text: true,
      }),
    ).toBe("LRKYB/KcQHjpcbqTEo1/c8gLNJWtgHPX93u2/I//NY0=");
  });

  it("separates a recipient moved between lists", async () => {
    const tag = await compute_scheduled_content_tag("identity-current", rich);

    expect(
      await verify_scheduled_content_tag(
        ["identity-current"],
        {
          ...rich,
          to_recipients: ["friend@example.com", "hidden@example.org"],
          bcc_recipients: [],
        },
        tag,
      ),
    ).toBe(false);
  });

  it("refuses a missing or malformed tag", async () => {
    expect(
      await verify_scheduled_content_tag(["identity-current"], rich, undefined),
    ).toBe(false);
    expect(
      await verify_scheduled_content_tag(["identity-current"], rich, "%%%"),
    ).toBe(false);
  });

  it("skips empty identity entries", async () => {
    const tag = await compute_scheduled_content_tag("identity-current", rich);

    expect(await verify_scheduled_content_tag(["", null], rich, tag)).toBe(
      false,
    );
  });

  it("never accepts a tag keyed by a placeholder identity", async () => {
    for (const placeholder of ["undefined", "null", " ", "[object Object]"]) {
      const forged = await tag_under(placeholder, rich);

      expect(
        await verify_scheduled_content_tag([placeholder], rich, forged),
      ).toBe(false);
      await expect(
        compute_scheduled_content_tag(placeholder, rich),
      ).rejects.toThrow();
    }
  });
});
