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
import type { DecryptedEnvelope } from "@/types/email";
import type { EmlBuildResult } from "@/services/forward_as_attachment";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EMAIL_DRAG_MIME,
  EMAIL_SCOPE_DRAG_MIME,
  end_category_drag,
} from "@/components/email/inbox/category_drag";
import {
  EML_MIME_TYPE,
  FORWARD_AS_ATTACHMENT_EVENT,
  MAX_FORWARD_AS_ATTACHMENT,
  dropped_mail_ids,
  eml_file_from_source,
  eml_filename_for,
  forward_as_attachment,
  forwarded_subject,
  handle_mail_drop,
  has_dropped_files,
  merge_eml_attachments,
  unique_eml_filenames,
} from "@/services/forward_as_attachment";

function fake_transfer(
  data: Record<string, string>,
  file_count = 0,
): DataTransfer {
  const types = Object.keys(data);

  if (file_count > 0) types.push("Files");

  return {
    types,
    files: { length: file_count },
    getData: (mime: string) => data[mime] ?? "",
  } as unknown as DataTransfer;
}

function mail_drag(ids: unknown): DataTransfer {
  return fake_transfer({ [EMAIL_DRAG_MIME]: JSON.stringify(ids) });
}

function make_file(name: string): File {
  return new File(["x"], name, { type: EML_MIME_TYPE });
}

function make_env(
  overrides: Partial<DecryptedEnvelope> = {},
): DecryptedEnvelope {
  return {
    subject: "Quarterly report",
    body_text: "See the numbers below.\n",
    from: { name: "Alice", email: "alice@example.com" },
    to: [{ name: "Bob", email: "bob@example.com" }],
    cc: [],
    bcc: [{ name: "Hidden", email: "hidden@example.com" }],
    sent_at: "2026-05-20T14:23:11Z",
    raw_headers: [],
    ...overrides,
  };
}

async function file_text(file: File): Promise<string> {
  return new TextDecoder().decode(new Uint8Array(await file.arrayBuffer()));
}

function build_result(overrides: Partial<EmlBuildResult> = {}): EmlBuildResult {
  return {
    files: [make_file("a.eml")],
    subjects: ["a"],
    failed: 0,
    ...overrides,
  };
}

afterEach(() => {
  end_category_drag();
});

describe("eml_filename_for", () => {
  it("uses the subject as the file name", () => {
    expect(eml_filename_for("Quarterly report")).toBe("Quarterly report.eml");
  });

  it("strips characters that are unsafe in file names", () => {
    expect(eml_filename_for('Re: a/b\\c*d?"e<f>g|h')).toBe(
      "Re a b c d e f g h.eml",
    );
    expect(eml_filename_for("line\r\nbreak\u0000")).toBe("line break.eml");
  });

  it("trims leading dots and trailing dots or spaces", () => {
    expect(eml_filename_for("...hidden. . ")).toBe("hidden.eml");
  });

  it("falls back when the subject is empty", () => {
    expect(eml_filename_for("")).toBe("message.eml");
    expect(eml_filename_for(undefined)).toBe("message.eml");
    expect(eml_filename_for(null)).toBe("message.eml");
    expect(eml_filename_for(" / ")).toBe("message.eml");
  });

  it("limits the length of the name", () => {
    expect(eml_filename_for("a".repeat(300))).toBe(`${"a".repeat(80)}.eml`);
  });
});

describe("unique_eml_filenames", () => {
  it("numbers duplicate names without regard to case", () => {
    expect(unique_eml_filenames(["Hi", "hi", "Other", "HI", ""])).toEqual([
      "Hi.eml",
      "hi (2).eml",
      "Other.eml",
      "HI (3).eml",
      "message.eml",
    ]);
  });
});

