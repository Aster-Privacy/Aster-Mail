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
import { build_store_zip } from "@/utils/export/zip";

interface ZipEntry {
  name: string;
  chunks: Uint8Array[];
  size: number;
}

export interface ZipSink {
  kind: "zip";
  filename: string;
  entries: ZipEntry[];
  by_name: Map<string, number>;
  bytes: number;
  fsa_writer: WritableStreamDefaultWriter<Uint8Array> | null;
}

export type ExportSink = ZipSink;

const MBOX_ENTRY = "mailbox.mbox";

export function is_fsa_supported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as any).showSaveFilePicker === "function"
  );
}

export async function pick_zip_file(
  suggested_name: string,
): Promise<ZipSink | null> {
  if (!is_fsa_supported()) return null;
  try {
    const handle: FileSystemFileHandle = await (window as any).showSaveFilePicker({
      suggestedName: suggested_name,
      types: [
        {
          description: "Zip archive",
          accept: { "application/zip": [".zip"] },
        },
      ],
    });
    const writable = await handle.createWritable({ keepExistingData: false });
    return {
      kind: "zip",
      filename: handle.name,
      entries: [],
      by_name: new Map(),
      bytes: 0,
      fsa_writer: writable.getWriter(),
    };
  } catch (err) {
    if ((err as DOMException)?.name === "AbortError") return null;
    throw err;
  }
}

export function open_zip_blob(name: string): ZipSink {
  return {
    kind: "zip",
    filename: name,
    entries: [],
    by_name: new Map(),
    bytes: 0,
    fsa_writer: null,
  };
}

function get_or_create_entry(sink: ZipSink, name: string): ZipEntry {
  const idx = sink.by_name.get(name);
  if (idx !== undefined) return sink.entries[idx];
  const entry: ZipEntry = { name, chunks: [], size: 0 };
  sink.by_name.set(name, sink.entries.length);
  sink.entries.push(entry);
  return entry;
}

function append_chunk(entry: ZipEntry, chunk: Uint8Array, sink: ZipSink) {
  entry.chunks.push(chunk);
  entry.size += chunk.length;
  sink.bytes += chunk.length;
}

export async function sink_write_mbox(
  sink: ExportSink,
  chunk: Uint8Array,
): Promise<void> {
  const entry = get_or_create_entry(sink, MBOX_ENTRY);
  append_chunk(entry, chunk, sink);
}

export async function sink_write_eml(
  sink: ExportSink,
  filename: string,
  body: AsyncIterable<Uint8Array>,
): Promise<number> {
  const entry = get_or_create_entry(sink, "eml/" + filename);
  let bytes = 0;
  for await (const chunk of body) {
    append_chunk(entry, chunk, sink);
    bytes += chunk.length;
  }
  return bytes;
}

export async function sink_write_data_file(
  sink: ExportSink,
  filename: string,
  bytes: Uint8Array,
): Promise<void> {
  if (sink.by_name.has(filename)) {
    sink.by_name.delete(filename);
  }
  const entry = get_or_create_entry(sink, filename);
  append_chunk(entry, bytes, sink);
}

export async function sink_finalize(_sink: ExportSink): Promise<void> {
  return;
}

export async function sink_complete(sink: ExportSink): Promise<void> {
  const flattened = sink.entries.map((e) => ({
    name: e.name,
    data: concat_chunks(e.chunks, e.size),
  }));
  const zip = build_store_zip(flattened);
  if (sink.fsa_writer) {
    try {
      await sink.fsa_writer.write(zip);
    } finally {
      await sink.fsa_writer.close();
      sink.fsa_writer = null;
    }
    return;
  }
  trigger_download(
    new Blob([new Uint8Array(zip)], { type: "application/zip" }),
    sink.filename,
  );
}

export async function sink_abort(sink: ExportSink): Promise<void> {
  if (sink.fsa_writer) {
    try {
      await sink.fsa_writer.abort();
    } catch {
      /* ignore */
    }
    sink.fsa_writer = null;
  }
}

function concat_chunks(chunks: Uint8Array[], total: number): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

export function trigger_download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
