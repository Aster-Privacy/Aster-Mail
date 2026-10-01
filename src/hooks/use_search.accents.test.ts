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
import type { DecryptedIndexEntry } from "./use_search/types";
import type { MailItem } from "@/services/api/mail";
import type { DecryptedEnvelope } from "@/types/email";

import { describe, it, expect } from "vitest";

import { entry_haystack } from "./use_search/haystack";
import { matches_operator, matches_query } from "./use_search/matching";

import { parse_search_query } from "@/utils/search_operators";

function envelope_with(
  overrides: Partial<Record<"subject" | "body_text", string>> & {
    from_name?: string;
    to_name?: string;
  } = {},
): DecryptedEnvelope {
  return {
    subject: overrides.subject ?? "Mudança de morada",
    body_text: overrides.body_text ?? "",
    body_html: "",
    html_body: "",
    from: {
      name: overrides.from_name ?? "João Silva",
      email: "joao@sender.test",
    },
    to: [
      {
        name: overrides.to_name ?? "Ana Conceição",
        email: "ana@recipient.test",
      },
    ],
    cc: [],
    bcc: [],
    sent_at: "2026-01-01T00:00:00.000Z",
  } as unknown as DecryptedEnvelope;
}

const item = {
  id: "m1",
  item_type: "received",
  is_trashed: false,
  is_spam: false,
  is_archived: false,
  message_ts: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
} as unknown as MailItem;

function entry_of(
  envelope: DecryptedEnvelope,
  search_body_text = "",
): DecryptedIndexEntry {
  return {
    envelope,
    metadata: { is_read: false, is_starred: false, has_attachments: false },
    search_body_text,
    meta_fp: "",
    has_body: true,
  } as unknown as DecryptedIndexEntry;
}

function query_matches(
  terms: string[],
  entry: DecryptedIndexEntry,
  search_body = true,
): boolean {
  return matches_query(
    terms,
    [],
    entry.envelope,
    entry.metadata,
    item,
    undefined,
    undefined,
    search_body,
    entry.search_body_text,
    entry_haystack(entry),
  );
}

function operator_matches(query: string, entry: DecryptedIndexEntry): boolean {
  return parse_search_query(query).operators.every((op) =>
    matches_operator(
      op,
      entry.envelope!,
      entry.metadata,
      item,
      undefined,
      entry.search_body_text,
      entry_haystack(entry),
    ),
  );
}

describe("accent-insensitive search", () => {
  it("finds an accented subject from an unaccented term, and back", () => {
    expect(query_matches(["mudanca"], entry_of(envelope_with()))).toBe(true);
    expect(query_matches(["MUDANÇA"], entry_of(envelope_with()))).toBe(true);
    expect(
      query_matches(
        ["mudança"],
        entry_of(envelope_with({ subject: "Mudanca" })),
      ),
    ).toBe(true);
  });

  it("finds accented sender and recipient names", () => {
    const entry = entry_of(envelope_with());

    expect(query_matches(["joao"], entry)).toBe(true);
    expect(query_matches(["conceicao"], entry)).toBe(true);
  });

  it("folds the body, including decomposed text, and only when body search is on", () => {
    const entry = entry_of(
      envelope_with({ subject: "Aviso" }),
      "a transfere\u0302ncia foi feita",
    );

    expect(query_matches(["transferencia"], entry)).toBe(true);
    expect(query_matches(["transferência"], entry)).toBe(true);
    expect(query_matches(["transferencia"], entry, false)).toBe(false);
  });

  it("folds from:, to: and subject: values", () => {
    const entry = entry_of(envelope_with());

    expect(operator_matches("from:joao", entry)).toBe(true);
    expect(operator_matches("from:João", entry)).toBe(true);
    expect(operator_matches("to:conceicao", entry)).toBe(true);
    expect(operator_matches("subject:mudanca", entry)).toBe(true);
    expect(
      operator_matches(
        "from:joão",
        entry_of(envelope_with({ from_name: "Joao Silva" })),
      ),
    ).toBe(true);
  });

  it("keeps full addresses exact, so a look-alike sender is not matched", () => {
    const plain = entry_of(envelope_with());
    const accented = entry_of({
      ...envelope_with(),
      from: { name: "João Silva", email: "joão@sender.test" },
    } as unknown as DecryptedEnvelope);

    expect(operator_matches("from:joao@sender.test", plain)).toBe(true);
    expect(operator_matches("from:joao@sender.test", accented)).toBe(false);
    expect(operator_matches("from:joão@sender.test", plain)).toBe(false);
    expect(operator_matches("from:joao", accented)).toBe(true);
  });

  it("does not turn different words into matches", () => {
    const entry = entry_of(envelope_with(), "a mudança de morada");

    expect(query_matches(["mudar"], entry)).toBe(false);
    expect(query_matches(["morado"], entry)).toBe(false);
    expect(operator_matches("subject:transferencia", entry)).toBe(false);
  });
});
