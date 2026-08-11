//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, expect, it } from "vitest";

import { split_thread_records, type ThreadRecord } from "./rethread_migration";
import {
  has_reply_prefix,
  hash_message_id,
  normalize_account_address,
  normalize_subject,
  thread_token_from_root,
} from "./threading_rules";

const PARITY_USER = "11111111-2222-3333-4444-555555555555";
const PARITY_MSGID = "<Notice.1@PCloud.com>";

function to_hex(base64: string): string {
  const binary = atob(base64);
  let hex = "";

  for (let index = 0; index < binary.length; index++) {
    hex += binary.charCodeAt(index).toString(16).padStart(2, "0");
  }

  return hex;
}

const DAY_MS = 86_400_000;

function record(overrides: Partial<ThreadRecord> & { id: string }): ThreadRecord {
  const subject = overrides.subject ?? "Verify your device";

  return {
    thread_token: "token",
    ts: 0,
    message_id: null,
    ref_ids: [],
    sender: "no-reply@pcloud.com",
    account: "alias@astermail.org",
    normalized_subject: normalize_subject(subject),
    ...overrides,
    subject,
  };
}

function group_ids(groups: ThreadRecord[][]): string[][] {
  return groups.map((group) => group.map((entry) => entry.id));
}

describe("split_thread_records", () => {
  it("splits same-subject mail arriving on different aliases", () => {
    const groups = split_thread_records([
      record({
        id: "a",
        ts: 0,
        message_id: "<a@pcloud.com>",
        account: "one@astermail.org",
      }),
      record({
        id: "b",
        ts: 1000,
        message_id: "<b@pcloud.com>",
        account: "two@astermail.org",
      }),
      record({
        id: "c",
        ts: 2000,
        message_id: "<c@pcloud.com>",
        account: "three@astermail.org",
      }),
    ]);

    expect(group_ids(groups)).toEqual([["a"], ["b"], ["c"]]);
  });

  it("splits same-alias same-subject mail that carries no reply prefix", () => {
    const groups = split_thread_records([
      record({ id: "a", ts: 0, message_id: "<a@pcloud.com>" }),
      record({ id: "b", ts: 60_000, message_id: "<b@pcloud.com>" }),
    ]);

    expect(group_ids(groups)).toEqual([["a"], ["b"]]);
  });

  it("keeps a genuine reply attached to its parent", () => {
    const groups = split_thread_records([
      record({ id: "a", ts: 0, message_id: "<a@example.com>" }),
      record({
        id: "b",
        ts: 60_000,
        message_id: "<b@example.com>",
        ref_ids: ["<a@example.com>"],
        subject: "Re: Verify your device",
      }),
    ]);

    expect(group_ids(groups)).toEqual([["a", "b"]]);
  });

  it("vetoes a join when the references resolve to nothing", () => {
    const groups = split_thread_records([
      record({ id: "a", ts: 0, message_id: "<a@example.com>" }),
      record({
        id: "b",
        ts: 60_000,
        message_id: "<b@example.com>",
        ref_ids: ["<missing@example.com>"],
        subject: "Re: Verify your device",
      }),
    ]);

    expect(group_ids(groups)).toEqual([["a"], ["b"]]);
  });

  it("splits a reply whose subject was changed", () => {
    const groups = split_thread_records([
      record({ id: "a", ts: 0, message_id: "<a@example.com>" }),
      record({
        id: "b",
        ts: 60_000,
        message_id: "<b@example.com>",
        ref_ids: ["<a@example.com>"],
        subject: "Re: Something else entirely",
      }),
    ]);

    expect(group_ids(groups)).toEqual([["a"], ["b"]]);
  });

  it("merges a reply-prefixed message with no references inside the window", () => {
    const groups = split_thread_records([
      record({ id: "a", ts: 0, message_id: "<a@example.com>" }),
      record({
        id: "b",
        ts: 2 * DAY_MS,
        message_id: "<b@example.com>",
        subject: "Re: Verify your device",
      }),
    ]);

    expect(group_ids(groups)).toEqual([["a", "b"]]);
  });

  it("does not merge a reply-prefixed message beyond the window", () => {
    const groups = split_thread_records([
      record({ id: "a", ts: 0, message_id: "<a@example.com>" }),
      record({
        id: "b",
        ts: 8 * DAY_MS,
        message_id: "<b@example.com>",
        subject: "Re: Verify your device",
      }),
    ]);

    expect(group_ids(groups)).toEqual([["a"], ["b"]]);
  });

  it("caps a conversation at one hundred messages", () => {
    const records: ThreadRecord[] = [
      record({ id: "root", ts: 0, message_id: "<root@example.com>" }),
    ];

    for (let index = 1; index < 120; index++) {
      records.push(
        record({
          id: `r${index}`,
          ts: index * 1000,
          message_id: `<r${index}@example.com>`,
          ref_ids: ["<root@example.com>"],
          subject: "Re: Verify your device",
        }),
      );
    }

    const groups = split_thread_records(records);

    expect(groups[0].length).toBe(100);
    expect(groups.length).toBeGreaterThan(1);
  });

  it("returns a single group when nothing needs splitting", () => {
    const groups = split_thread_records([
      record({ id: "a", ts: 0, message_id: "<a@example.com>" }),
      record({
        id: "b",
        ts: 1000,
        message_id: "<b@example.com>",
        ref_ids: ["<a@example.com>"],
        subject: "Re: Verify your device",
      }),
      record({
        id: "c",
        ts: 2000,
        message_id: "<c@example.com>",
        ref_ids: ["<a@example.com>", "<b@example.com>"],
        subject: "Re: Verify your device",
      }),
    ]);

    expect(group_ids(groups)).toEqual([["a", "b", "c"]]);
  });

  it("is stable when run twice over the same input", () => {
    const input = [
      record({ id: "a", ts: 0, message_id: "<a@x.com>", account: "one@astermail.org" }),
      record({ id: "b", ts: 1000, message_id: "<b@x.com>", account: "two@astermail.org" }),
    ];

    expect(group_ids(split_thread_records(input))).toEqual(
      group_ids(split_thread_records(input)),
    );
  });
});

