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
const SUPPORTED_IMPORT_EXTENSIONS = [
  ".mbox",
  ".mbx",
  ".eml",
  ".csv",
  ".tsv",
  ".pst",
  ".ost",
  ".txt",
];

export function is_supported_import_file(name: string): boolean {
  const lower = name.toLowerCase();

  return SUPPORTED_IMPORT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function filter_supported_files(files: File[]): File[] {
  return files.filter((file) => is_supported_import_file(file.name));
}

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  file?: (
    success: (file: File) => void,
    failure?: (err: unknown) => void,
  ) => void;
  createReader?: () => FileSystemDirectoryReaderLike;
}

interface FileSystemDirectoryReaderLike {
  readEntries: (
    success: (entries: FileSystemEntryLike[]) => void,
    failure?: (err: unknown) => void,
  ) => void;
}

interface DataTransferItemLike {
  webkitGetAsEntry?: () => FileSystemEntryLike | null;
  getAsFile?: () => File | null;
}

function entry_to_file(entry: FileSystemEntryLike): Promise<File | null> {
  return new Promise((resolve) => {
    if (!entry.file) {
      resolve(null);

      return;
    }

    entry.file(
      (file) => resolve(file),
      () => resolve(null),
    );
  });
}

function read_entries_batch(
  reader: FileSystemDirectoryReaderLike,
): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve) => {
    reader.readEntries(
      (entries) => resolve(entries),
      () => resolve([]),
    );
  });
}

async function read_all_entries(
  reader: FileSystemDirectoryReaderLike,
): Promise<FileSystemEntryLike[]> {
  const all: FileSystemEntryLike[] = [];

  // readEntries returns a bounded slice per call (100 in Chromium); it must be
  // called repeatedly until it yields an empty array, or larger directories
  // silently truncate.
  for (;;) {
    const batch = await read_entries_batch(reader);

    if (batch.length === 0) break;
    all.push(...batch);
  }

  return all;
}

async function walk_entry(
  entry: FileSystemEntryLike,
  out: File[],
): Promise<void> {
  if (entry.isFile) {
    const file = await entry_to_file(entry);

    if (file) out.push(file);

    return;
  }

  if (entry.isDirectory && entry.createReader) {
    const entries = await read_all_entries(entry.createReader());

    for (const child of entries) {
      await walk_entry(child, out);
    }
  }
}

export interface CollectedFiles {
  files: File[];
  from_directory: boolean;
}

export async function collect_files_from_data_transfer(
  data_transfer: DataTransfer,
): Promise<CollectedFiles> {
  const items = data_transfer.items;

  // The DataTransfer is only valid during the synchronous drop dispatch, so
  // every webkitGetAsEntry() call must happen before the first await. The
  // FileSystemEntry objects captured here stay readable afterward.
  const fallback_files = Array.from(data_transfer.files ?? []);
  const supports_entries =
    items &&
    items.length > 0 &&
    typeof (items[0] as unknown as DataTransferItemLike).webkitGetAsEntry ===
      "function";

  if (!supports_entries) {
    return { files: fallback_files, from_directory: false };
  }

  const entries: FileSystemEntryLike[] = [];
  const plain_files: File[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i] as unknown as DataTransferItemLike;
    const entry = item.webkitGetAsEntry?.() ?? null;

    if (entry) {
      entries.push(entry);
    } else {
      const file = item.getAsFile?.();

      if (file) plain_files.push(file);
    }
  }

  const from_directory = entries.some((entry) => entry.isDirectory);

  if (entries.length === 0) {
    return { files: fallback_files, from_directory: false };
  }

  const out: File[] = [];

  for (const entry of entries) {
    await walk_entry(entry, out);
  }

  return { files: [...out, ...plain_files], from_directory };
}
