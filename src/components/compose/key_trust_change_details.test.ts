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

import { key_trust_change_details } from "./key_trust_change_details";

import { en } from "@/lib/i18n/translations/en";

function t(key: string, params: Record<string, string | number> = {}): string {
  const [, name] = key.split(".");
  const template = (en.common as unknown as Record<string, string>)[name ?? ""];

  return template.replace(/\{\{(\w+)\}\}/g, (_, field: string) =>
    String(params[field] ?? ""),
  );
}

const base = {
  email: "bob@astermail.org",
  source: "",
  observed_at: "2026-11-13T00:00:00Z",
};

describe("key_trust_change_details", () => {
  it("shows both fingerprints when both keys changed", () => {
    const details = key_trust_change_details(
      [
        {
          ...base,
          prior_fingerprint: "aaaa1111",
          new_fingerprint: "bbbb2222",
          fingerprints: [
            {
              kind: "account",
              prior_fingerprint: "aaaa1111",
              new_fingerprint: "bbbb2222",
            },
            {
              kind: "identity",
              prior_fingerprint: "cccc3333",
              new_fingerprint: "dddd4444",
            },
          ],
        },
      ],
      t,
    );

    expect(details).toBe(
      "bob@astermail.org account key: was AAAA 1111, now BBBB 2222. " +
        "bob@astermail.org identity key: was CCCC 3333, now DDDD 4444.",
    );
  });

  it("shows one fingerprint when one key changed", () => {
    expect(
      key_trust_change_details(
        [
          {
            ...base,
            prior_fingerprint: "aaaa1111",
            new_fingerprint: "bbbb2222",
          },
        ],
        t,
      ),
    ).toBe("bob@astermail.org: was AAAA 1111, now BBBB 2222.");
  });
});