describe("split_thread_records reported scenarios", () => {
  it("gives each of seventeen aliases its own conversation", () => {
    const records = Array.from({ length: 17 }, (_, index) =>
      record({
        id: `n${index}`,
        ts: index * DAY_MS,
        message_id: `<n${index}@pcloud.com>`,
        account: `alias${index}@astermail.org`,
        subject: "Verify your new device",
      }),
    );

    const groups = split_thread_records(records);

    expect(groups.length).toBe(17);
    expect(groups.every((group) => group.length === 1)).toBe(true);
  });

  it("keeps five accounts on five aliases apart across months of notices", () => {
    const records: ThreadRecord[] = [];

    for (let account = 0; account < 5; account++) {
      for (let notice = 0; notice < 4; notice++) {
        records.push(
          record({
            id: `a${account}n${notice}`,
            ts: notice * 30 * DAY_MS + account,
            message_id: `<a${account}n${notice}@pcloud.com>`,
            account: `account${account}@astermail.org`,
            subject: "Verify your new device",
          }),
        );
      }
    }

    const groups = split_thread_records(records);

    expect(groups.length).toBe(20);
    expect(groups.every((group) => group.length === 1)).toBe(true);
  });

  it("leaves a real reply chain intact inside a mixed conversation", () => {
    const groups = split_thread_records([
      record({
        id: "chain_root",
        ts: 0,
        message_id: "<root@example.com>",
        sender: "colleague@example.com",
        subject: "Quarterly plan",
      }),
      record({
        id: "notice_one",
        ts: 1000,
        message_id: "<notice1@pcloud.com>",
        subject: "Verify your new device",
      }),
      record({
        id: "chain_reply",
        ts: 2000,
        message_id: "<reply@example.com>",
        ref_ids: ["<root@example.com>"],
        sender: "colleague@example.com",
        subject: "Re: Quarterly plan",
      }),
      record({
        id: "notice_two",
        ts: 3000,
        message_id: "<notice2@pcloud.com>",
        subject: "Verify your new device",
      }),
      record({
        id: "chain_third",
        ts: 4000,
        message_id: "<third@example.com>",
        ref_ids: ["<root@example.com>", "<reply@example.com>"],
        sender: "colleague@example.com",
        subject: "Re: Quarterly plan",
      }),
    ]);

    expect(group_ids(groups)).toEqual([
      ["chain_root", "chain_reply", "chain_third"],
      ["notice_one"],
      ["notice_two"],
    ]);
  });

  it("reaches the same grouping when the input arrives out of order", () => {
    const ordered = [
      record({ id: "a", ts: 0, message_id: "<a@example.com>" }),
      record({
        id: "b",
        ts: 1000,
        message_id: "<b@example.com>",
        ref_ids: ["<a@example.com>"],
        subject: "Re: Verify your device",
      }),
      record({ id: "c", ts: 2000, message_id: "<c@example.com>" }),
    ];

    expect(group_ids(split_thread_records([...ordered].reverse()))).toEqual(
      group_ids(split_thread_records(ordered)),
    );
  });

  it("separates messages that carry no message id of their own", () => {
    const groups = split_thread_records([
      record({ id: "a", ts: 0, message_id: null }),
      record({ id: "b", ts: 1000, message_id: null }),
    ]);

    expect(group_ids(groups)).toEqual([["a"], ["b"]]);
  });

  it("treats plus tags and capitals as the same receiving alias", () => {
    const groups = split_thread_records([
      record({
        id: "a",
        ts: 0,
        message_id: "<a@example.com>",
        account: normalize_account_address("Storage.One@Astermail.org"),
      }),
      record({
        id: "b",
        ts: 60_000,
        message_id: "<b@example.com>",
        account: normalize_account_address("storageone+pcloud@astermail.org"),
        subject: "Re: Verify your device",
      }),
    ]);

    expect(group_ids(groups)).toEqual([["a", "b"]]);
  });

  it("is idempotent when each resulting group is split again", () => {
    const groups = split_thread_records([
      record({ id: "a", ts: 0, message_id: "<a@x.com>", account: "one@astermail.org" }),
      record({ id: "b", ts: 1000, message_id: "<b@x.com>", account: "two@astermail.org" }),
      record({
        id: "c",
        ts: 2000,
        message_id: "<c@x.com>",
        account: "two@astermail.org",
        ref_ids: ["<b@x.com>"],
        subject: "Re: Verify your device",
      }),
    ]);

    for (const group of groups) {
      expect(group_ids(split_thread_records(group))).toEqual([
        group.map((entry) => entry.id),
      ]);
    }
  });

  it("starts a new conversation once the previous one is full", () => {
    const records: ThreadRecord[] = [
      record({ id: "root", ts: 0, message_id: "<root@example.com>" }),
    ];

    for (let index = 1; index < 205; index++) {
      records.push(
        record({
          id: `r${index}`,
          ts: index * 1000,
          message_id: `<r${index}@example.com>`,
          ref_ids: ["<root@example.com>"],
          subject: "Re: Verify your device",
        }),
      );
    }

    const groups = split_thread_records(records);

    expect(groups.every((group) => group.length <= 100)).toBe(true);
    expect(groups.reduce((total, group) => total + group.length, 0)).toBe(205);
  });

  it("never drops or duplicates a message", () => {
    const records = Array.from({ length: 60 }, (_, index) =>
      record({
        id: `m${index}`,
        ts: index * 3600_000,
        message_id: index % 3 === 0 ? null : `<m${index}@example.com>`,
        account: `alias${index % 4}@astermail.org`,
        subject: index % 2 === 0 ? "Verify your device" : "Re: Verify your device",
      }),
    );

    const groups = split_thread_records(records);
    const seen = groups.flat().map((entry) => entry.id).sort();

    expect(seen).toEqual(records.map((entry) => entry.id).sort());
    expect(new Set(seen).size).toBe(records.length);
  });
});

describe("threading rules parity", () => {
  it("strips stacked reply prefixes the way the server does", () => {
    expect(normalize_subject("Re: Fwd: RE: Invoice")).toBe("invoice");
    expect(normalize_subject("  AW:  Rechnung ")).toBe("rechnung");
    expect(normalize_subject("Invoice")).toBe("invoice");
  });

  it("detects a reply prefix only when a colon follows", () => {
    expect(has_reply_prefix("Re: hello")).toBe(true);
    expect(has_reply_prefix("Reminder about hello")).toBe(false);
  });

  it("normalizes the receiving address like the server", () => {
    expect(normalize_account_address("First.Last+tag@Astermail.org")).toBe(
      "firstlast@astermail.org",
    );
  });

  it("derives the same conversation token as the server", () => {
    expect(to_hex(thread_token_from_root(PARITY_USER, PARITY_MSGID))).toBe(
      "8d297745ae674c0e2290aeb1a7c111e0",
    );
  });

  it("derives the same message id hash as the server", () => {
    expect(to_hex(hash_message_id(PARITY_USER, PARITY_MSGID))).toBe(
      "cc4f9afff93bda6ddd7312942ed55527",
    );
  });
});
