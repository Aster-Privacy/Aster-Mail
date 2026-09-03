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
import { describe, it, expect } from "vitest";

import {
  create_sink,
  sink_abort,
  sink_complete,
  sink_salvage,
  sink_write_data_file,
  sink_write_eml,
  sink_write_mbox,
  suggested_zip_filename,
  type SinkBackend,
} from "./destination";

class FakeBackend implements SinkBackend {
  chunks: number[] = [];
  bytes = 0;
  completed_as: string | null = null;
  aborted = false;
  fail_on_write = false;

  async write(chunk: Uint8Array): Promise<void> {
    if (this.fail_on_write) throw new Error("disk full");
    this.chunks.push(chunk.length);
    this.bytes += chunk.length;
  }

  async complete(filename: string): Promise<void> {
    if (this.fail_on_write) throw new Error("disk full");
    this.completed_as = filename;
  }

  async abort(): Promise<void> {
    this.aborted = true;
  }
}

const text = (value: string) => new TextEncoder().encode(value);

async function* eml_body(parts: string[]): AsyncIterable<Uint8Array> {
  for (const p of parts) yield text(p);
}

describe("export destination", () => {
  it("streams a mailbox and data files into one archive", async () => {
    const backend = new FakeBackend();
    const sink = create_sink("aster_export.zip", backend);

    for (let i = 0; i < 100; i++) {
      await sink_write_mbox(sink, text("From aster\r\nline " + i + "\r\n"));
    }
    await sink_write_data_file(sink, "contacts.vcf", text("BEGIN:VCARD"));
    await sink_write_data_file(sink, "settings.json", text("{}"));
    await sink_complete(sink);

    expect(backend.completed_as).toBe("aster_export.zip");
    expect(backend.aborted).toBe(false);
    expect(backend.bytes).toBe(sink.writer.bytes_written);
    expect(sink.writer.entry_count).toBe(3);
  });

  it("holds small writes in the buffer instead of hitting the backend", async () => {
    const backend = new FakeBackend();
    const sink = create_sink("aster_export.zip", backend);

    await sink_write_mbox(sink, text("a short message"));
    expect(backend.chunks).toHaveLength(0);
    expect(sink.target.pending).toBeGreaterThan(0);

    await sink_complete(sink);
    expect(backend.chunks.length).toBeGreaterThan(0);
  });

  it("keeps buffered bytes bounded while streaming a large mailbox", async () => {
    const backend = new FakeBackend();
    const sink = create_sink("aster_export.zip", backend);
    const megabyte = new Uint8Array(1024 * 1024).fill(65);

    for (let i = 0; i < 64; i++) {
      await sink_write_mbox(sink, megabyte);
      expect(sink.target.pending).toBeLessThanOrEqual(4 * 1024 * 1024);
    }
    await sink_complete(sink);

    expect(sink.bytes).toBe(64 * 1024 * 1024);
    expect(Math.max(...backend.chunks)).toBeLessThanOrEqual(4 * 1024 * 1024);
  });

  it("counts the bytes written for each eml entry", async () => {
    const backend = new FakeBackend();
    const sink = create_sink("aster_export.zip", backend);

    const wrote = await sink_write_eml(
      sink,
      "one.eml",
      eml_body(["ab", "cde"]),
    );

    expect(wrote).toBe(5);
    expect(sink.bytes).toBe(5);
    await sink_complete(sink);
    expect(backend.completed_as).toBe("aster_export.zip");
  });

  it("gives repeated data file names their own entry", async () => {
    const backend = new FakeBackend();
    const sink = create_sink("aster_export.zip", backend);

    await sink_write_data_file(sink, "contacts.vcf", text("first"));
    await sink_write_data_file(sink, "contacts.vcf", text("second"));
    await sink_complete(sink);

    expect(sink.writer.entry_count).toBe(2);
  });

  it("refuses to reopen the mailbox once another entry follows it", async () => {
    const backend = new FakeBackend();
    const sink = create_sink("aster_export.zip", backend);

    await sink_write_mbox(sink, text("first"));
    await sink_write_data_file(sink, "contacts.vcf", text("x"));
    await expect(sink_write_mbox(sink, text("second"))).rejects.toThrow(
      /closed before the export finished/,
    );
  });

  it("aborts without completing the file", async () => {
    const backend = new FakeBackend();
    const sink = create_sink("aster_export.zip", backend);

    await sink_write_mbox(sink, text("partial"));
    await sink_abort(sink);

    expect(backend.aborted).toBe(true);
    expect(backend.completed_as).toBeNull();
  });

  it("settles only once", async () => {
    const backend = new FakeBackend();
    const sink = create_sink("aster_export.zip", backend);

    await sink_write_mbox(sink, text("done"));
    await sink_complete(sink);
    await sink_abort(sink);

    expect(backend.aborted).toBe(false);
  });

  it("salvages the messages written so far when the export fails", async () => {
    const backend = new FakeBackend();
    const sink = create_sink("aster_export.zip", backend);

    for (let i = 0; i < 20; i++) {
      await sink_write_mbox(sink, text("From aster\r\nmessage " + i + "\r\n"));
    }
    const salvaged = await sink_salvage(sink);

    expect(salvaged).toBe(true);
    expect(backend.completed_as).toBe("aster_export.zip");
    expect(backend.aborted).toBe(false);
    expect(sink.writer.entry_count).toBe(1);
  });

  it("falls back to aborting when the salvage itself fails", async () => {
    const backend = new FakeBackend();
    const sink = create_sink("aster_export.zip", backend);

    await sink_write_mbox(sink, text("partial"));
    backend.fail_on_write = true;
    const salvaged = await sink_salvage(sink);

    expect(salvaged).toBe(false);
    expect(backend.aborted).toBe(true);
    expect(backend.completed_as).toBeNull();
  });

  it("suggests a zip filename stamped with the current time", () => {
    expect(suggested_zip_filename()).toMatch(/^aster_export_\d{8}-\d{6}\.zip$/);
  });
});
