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
import type { EncryptedVault } from "./key_manager";

import {
  get_draft,
  create_draft,
  update_draft,
  delete_draft,
  type DraftContent,
  type DraftAttachmentData,
  type DraftWithContent,
  type DraftType,
} from "@/services/api/multi_drafts";
import { emit_drafts_changed, emit_draft_updated } from "@/hooks/mail_events";

const HASH_ALG = ["SHA", "256"].join("-");

export interface DraftData {
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  message: string;
  attachments?: DraftAttachmentData[];
}

export class DraftServiceError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "DraftServiceError";
  }
}

export class DraftConflictError extends DraftServiceError {
  constructor() {
    super("Draft version conflict occurred");
    this.name = "DraftConflictError";
  }
}

interface DraftContext {
  id: string | null;
  version: number;
  draft_type: DraftType;
  reply_to_id?: string;
  forward_from_id?: string;
  pending_save: Promise<void> | null;
  last_content_hash: string | null;
  is_deleted: boolean;
}

interface SaveResult {
  success: boolean;
  id?: string;
  version?: number;
  error?: string;
}

const DEFAULT_VERSION = 1;

function generate_context_id(): string {
  const bytes = new Uint8Array(8);

  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `ctx_${hex}`;
}

async function compute_content_hash(data: DraftData): Promise<string> {
  const content_string = JSON.stringify({
    to: data.to_recipients,
    cc: data.cc_recipients,
    bcc: data.bcc_recipients,
    subject: data.subject,
    message: data.message,
    att: (data.attachments || []).map((a) => a.id).sort(),
  });
  const encoder = new TextEncoder();
  const data_buffer = encoder.encode(content_string);
  const hash_buffer = await crypto.subtle.digest(HASH_ALG, data_buffer);
  const hash_array = Array.from(new Uint8Array(hash_buffer));

  return hash_array.map((b) => b.toString(16).padStart(2, "0")).join("");
}

class DraftManager {
  private contexts: Map<string, DraftContext> = new Map();

  create_context(
    draft_type: DraftType = "new",
    reply_to_id?: string,
    forward_from_id?: string,
  ): string {
    const context_id = generate_context_id();

    this.contexts.set(context_id, {
      id: null,
      version: DEFAULT_VERSION,
      draft_type,
      reply_to_id,
      forward_from_id,
      pending_save: null,
      last_content_hash: null,
      is_deleted: false,
    });

    return context_id;
  }

  load_context(
    draft_id: string,
    version: number,
    draft_type: DraftType = "new",
    reply_to_id?: string,
    forward_from_id?: string,
  ): string {
    const context_id = generate_context_id();

    this.contexts.set(context_id, {
      id: draft_id,
      version,
      draft_type,
      reply_to_id,
      forward_from_id,
      pending_save: null,
      last_content_hash: null,
      is_deleted: false,
    });

    return context_id;
  }

  get_context(context_id: string): DraftContext | undefined {
    return this.contexts.get(context_id);
  }

