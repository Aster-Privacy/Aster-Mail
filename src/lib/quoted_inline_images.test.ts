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
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/api/attachments", () => ({
  list_attachments: vi.fn(),
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  decrypt_attachment_meta: vi.fn(),
  decrypt_attachment_data: vi.fn(),
}));

import {
  cap_quoted_images,
  cap_scoped_quote_images,
  embed_quoted_cid_images,
  settle_within,
} from "./quoted_inline_images";
import {
  earlier_thread_message_ids,
  extract_body_inline_refs,
  is_body_inline_image,
  resolve_cid_references,
  without_body_inline_images,
} from "./cid_resolver";

import { extract_inline_images } from "@/components/compose/compose_shared_core";
import { list_attachments } from "@/services/api/attachments";
import {
  decrypt_attachment_meta,
  decrypt_attachment_data,
} from "@/services/crypto/attachment_crypto";

const GIF_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
const PNG_A_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8DwnwEJMCJLAgA1BgP9qZtCBgAAAABJRU5ErkJggg==";
const PNG_B_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAEUlEQVR4nGP4z8DwH4YZkDkAm34L9XKwuTwAAAAASUVORK5CYII=";

function bytes_of(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
}

interface FakePart {
  content_id: string;
  filename: string;
  b64: string;
  size_bytes?: number;
}

function serve_attachments(by_mail: Record<string, FakePart[]>): void {
  vi.mocked(list_attachments).mockImplementation((async (
    mail_item_id: string,
  ) => ({
    data: {
      attachments: (by_mail[mail_item_id] ?? []).map((part, seq_num) => ({
        id: `${mail_item_id}_${seq_num}`,
        size_bytes: part.size_bytes ?? bytes_of(part.b64).byteLength,
        mail_item_id,
        seq_num,
        encrypted_meta: `${mail_item_id}|${seq_num}`,
        meta_nonce: "n",
        encrypted_data: `${mail_item_id}|${seq_num}`,
        data_nonce: "n",
      })),
    },
  })) as never);

  vi.mocked(decrypt_attachment_meta).mockImplementation((async (
    encrypted_meta: string,
  ) => {
    const [mail_item_id, seq] = encrypted_meta.split("|");
    const part = by_mail[mail_item_id][Number(seq)];

    return {
      filename: part.filename,
      content_type: "image/png",
      content_id: `<${part.content_id}>`,
      is_inline: true,
      session_key: "key",
    };
  }) as never);

  vi.mocked(decrypt_attachment_data).mockImplementation((async (
    encrypted_data: string,
  ) => {
    const [mail_item_id, seq] = encrypted_data.split("|");

    return bytes_of(by_mail[mail_item_id][Number(seq)].b64).buffer;
  }) as never);
}

let mail_counter = 0;

function next_mail_id(): string {
  mail_counter += 1;

  return `quoted_mail_${mail_counter}`;
}

const ORIGINAL_BODY =
  '<p>Here are the screens</p><img src="cid:img_25da@ios.example"><br><img src="cid:img_2a97@ios.example">';

function original_parts(): FakePart[] {
  return [
    { content_id: "img_25da@ios.example", filename: "a.png", b64: PNG_A_B64 },
    { content_id: "img_2a97@ios.example", filename: "b.png", b64: PNG_B_B64 },
  ];
}