describe("dropped_mail_ids", () => {
  it("returns nothing without a transfer", () => {
    expect(dropped_mail_ids(null)).toEqual([]);
  });

  it("reads the ids of dragged mail", () => {
    expect(dropped_mail_ids(mail_drag(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("removes duplicates and empty ids", () => {
    expect(dropped_mail_ids(mail_drag(["a", "", "b", "a"]))).toEqual([
      "a",
      "b",
    ]);
  });

  it("caps the number of messages", () => {
    const ids = Array.from({ length: 50 }, (_, i) => `id_${i}`);

    expect(dropped_mail_ids(mail_drag(ids))).toHaveLength(
      MAX_FORWARD_AS_ATTACHMENT,
    );
  });

  it("ignores drags that also carry files", () => {
    const transfer = fake_transfer(
      { [EMAIL_DRAG_MIME]: JSON.stringify(["a"]) },
      1,
    );

    expect(has_dropped_files(transfer)).toBe(true);
    expect(dropped_mail_ids(transfer)).toEqual([]);
  });

  it("ignores select-all scope drags", () => {
    const transfer = fake_transfer({
      [EMAIL_DRAG_MIME]: JSON.stringify(["a"]),
      [EMAIL_SCOPE_DRAG_MIME]: "1",
    });

    expect(dropped_mail_ids(transfer)).toEqual([]);
  });

  it("ignores other drags and malformed payloads", () => {
    expect(dropped_mail_ids(fake_transfer({ "text/plain": "a" }))).toEqual([]);
    expect(
      dropped_mail_ids(fake_transfer({ [EMAIL_DRAG_MIME]: "{not json" })),
    ).toEqual([]);
    expect(dropped_mail_ids(mail_drag([1, 2]))).toEqual([]);
  });
});

describe("merge_eml_attachments", () => {
  it("adds decrypted parts that are not stored yet", async () => {
    const stored = [
      {
        filename: "Report.pdf",
        mime_type: "application/pdf",
        size: 3,
        open: () => new Uint8Array([1, 2, 3]),
      },
    ];
    const merged = merge_eml_attachments(stored, [
      {
        filename: "report.pdf",
        content_type: "application/pdf",
        is_inline: false,
        data: new Uint8Array([1, 2, 3]),
      },
      {
        filename: "logo.png",
        content_type: "",
        content_id: "logo@x",
        is_inline: false,
        data: new Uint8Array([9, 9]),
      },
      {
        filename: "logo.png",
        content_type: "image/png",
        is_inline: true,
        data: new Uint8Array([9, 9]),
      },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(stored[0]);
    expect(merged[1]).toMatchObject({
      filename: "logo.png",
      mime_type: "application/octet-stream",
      size: 2,
      is_inline: true,
      content_id: "logo@x",
    });
    expect(merged[1].open()).toEqual(new Uint8Array([9, 9]));
  });
});

describe("eml_file_from_source", () => {
  it("builds an RFC 822 file without the Bcc header", async () => {
    const file = await eml_file_from_source(
      { envelope: make_env(), attachments: [] },
      "Quarterly report.eml",
    );
    const text = await file_text(file);

    expect(file.name).toBe("Quarterly report.eml");
    expect(file.type).toBe(EML_MIME_TYPE);
    expect(text).toMatch(/^From: .*alice@example\.com/m);
    expect(text).toMatch(/^To: .*bob@example\.com/m);
    expect(text).toMatch(/^Subject: Quarterly report\r$/m);
    expect(text).toMatch(/^Message-ID: <.+>\r$/im);
    expect(text).toContain("See the numbers below.");
    expect(text).not.toContain("hidden@example.com");
    expect(text).toContain("\r\n\r\n");
  });

  it("includes attachments as MIME parts", async () => {
    const file = await eml_file_from_source(
      {
        envelope: make_env(),
        attachments: [
          {
            filename: "notes.txt",
            mime_type: "text/plain",
            size: 5,
            open: () => new TextEncoder().encode("hello"),
          },
        ],
      },
      "with attachment.eml",
    );
    const text = await file_text(file);

    expect(text).toMatch(/^Content-Type: multipart\/mixed;/m);
    expect(text).toContain("notes.txt");
  });
});

describe("handle_mail_drop", () => {
  it("does nothing for drops that are not mail", () => {
    const build = vi.fn();
    const add_files = vi.fn();

    expect(
      handle_mail_drop(fake_transfer({}, 1), add_files, undefined, build),
    ).toBeNull();
    expect(build).not.toHaveBeenCalled();
    expect(add_files).not.toHaveBeenCalled();
  });

  it("attaches the built files", async () => {
    const result = build_result();
    const build = vi.fn().mockResolvedValue(result);
    const add_files = vi.fn();
    const on_failed = vi.fn();

    await handle_mail_drop(mail_drag(["a", "b"]), add_files, on_failed, build);

    expect(build).toHaveBeenCalledWith(["a", "b"]);
    expect(add_files).toHaveBeenCalledWith(result.files);
    expect(on_failed).not.toHaveBeenCalled();
  });

  it("reports messages that could not be built", async () => {
    const build = vi.fn().mockResolvedValue(build_result({ failed: 1 }));
    const add_files = vi.fn();
    const on_failed = vi.fn();

    await handle_mail_drop(mail_drag(["a", "b"]), add_files, on_failed, build);

    expect(add_files).toHaveBeenCalledTimes(1);
    expect(on_failed).toHaveBeenCalledWith(1);
  });

  it("skips attaching when no file was built", async () => {
    const build = vi
      .fn()
      .mockResolvedValue(build_result({ files: [], subjects: [], failed: 2 }));
    const add_files = vi.fn();
    const on_failed = vi.fn();

    await handle_mail_drop(mail_drag(["a", "b"]), add_files, on_failed, build);

    expect(add_files).not.toHaveBeenCalled();
    expect(on_failed).toHaveBeenCalledWith(2);
  });

  it("reports every message when the build throws", async () => {
    const build = vi.fn().mockRejectedValue(new Error("offline"));
    const on_failed = vi.fn();

    await handle_mail_drop(mail_drag(["a", "b"]), vi.fn(), on_failed, build);

    expect(on_failed).toHaveBeenCalledWith(2);
  });
});

describe("forwarded_subject", () => {
  it("prefixes a single subject", () => {
    expect(forwarded_subject(["Report"], "Fwd:")).toBe("Fwd: Report");
  });

  it("keeps an existing prefix", () => {
    expect(forwarded_subject(["Fwd: Report"], "Fwd:")).toBe("Fwd: Report");
  });

  it("uses the prefix alone for an empty subject", () => {
    expect(forwarded_subject(["  "], "Fwd:")).toBe("Fwd:");
  });

  it("leaves the subject empty for several messages", () => {
    expect(forwarded_subject(["a", "b"], "Fwd:")).toBe("");
    expect(forwarded_subject([], "Fwd:")).toBe("");
  });
});

describe("forward_as_attachment", () => {
  it("opens the composer with the built files", async () => {
    const result = build_result({ subjects: ["Report"] });
    const build = vi.fn().mockResolvedValue(result);
    const listener = vi.fn();

    window.addEventListener(FORWARD_AS_ATTACHMENT_EVENT, listener);
    try {
      await expect(forward_as_attachment(["a"], "Fwd:", build)).resolves.toBe(
        result,
      );
    } finally {
      window.removeEventListener(FORWARD_AS_ATTACHMENT_EVENT, listener);
    }

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
      files: result.files,
      subject: "Fwd: Report",
    });
  });

  it("caps the ids and skips the event when nothing was built", async () => {
    const build = vi
      .fn()
      .mockResolvedValue(build_result({ files: [], subjects: [], failed: 1 }));
    const listener = vi.fn();
    const ids = Array.from({ length: 30 }, (_, i) => `id_${i}`);

    window.addEventListener(FORWARD_AS_ATTACHMENT_EVENT, listener);
    try {
      await forward_as_attachment(ids, "Fwd:", build);
    } finally {
      window.removeEventListener(FORWARD_AS_ATTACHMENT_EVENT, listener);
    }

    expect(build.mock.calls[0][0]).toHaveLength(MAX_FORWARD_AS_ATTACHMENT);
    expect(listener).not.toHaveBeenCalled();
  });
});