  async await_pending_save(context_id: string): Promise<void> {
    const context = this.contexts.get(context_id);

    if (!context?.pending_save) {
      return;
    }

    try {
      await context.pending_save;
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);
    }
  }

  async save_draft(
    context_id: string,
    data: DraftData,
    vault: EncryptedVault,
  ): Promise<SaveResult> {
    const context = this.contexts.get(context_id);

    if (!context) {
      return { success: false, error: "Draft context not found" };
    }

    if (context.is_deleted) {
      return { success: false, error: "Draft was deleted" };
    }

    const content_hash = await compute_content_hash(data);

    if (context.last_content_hash === content_hash) {
      return {
        success: true,
        id: context.id ?? undefined,
        version: context.version,
      };
    }

    const content: DraftContent = {
      to_recipients: data.to_recipients,
      cc_recipients: data.cc_recipients,
      bcc_recipients: data.bcc_recipients,
      subject: data.subject,
      message: data.message,
      attachments:
        data.attachments && data.attachments.length > 0
          ? data.attachments
          : undefined,
    };

    const save_promise = (async (): Promise<void> => {
      if (context.is_deleted) {
        return;
      }

      if (context.id) {
        const response = await update_draft(
          context.id,
          content,
          context.version,
          vault,
          context.draft_type,
          context.reply_to_id,
          context.forward_from_id,
        );

        if (context.is_deleted) {
          return;
        }

        if (response.code === "CONFLICT") {
          if (response.data?.version !== undefined) {
            context.version = response.data.version;

            if (context.is_deleted) {
              return;
            }

            const retry_response = await update_draft(
              context.id,
              content,
              context.version,
              vault,
              context.draft_type,
              context.reply_to_id,
              context.forward_from_id,
            );

            if (context.is_deleted) {
              return;
            }

            if (retry_response.data) {
              context.version = retry_response.data.version;
              context.last_content_hash = content_hash;
              emit_draft_updated({
                id: context.id,
                version: retry_response.data.version,
                to_recipients: content.to_recipients,
                cc_recipients: content.cc_recipients,
                bcc_recipients: content.bcc_recipients,
                subject: content.subject,
                message: content.message,
              });
            }

            return;
          }

          const new_response = await create_draft(
            content,
            vault,
            context.draft_type,
            context.reply_to_id,
            context.forward_from_id,
          );

          if (context.is_deleted) {
            if (new_response.data) {
              delete_draft(new_response.data.id).catch((error: unknown) => {
                if (import.meta.env.DEV) console.error(error);
              });
            }

            return;
          }

          if (new_response.data) {
            context.id = new_response.data.id;
            context.version = new_response.data.version;
            context.last_content_hash = content_hash;
            emit_drafts_changed();
          }

          return;
        }

        if (response.data) {
          context.version = response.data.version;
          context.last_content_hash = content_hash;
          emit_draft_updated({
            id: context.id,
            version: response.data.version,
            to_recipients: content.to_recipients,
            cc_recipients: content.cc_recipients,
            bcc_recipients: content.bcc_recipients,
            subject: content.subject,
            message: content.message,
          });
        } else if (response.error) {
          throw new DraftServiceError(response.error);
        }
      } else {
        const response = await create_draft(
          content,
          vault,
          context.draft_type,
          context.reply_to_id,
          context.forward_from_id,
        );

        if (context.is_deleted) {
          if (response.data) {
            delete_draft(response.data.id).catch((error: unknown) => {
              if (import.meta.env.DEV) console.error(error);
            });
          }

          return;
        }

        if (response.data) {
          context.id = response.data.id;
          context.version = response.data.version;
          context.last_content_hash = content_hash;
          emit_drafts_changed();
        } else {
          throw new DraftServiceError(
            response.error ?? "Failed to create draft",
          );
        }
      }
    })();

    context.pending_save = save_promise;

    try {
      await save_promise;

      return {
        success: true,
        id: context.id ?? undefined,
        version: context.version,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to save draft",
      };
    } finally {
      if (context.pending_save === save_promise) {
        context.pending_save = null;
      }
    }
  }

  async delete_draft(context_id: string): Promise<boolean> {
    const context = this.contexts.get(context_id);

    if (!context) {
      return true;
    }

    context.is_deleted = true;

    if (!context.id) {
      return true;
    }

    const draft_id = context.id;

    context.id = null;
    context.version = DEFAULT_VERSION;
    context.last_content_hash = null;

    try {
      const response = await delete_draft(draft_id);

      emit_drafts_changed();

      return response.data?.success ?? false;
    } catch {
      emit_drafts_changed();

      return false;
    }
  }

  clear_context(context_id: string): void {
    this.contexts.delete(context_id);
  }

  clear_all_contexts(): void {
    this.contexts.clear();
  }

  get_draft_id(context_id: string): string | null {
    return this.contexts.get(context_id)?.id ?? null;
  }
}

export const draft_manager = new DraftManager();

export interface DraftDataWithVersion extends DraftData {
  version: number;
  draft_type: DraftType;
  reply_to_id?: string;
  forward_from_id?: string;
}

export async function get_draft_by_id(
  id: string,
  vault: EncryptedVault,
): Promise<DraftDataWithVersion | null> {
  const response = await get_draft(id, vault);

  if (!response.data) {
    return null;
  }

  const draft: DraftWithContent = response.data;

  return {
    to_recipients: draft.content.to_recipients,
    cc_recipients: draft.content.cc_recipients,
    bcc_recipients: draft.content.bcc_recipients,
    subject: draft.content.subject,
    message: draft.content.message,
    version: draft.version,
    draft_type: draft.draft_type,
    reply_to_id: draft.reply_to_id,
    forward_from_id: draft.forward_from_id,
  };
}
