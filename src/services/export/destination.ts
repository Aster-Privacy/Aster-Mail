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
import {
  ZipStreamWriter,
  type ZipStreamTarget,
} from "@/utils/export/zip_stream";
import { trigger_download } from "@/utils/download_blob";

const MBOX_ENTRY = "mailbox.mbox";
const FLUSH_THRESHOLD = 4 * 1024 * 1024;

export interface SinkBackend {
  write(chunk: Uint8Array): Promise<void>;
  complete(filename: string): Promise<void>;
  abort(): Promise<void>;
}

export class BufferedTarget implements ZipStreamTarget {
  private backend: SinkBackend;
  private buffer: Uint8Array;
  private filled = 0;

  constructor(backend: SinkBackend, capacity: number = FLUSH_THRESHOLD) {
    this.backend = backend;
    this.buffer = new Uint8Array(capacity);
  }

  async write(chunk: Uint8Array): Promise<void> {
    if (chunk.length === 0) return;
    if (chunk.length >= this.buffer.length) {
      await this.flush();
      await this.backend.write(chunk);

      return;
    }
    if (this.filled + chunk.length > this.buffer.length) await this.flush();
    this.buffer.set(chunk, this.filled);
    this.filled += chunk.length;
  }

  async flush(): Promise<void> {
    if (this.filled === 0) return;
    const out = this.buffer.subarray(0, this.filled);

    this.filled = 0;
    this.buffer = new Uint8Array(this.buffer.length);
    await this.backend.write(out);
  }

  get pending(): number {
    return this.filled;
  }
}

class FsaBackend implements SinkBackend {
  private writer: WritableStreamDefaultWriter<Uint8Array> | null;

  constructor(writer: WritableStreamDefaultWriter<Uint8Array>) {
    this.writer = writer;
  }

  async write(chunk: Uint8Array): Promise<void> {
    if (!this.writer) throw new Error("export destination is closed");
    await this.writer.write(chunk);
  }

  async complete(): Promise<void> {
    const writer = this.writer;

    if (!writer) return;
    this.writer = null;
    await writer.close();
  }

  async abort(): Promise<void> {
    const writer = this.writer;

    if (!writer) return;
    this.writer = null;
    try {
      await writer.abort();
    } catch {
      void 0;
    }
  }
}

class BlobBackend implements SinkBackend {
  private parts: Blob[] = [];
  private staged: Uint8Array[] = [];
  private staged_bytes = 0;
  private closed = false;

  async write(chunk: Uint8Array): Promise<void> {
    if (this.closed) throw new Error("export destination is closed");
    this.staged.push(chunk.slice());
    this.staged_bytes += chunk.length;
    if (this.staged_bytes >= FLUSH_THRESHOLD * 2) this.seal();
  }

  async complete(filename: string): Promise<void> {
    if (this.closed) return;
    this.seal();
    const blob = new Blob(this.parts, { type: "application/zip" });

    this.parts = [];
    this.closed = true;
    trigger_download(blob, filename);
  }

  async abort(): Promise<void> {
    this.parts = [];
    this.staged = [];
    this.staged_bytes = 0;
    this.closed = true;
  }

  private seal(): void {
    if (this.staged.length === 0) return;
    this.parts.push(new Blob(this.staged as BlobPart[]));
    this.staged = [];
    this.staged_bytes = 0;
  }
}

export interface ZipSink {
  kind: "zip";
  filename: string;
  writer: ZipStreamWriter;
  target: BufferedTarget;
  backend: SinkBackend;
  bytes: number;
  mbox_started: boolean;
  settled: boolean;
}

export type ExportSink = ZipSink;

export function is_fsa_supported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as any).showSaveFilePicker === "function"
  );
}

export function create_sink(filename: string, backend: SinkBackend): ZipSink {
  const target = new BufferedTarget(backend);

  return {
    kind: "zip",
    filename,
    writer: new ZipStreamWriter(target),
    target,
    backend,
    bytes: 0,
    mbox_started: false,
    settled: false,
  };
}

export async function pick_zip_file(
  suggested_name: string,
): Promise<ZipSink | null> {
  if (!is_fsa_supported()) return null;
  try {
    const handle: FileSystemFileHandle = await (
      window as any
    ).showSaveFilePicker({
      suggestedName: suggested_name,
      types: [
        {
          description: "Zip archive",
          accept: { "application/zip": [".zip"] },
        },
      ],
    });
    const writable = await handle.createWritable({ keepExistingData: false });

    return create_sink(handle.name, new FsaBackend(writable.getWriter()));
  } catch (err) {
    if ((err as DOMException)?.name === "AbortError") return null;
    throw err;
  }
}

export function open_zip_blob(name: string): ZipSink {
  return create_sink(name, new BlobBackend());
}

export async function sink_write_mbox(
  sink: ExportSink,
  chunk: Uint8Array,
): Promise<void> {
  if (!sink.mbox_started) {
    await sink.writer.begin_entry(MBOX_ENTRY, { zip64: true });
    sink.mbox_started = true;
  } else if (sink.writer.open_entry_name !== MBOX_ENTRY) {
    throw new Error("mbox entry was closed before the export finished");
  }
  await sink.writer.write(chunk);
  sink.bytes += chunk.length;
}

export async function sink_write_eml(
  sink: ExportSink,
  filename: string,
  body: AsyncIterable<Uint8Array>,
): Promise<number> {
  await sink.writer.begin_entry("eml/" + filename);
  let bytes = 0;

  for await (const chunk of body) {
    await sink.writer.write(chunk);
    bytes += chunk.length;
  }
  await sink.writer.end_entry();
  sink.bytes += bytes;

  return bytes;
}

export async function sink_write_data_file(
  sink: ExportSink,
  filename: string,
  bytes: Uint8Array,
): Promise<void> {
  await sink.writer.begin_entry(filename);
  await sink.writer.write(bytes);
  await sink.writer.end_entry();
  sink.bytes += bytes.length;
}

export async function sink_finalize(sink: ExportSink): Promise<void> {
  void sink;
}

export async function sink_complete(sink: ExportSink): Promise<void> {
  if (sink.settled) return;
  sink.settled = true;
  await sink.writer.finish();
  await sink.target.flush();
  await sink.backend.complete(sink.filename);
}

export async function sink_abort(sink: ExportSink): Promise<void> {
  if (sink.settled) return;
  sink.settled = true;
  await sink.backend.abort();
}

export async function sink_salvage(sink: ExportSink): Promise<boolean> {
  if (sink.settled) return false;
  try {
    await sink_complete(sink);

    return true;
  } catch {
    sink.settled = false;
    await sink_abort(sink);

    return false;
  }
}

export function suggested_zip_filename(): string {
  const d = new Date();
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));

  return (
    "aster_export_" +
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "-" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    ".zip"
  );
}
