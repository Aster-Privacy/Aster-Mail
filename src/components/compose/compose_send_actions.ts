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
import type { TranslationKey } from "@/lib/i18n/types";
import type {
  Attachment,
  EditDraftData,
} from "@/components/compose/compose_shared";

import { undo_send_manager } from "@/hooks/use_undo_send";
import {
  queue_email,
  get_undo_send_delay_ms,
  execute_external_send,
} from "@/services/send_queue";
import { send_via_external_account } from "@/services/api/external_accounts";
import { prepare_external_attachments } from "@/services/crypto/attachment_crypto";
import { show_toast } from "@/components/toast/simple_toast";

export interface SendActionContext {
  undo_send_enabled: boolean;
  undo_send_seconds: number;
  undo_send_period: string;
  message: string;
  session_storage_key: string;
  edit_draft?: EditDraftData | null;
  on_close: () => void;
  on_draft_cleared?: () => void;
  reset_form: () => void;
  set_queued_email_id: (val: string | null) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

function compute_delay(ctx: SendActionContext) {
  const delay_ms = get_undo_send_delay_ms(
    ctx.undo_send_enabled,
    ctx.undo_send_seconds,
    ctx.undo_send_period,
  );

  return { delay_ms, delay_seconds: delay_ms / 1000 };
}

function save_and_close(
  ctx: SendActionContext,
  email_id: string,
  email_data: { to: string[]; cc?: string[]; bcc?: string[]; subject: string },
) {
  const saved_data = {
    to_recipients: email_data.to,
    cc_recipients: email_data.cc || [],
    bcc_recipients: email_data.bcc || [],
    subject: email_data.subject,
    message: ctx.message,
  };

  ctx.set_queued_email_id(email_id);
  sessionStorage.setItem(ctx.session_storage_key, JSON.stringify(saved_data));

  ctx.reset_form();
  ctx.on_close();
  if (ctx.edit_draft && ctx.on_draft_cleared) {
    ctx.on_draft_cleared();
  }
}

function dispatch_email_sent() {
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent("astermail:email-sent"));
  }, 100);
}

export async function execute_internal_send(
  ctx: SendActionContext,
  email_data: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    expires_at?: string;
    attachments?: Attachment[];
  },
) {
  const { delay_ms, delay_seconds } = compute_delay(ctx);

  const email_id = queue_email(
    {
      ...email_data,
      on_complete: () => {
        ctx.set_queued_email_id(null);
        ctx.on_close();
        if (delay_seconds === 0) {
          show_toast(ctx.t("common.email_sent"), "success");
        }
        dispatch_email_sent();
      },
      on_cancel: () => {
        ctx.set_queued_email_id(null);
      },
      on_error: (error: string) => {
        show_toast(error, "error");
      },
    },
    delay_ms,
  );

  if (email_id === null) {
    return;
  }

  if (delay_seconds > 0) {
    undo_send_manager.add({
      id: email_id,
      to: email_data.to,
      cc: email_data.cc,
      bcc: email_data.bcc,
      subject: email_data.subject,
      body: email_data.body,
      scheduled_time: Date.now() + delay_ms,
      total_seconds: delay_seconds,
    });
  }

  save_and_close(ctx, email_id, email_data);
}

export async function execute_external_email_send(
  ctx: SendActionContext,
  email_data: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    expires_at?: string;
    expiry_password?: string;
    attachments?: Attachment[];
  },
) {
  const { delay_ms, delay_seconds } = compute_delay(ctx);

  const external_email_data = {
    ...email_data,
    encryption_options: {
      auto_discover_keys: true,
      encrypt_emails: true,
      require_encryption: false,
    },
  };

  if (delay_seconds > 0) {
    const email_id = crypto.randomUUID();

    const timeout_id = window.setTimeout(async () => {
      try {
        await execute_external_send(external_email_data, true);
        undo_send_manager.remove(email_id);
        ctx.set_queued_email_id(null);
        dispatch_email_sent();
      } catch (err) {
        undo_send_manager.remove(email_id);
        ctx.set_queued_email_id(null);
        show_toast(
          (err as Error).message ||
            ctx.t("common.failed_to_send_external_email"),
          "error",
        );
      }
    }, delay_ms);

    undo_send_manager.add({
      id: email_id,
      to: email_data.to,
      cc: email_data.cc,
      bcc: email_data.bcc,
      subject: email_data.subject,
      body: email_data.body,
      scheduled_time: Date.now() + delay_ms,
      total_seconds: delay_seconds,
      timeout_id,
      is_external: true,
      on_send_immediately: async () => {
        window.clearTimeout(timeout_id);
        try {
          await execute_external_send(external_email_data, true);
          ctx.set_queued_email_id(null);
          dispatch_email_sent();
        } catch (err) {
          ctx.set_queued_email_id(null);
          show_toast(
            (err as Error).message ||
              ctx.t("common.failed_to_send_external_email"),
            "error",
          );
        }
      },
    });

    save_and_close(ctx, email_id, email_data);

    return;
  }

  try {
    await execute_external_send(external_email_data, true);
    show_toast(ctx.t("common.email_sent"), "success");
    dispatch_email_sent();
    ctx.reset_form();
    ctx.on_close();
    if (ctx.edit_draft && ctx.on_draft_cleared) {
      ctx.on_draft_cleared();
    }
  } catch (err) {
    show_toast(
      (err as Error).message || ctx.t("common.failed_to_send_external_email"),
      "error",
    );
  }
}