describe("embed_quoted_cid_images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("embeds the original bytes of each quoted inline image", async () => {
    const mail_id = next_mail_id();

    serve_attachments({ [mail_id]: original_parts() });

    const embedded = await embed_quoted_cid_images(ORIGINAL_BODY, mail_id);

    expect(embedded).not.toContain("cid:");
    expect(embedded).toContain(`data:image/png;base64,${PNG_A_B64}`);
    expect(embedded).toContain(`data:image/png;base64,${PNG_B_B64}`);

    const { processed_html, images } = extract_inline_images(
      `<p>Reply</p><blockquote>${embedded}</blockquote>`,
    );

    expect(images).toHaveLength(2);
    expect(new Uint8Array(images[0].data)).toEqual(bytes_of(PNG_A_B64));
    expect(new Uint8Array(images[1].data)).toEqual(bytes_of(PNG_B_B64));
    for (const image of images) {
      expect(processed_html).toContain(`cid:${image.cid}`);
    }
  });

  it("drops quoted images whose bytes cannot be loaded", async () => {
    const mail_id = next_mail_id();

    serve_attachments({ [mail_id]: [] });

    const embedded = await embed_quoted_cid_images(ORIGINAL_BODY, mail_id);

    expect(embedded).not.toContain("<img");
    expect(embedded).not.toContain("R0lGODlh");
    expect(embedded).toContain("Here are the screens");
    expect(extract_inline_images(embedded).images).toHaveLength(0);
  });

  it("drops placeholder pixels left by an earlier client", async () => {
    const body = `<p>Earlier reply</p><img src="${GIF_PLACEHOLDER}"><div style="background:url(${GIF_PLACEHOLDER})">x</div>`;

    const embedded = await embed_quoted_cid_images(body, next_mail_id());

    expect(embedded).not.toContain("<img");
    expect(embedded).not.toContain("R0lGODlh");
    expect(list_attachments).not.toHaveBeenCalled();
  });

  it("caps the number of quoted images", () => {
    const body = Array.from(
      { length: 25 },
      () => `<img src="data:image/png;base64,${PNG_A_B64}">`,
    ).join("");

    expect(cap_quoted_images(body).match(/<img/g)).toHaveLength(20);
  });

  it("drops quoted svg and blob images", () => {
    const body =
      '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="><img src="blob:https://mail.example/abc"><img src="https://example.com/x.png">';
    const capped = cap_quoted_images(body);

    expect(capped).not.toContain("svg+xml");
    expect(capped).not.toContain("blob:");
    expect(capped).toContain("https://example.com/x.png");
  });

  it("reads image sources as the browser does", () => {
    const capped = cap_quoted_images(
      `<img alt="a>b" src="cid&#58;x@y"><img title='src="https://e/x.png"' src="blob:https://m/a"><img/src="cid:z@y">kept`,
    );

    expect(capped).not.toContain("<img");
    expect(capped).toContain("kept");
  });

  it("caps images only inside quotes of a draft", () => {
    const own = `<img src="blob:https://mail.example/own"><img src="${GIF_PLACEHOLDER}">`;
    const html = `<p>Mine</p>${own}<div class="aster_quote"><blockquote><img src="cid:a@b"><img src="data:image/png;base64,${PNG_A_B64}"></blockquote></div>`;
    const capped = cap_scoped_quote_images(html);

    expect(capped).toContain("blob:https://mail.example/own");
    expect(capped).toContain(own);
    expect(capped).not.toContain("cid:a@b");
    expect(capped).toContain(PNG_A_B64);
    expect(cap_scoped_quote_images("<p>No quote</p>")).toBe("<p>No quote</p>");
  });

  it("fetches the original attachments once for repeated calls", async () => {
    const mail_id = next_mail_id();

    serve_attachments({ [mail_id]: original_parts() });

    await Promise.all([
      embed_quoted_cid_images(ORIGINAL_BODY, mail_id),
      embed_quoted_cid_images(ORIGINAL_BODY, mail_id),
    ]);

    expect(list_attachments).toHaveBeenCalledTimes(1);
  });

  it("settles to undefined when the work takes too long", async () => {
    const never = new Promise<string>(() => undefined);

    await expect(settle_within(never, 5)).resolves.toBeUndefined();
    await expect(settle_within(Promise.resolve("ok"), 5)).resolves.toBe("ok");
  });
});

