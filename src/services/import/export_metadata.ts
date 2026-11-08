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
import type { ParsedEmail } from "./types";

const METADATA_SUFFIX = ".metadata.json";
const LABELS_FILE_NAME = "labels.json";
const INTERNAL_ID_HEADER = "x-pm-internal-id";
const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_LABELS_BYTES = 8 * 1024 * 1024;
const MAX_LABEL_IDS_PER_MESSAGE = 200;
const MAX_LABEL_NAME_LENGTH = 512;
const MAX_LABEL_INPUT_LENGTH = 4096;
const FOLDER_LABEL_TYPE = 3;
const TAG_LABEL_TYPE = 1;

const SYSTEM_LABELS = new Map<string, string>([
  ["0", "Inbox"],
  ["1", "Drafts"],
  ["2", "Sent"],
  ["3", "Trash"],
  ["4", "Spam"],
  ["6", "Archive"],
  ["7", "Sent"],
  ["8", "Drafts"],
  ["10", "Starred"],
]);

interface ExportLabel {
  name: string;
  type: number;
}

interface ExportMessage {
  label_ids: string[];
  unread?: boolean;
}

export interface ExportMetadataIndex {
  labels: Map<string, ExportLabel>;
  by_id: Map<string, ExportMessage>;
  by_base: Map<string, ExportMessage>;
}

function base_name(name: string): string {
  const parts = name.split(/[\\/]/);

  return parts[parts.length - 1] ?? name;
}

function strip_extension(name: string): string {
  const base = base_name(name);
  const lower = base.toLowerCase();

  if (lower.endsWith(METADATA_SUFFIX)) {
    return base.slice(0, base.length - METADATA_SUFFIX.length);
  }

  const dot = base.lastIndexOf(".");

  return dot > 0 ? base.slice(0, dot) : base;
}

export function is_export_sidecar_file(name: string): boolean {
  const lower = base_name(name).toLowerCase();

  return lower === LABELS_FILE_NAME || lower.endsWith(METADATA_SUFFIX);
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parse_payload(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);

    if (is_record(parsed) && "Payload" in parsed) return parsed.Payload;

    return parsed;
  } catch {
    return null;
  }
}

async function read_payload(file: File, max_bytes: number): Promise<unknown> {
  if (file.size > max_bytes) return null;

  try {
    return parse_payload(await file.text());
  } catch {
    return null;
  }
}

function parse_unread(value: unknown): boolean | undefined {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;

  return undefined;
}

function is_printable(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;

  if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return false;
  if (code === 0x200e || code === 0x200f) return false;
  if (code >= 0x202a && code <= 0x202e) return false;

  return code < 0x2066 || code > 0x2069;
}

const TAG_PATH_SEPARATOR = "/";
const FOLDER_PATH_SEPARATOR = /[\\/]/;

function clean_label_path(
  value: string,
  separator: string | RegExp = TAG_PATH_SEPARATOR,
): string {
  return Array.from(value.slice(0, MAX_LABEL_INPUT_LENGTH))
    .filter(is_printable)
    .join("")
    .split(separator)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join("/");
}

function label_name(
  entry: Record<string, unknown>,
  is_folder: boolean,
): string {
  const separator = is_folder ? FOLDER_PATH_SEPARATOR : TAG_PATH_SEPARATOR;
  const path = entry.Path;
  let name = "";

  if (typeof path === "string") name = clean_label_path(path, separator);
  else if (Array.isArray(path)) {
    name = clean_label_path(
      path
        .filter((part): part is string => typeof part === "string")
        .map((part) => clean_label_path(part, separator))
        .join("/"),
      separator,
    );
  }

  if (!name && typeof entry.Name === "string") {
    name = clean_label_path(entry.Name, separator);
  }

  return clean_label_path(name.slice(0, MAX_LABEL_NAME_LENGTH), separator);
}

export function parse_export_labels(
  payload: unknown,
): Map<string, ExportLabel> {
  const labels = new Map<string, ExportLabel>();

  if (!Array.isArray(payload)) return labels;

  for (const entry of payload) {
    if (!is_record(entry) || typeof entry.ID !== "string") continue;

    const type = typeof entry.Type === "number" ? entry.Type : 0;
    const name = label_name(entry, type === FOLDER_LABEL_TYPE);

    if (!name) continue;
    labels.set(entry.ID, { name, type });
  }

  return labels;
}

export function parse_export_message(
  payload: unknown,
): { id: string | null; message: ExportMessage } | null {
  if (!is_record(payload) || !Array.isArray(payload.LabelIDs)) return null;

  const label_ids = payload.LabelIDs.filter(
    (id): id is string => typeof id === "string",
  ).slice(0, MAX_LABEL_IDS_PER_MESSAGE);

  return {
    id: typeof payload.ID === "string" ? payload.ID : null,
    message: { label_ids, unread: parse_unread(payload.Unread) },
  };
}

export async function build_export_metadata_index(
  files: File[],
  is_cancelled: () => boolean = () => false,
): Promise<ExportMetadataIndex> {
  const index: ExportMetadataIndex = {
    labels: new Map(),
    by_id: new Map(),
    by_base: new Map(),
  };

  for (const file of files) {
    if (is_cancelled()) break;

    if (base_name(file.name).toLowerCase() === LABELS_FILE_NAME) {
      const labels = parse_export_labels(
        await read_payload(file, MAX_LABELS_BYTES),
      );

      for (const [id, label] of labels) index.labels.set(id, label);
      continue;
    }

    const parsed = parse_export_message(
      await read_payload(file, MAX_METADATA_BYTES),
    );

    if (!parsed) continue;
    if (parsed.id) index.by_id.set(parsed.id, parsed.message);
    index.by_base.set(strip_extension(file.name), parsed.message);
  }

  return index;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function apply_export_metadata(
  email: ParsedEmail,
  file_name: string,
  index: ExportMetadataIndex,
): void {
  const internal_id = email.raw_headers[INTERNAL_ID_HEADER]?.trim();
  const message =
    (internal_id ? index.by_id.get(internal_id) : undefined) ??
    index.by_base.get(strip_extension(file_name));

  if (!message) return;

  const labels: string[] = [];
  const folders: string[] = [];
  const tags: string[] = [];

  for (const id of message.label_ids) {
    const system = SYSTEM_LABELS.get(id);

    if (system) {
      labels.push(system);
      continue;
    }

    const label = index.labels.get(id);

    if (!label) continue;
    if (label.type === FOLDER_LABEL_TYPE) folders.push(label.name);
    else if (label.type === TAG_LABEL_TYPE) tags.push(label.name);
  }

  if (message.unread === true) labels.push("Unread");
  else if (message.unread === false) labels.push("Opened");

  email.source_labels = unique(labels);
  if (folders.length > 0) email.source_folders = unique(folders);
  if (tags.length > 0) email.source_tags = unique(tags);
}