export async function execute_external_account_email_send(
  ctx: SendActionContext,
  email_data: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    sender_alias_hash?: string;
    attachments?: Attachment[];
  },
) {
  if (!email_data.sender_alias_hash) {
    show_toast(ctx.t("common.external_account_token_missing"), "error");

    return;
  }

  const { delay_ms, delay_seconds } = compute_delay(ctx);

  const account_token = email_data.sender_alias_hash;

  const external_attachments =
    email_data.attachments && email_data.attachments.length > 0
      ? prepare_external_attachments(email_data.attachments)
      : undefined;

  if (delay_seconds > 0) {
    const email_id = crypto.randomUUID();

    const timeout_id = window.setTimeout(async () => {
      try {
        const result = await send_via_external_account(
          account_token,
          email_data.to,
          email_data.cc || [],
          email_data.bcc || [],
          email_data.subject,
          email_data.body,
          external_attachments,
        );

        undo_send_manager.remove(email_id);
        ctx.set_queued_email_id(null);

        if (result.data?.success) {
          dispatch_email_sent();
        } else {
          show_toast(
            result.error || ctx.t("common.failed_to_send_email"),
            "error",
          );
        }
      } catch (err) {
        undo_send_manager.remove(email_id);
        ctx.set_queued_email_id(null);
        show_toast(
          (err as Error).message ||
            ctx.t("common.failed_to_send_via_external"),
          "error",
        );
      }
    }, delay_ms);

    undo_send_manager.add({
      id: email_id,
      to: email_data.to,
      cc: email_data.cc,
      bcc: email_data.bcc,
      subject: email_data.subject,
      body: email_data.body,
      scheduled_time: Date.now() + delay_ms,
      total_seconds: delay_seconds,
      timeout_id,
      is_external: true,
      on_send_immediately: async () => {
        window.clearTimeout(timeout_id);
        try {
          const result = await send_via_external_account(
            account_token,
            email_data.to,
            email_data.cc || [],
            email_data.bcc || [],
            email_data.subject,
            email_data.body,
            external_attachments,
          );

          ctx.set_queued_email_id(null);

          if (result.data?.success) {
            dispatch_email_sent();
          } else {
            show_toast(
              result.error || ctx.t("common.failed_to_send_email"),
              "error",
            );
          }
        } catch (err) {
          ctx.set_queued_email_id(null);
          show_toast(
            (err as Error).message ||
              ctx.t("common.failed_to_send_via_external"),
            "error",
          );
        }
      },
    });

    save_and_close(ctx, email_id, email_data);

    return;
  }

  try {
    const result = await send_via_external_account(
      account_token,
      email_data.to,
      email_data.cc || [],
      email_data.bcc || [],
      email_data.subject,
      email_data.body,
      external_attachments,
    );

    if (result.data?.success) {
      show_toast(ctx.t("common.email_sent"), "success");
      dispatch_email_sent();
    } else {
      show_toast(
        result.error || ctx.t("common.failed_to_send_email"),
        "error",
      );
    }

    ctx.reset_form();
    ctx.on_close();
    if (ctx.edit_draft && ctx.on_draft_cleared) {
      ctx.on_draft_cleared();
    }
  } catch (err) {
    show_toast(
      (err as Error).message || ctx.t("common.failed_to_send_via_external"),
      "error",
    );
  }
}