describe("cid resolution across a thread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds quoted images in an earlier message of the thread", async () => {
    const original_id = next_mail_id();
    const reply_id = next_mail_id();

    serve_attachments({ [original_id]: original_parts(), [reply_id]: [] });

    const reply_html = `<p>Reply</p><blockquote>${ORIGINAL_BODY}</blockquote>`;
    const result = await resolve_cid_references(reply_html, reply_id, "data", [
      reply_id,
      original_id,
    ]);

    expect(result.unresolved).toBe(0);
    expect(result.html).toContain(`data:image/png;base64,${PNG_A_B64}`);
    expect(result.html).toContain(`data:image/png;base64,${PNG_B_B64}`);
  });

  it("skips related images over the size cap", async () => {
    const original_id = next_mail_id();
    const reply_id = next_mail_id();

    serve_attachments({
      [original_id]: [
        {
          content_id: "img_25da@ios.example",
          filename: "a.png",
          b64: PNG_A_B64,
          size_bytes: 6 * 1024 * 1024,
        },
      ],
      [reply_id]: [],
    });

    const result = await resolve_cid_references(
      '<img src="cid:img_25da@ios.example">',
      reply_id,
      "data",
      [original_id],
    );

    expect(result.unresolved).toBe(1);
    expect(decrypt_attachment_data).not.toHaveBeenCalled();
  });

  it("matches related messages by exact content id only", async () => {
    const original_id = next_mail_id();
    const reply_id = next_mail_id();

    serve_attachments({
      [original_id]: [
        {
          content_id: "other@example.com",
          filename: "img_25da@ios.example",
          b64: PNG_A_B64,
        },
      ],
      [reply_id]: [],
    });

    const result = await resolve_cid_references(
      '<img src="cid:img_25da@ios.example">',
      reply_id,
      "data",
      [original_id],
    );

    expect(result.unresolved).toBe(1);
    expect(result.html).not.toContain(PNG_A_B64);
  });
});

describe("earlier_thread_message_ids", () => {
  const messages = [
    { id: "a", timestamp: "2026-11-20T10:00:00Z" },
    { id: "c", timestamp: "2026-11-22T10:00:00Z" },
    { id: "b", timestamp: "2026-11-21T10:00:00Z" },
    { id: "d", timestamp: "not a date" },
  ];

  it("lists only earlier messages, nearest first", () => {
    expect(earlier_thread_message_ids(messages, "c")).toEqual(["b", "a"]);
    expect(earlier_thread_message_ids(messages, "a")).toEqual([]);
    expect(earlier_thread_message_ids(messages, "d")).toEqual([]);
    expect(earlier_thread_message_ids(messages, "missing")).toEqual([]);
  });

  it("caps the number of earlier messages", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      id: `m${index}`,
      timestamp: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
    }));

    expect(earlier_thread_message_ids(many, "m29")).toHaveLength(20);
    expect(earlier_thread_message_ids(many, "m29")[0]).toBe("m28");
  });
});

describe("sent copy inline images", () => {
  const generated = "img_0b6f1c1e-5f43-4a52-9a1d-2f0c7b1e9a11@astermail.org";

  it("hides parts generated from embedded images in the sent body", () => {
    const refs = extract_body_inline_refs(
      `<p>Hi</p><img src="data:image/png;base64,${PNG_A_B64}">`,
      true,
    );
    const items = [
      {
        filename: "image.png",
        content_type: "image/png",
        content_id: generated,
      },
      { filename: "report.pdf", content_type: "application/pdf" },
      { filename: "photo.png", content_type: "image/png" },
    ];

    expect(is_body_inline_image(items[0], refs)).toBe(true);
    expect(without_body_inline_images(items, refs)).toEqual([
      items[1],
      items[2],
    ]);
  });

  it("keeps generated parts visible on received messages", () => {
    const refs = extract_body_inline_refs(
      `<p>Hi</p><img src="data:image/png;base64,${PNG_A_B64}">`,
    );

    expect(
      is_body_inline_image(
        {
          filename: "image.png",
          content_type: "image/png",
          content_id: generated,
        },
        refs,
      ),
    ).toBe(false);
  });

  it("keeps generated parts visible unless they are embedded images", () => {
    const text_refs = extract_body_inline_refs(
      "<p>Paste data:image/png;base64,AAAA here</p>",
      true,
    );
    const image_refs = extract_body_inline_refs(
      `<img src="data:image/png;base64,${PNG_A_B64}">`,
      true,
    );
    const item = {
      filename: "image.png",
      content_type: "image/png",
      content_id: generated,
    };

    expect(is_body_inline_image(item, text_refs)).toBe(false);
    expect(
      is_body_inline_image(
        { ...item, content_type: "application/pdf" },
        image_refs,
      ),
    ).toBe(false);
  });

  it("keeps generated parts visible when the body embeds no images", () => {
    const refs = extract_body_inline_refs("<p>Hi</p>");

    expect(
      is_body_inline_image(
        {
          filename: "image.png",
          content_type: "image/png",
          content_id: generated,
        },
        refs,
      ),
    ).toBe(false);
  });
});
