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
import {
  frame_mbox_message,
  serialize_envelope,
  FilenameAllocator,
  type ExportAttachment,
} from "@/utils/export";
import {
  sink_finalize,
  sink_write_eml,
  sink_write_mbox,
  type ExportSink,
} from "./destination";
import { ExportRateLimiter } from "./rate_limiter";

export interface ExportScope {
  preset: "all" | "custom";
  folder_tokens?: string[];
  label_tokens?: string[];
  date_from?: string;
  date_to?: string;
}

export type ExportFormat = "mbox" | "eml_dir";

export interface PipelineMessage {
  message_id: string;
  envelope: DecryptedEnvelope;
  attachments: ExportAttachment[];
  folder_label?: string;
  is_sent_or_draft?: boolean;
}

export interface ExportSourceContext {
  total: number;
  current_folder?: string;
  scope: ExportScope;
}

export interface ExportSource {
  prepare(scope: ExportScope, signal: AbortSignal): Promise<ExportSourceContext>;
  messages(scope: ExportScope, signal: AbortSignal): AsyncIterable<PipelineMessage>;
}

export interface ExportProgress {
  processed: number;
  total: number;
  bytes_written: number;
  current_folder?: string;
  errors: number;
  started_at: number;
  rate_limited: boolean;
}

export interface ExportError {
  message_id_prefix?: string;
  kind: "decrypt" | "attachment" | "serialize" | "write" | "unknown";
  code: string;
}

export interface ExportSummary {
  processed: number;
  total: number;
  bytes_written: number;
  errors: ExportError[];
  cancelled: boolean;
  duration_ms: number;
}

export interface RunExportArgs {
  scope: ExportScope;
  format: ExportFormat;
  sink: ExportSink;
  source: ExportSource;
  signal: AbortSignal;
  on_progress?: (p: ExportProgress) => void;
  on_error?: (e: ExportError) => void;
}

async function hash_prefix(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < 4; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export async function run_export(args: RunExportArgs): Promise<ExportSummary> {
  const started_at = Date.now();
  const errors: ExportError[] = [];
  let processed = 0;
  let bytes_written = 0;
  let cancelled = false;
  const limiter = new ExportRateLimiter();
  const allocator = new FilenameAllocator();

  const ctx = await args.source.prepare(args.scope, args.signal);

  const progress: ExportProgress = {
    processed: 0,
    total: ctx.total,
    bytes_written: 0,
    current_folder: ctx.current_folder,
    errors: 0,
    started_at,
    rate_limited: false,
  };

  const emit = () => {
    args.on_progress?.({ ...progress });
  };
  emit();

  try {
    for await (const msg of args.source.messages(args.scope, args.signal)) {
      if (args.signal.aborted) {
        cancelled = true;
        break;
      }
      try {
        await limiter.acquire(args.signal);
        limiter.reset_backoff();

        const serialize_opts = {
          is_sent_or_draft: msg.is_sent_or_draft,
        };

        if (args.format === "mbox") {
          for await (const chunk of frame_mbox_message(
            msg.envelope,
            msg.attachments,
            serialize_opts,
          )) {
            await sink_write_mbox(args.sink, chunk);
            bytes_written += chunk.length;
          }
        } else {
          const name = await allocator.allocate({
            sent_at: msg.envelope.sent_at,
            message_id: msg.message_id,
            subject: msg.envelope.subject,
          });
          const wrote = await sink_write_eml(
            args.sink,
            name,
            serialize_envelope(msg.envelope, msg.attachments, serialize_opts),
          );
          bytes_written += wrote;
        }

        processed++;
      } catch (err) {
        const prefix = await hash_prefix(msg.message_id || "");
        const e: ExportError = {
          message_id_prefix: prefix,
          kind: classify_error(err),
          code: error_code(err),
        };
        if (e.kind === "write") {
          errors.push(e);
          args.on_error?.(e);
          throw err;
        }
        errors.push(e);
        args.on_error?.(e);
      } finally {
        (msg as any).attachments = null;
        (msg as any).envelope = null;
      }

      progress.processed = processed;
      progress.bytes_written = bytes_written;
      progress.errors = errors.length;
      progress.current_folder = msg.folder_label ?? progress.current_folder;
      emit();
    }
  } finally {
    try {
      await sink_finalize(args.sink);
    } catch (err) {
      errors.push({
        kind: "write",
        code: error_code(err),
      });
    }
  }

  return {
    processed,
    total: ctx.total,
    bytes_written,
    errors,
    cancelled,
    duration_ms: Date.now() - started_at,
  };
}

function classify_error(err: unknown): ExportError["kind"] {
  if (err instanceof DOMException && err.name === "AbortError") return "unknown";
  const msg = (err as Error)?.message ?? "";
  if (/decrypt|envelope/i.test(msg)) return "decrypt";
  if (/attachment/i.test(msg)) return "attachment";
  if (/serialize|mime/i.test(msg)) return "serialize";
  if (/write|disk|quota/i.test(msg)) return "write";
  return "unknown";
}

function error_code(err: unknown): string {
  if (err instanceof DOMException) return err.name;
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code: unknown }).code);
  }
  if (err instanceof Error) return err.name;
  return "Error";
}
