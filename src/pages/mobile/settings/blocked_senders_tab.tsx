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
import type { DecryptedBlockedSender } from "@/services/api/blocked_senders";

import { useState, useCallback, useEffect } from "react";
import { PlusIcon, NoSymbolIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { show_toast } from "@/components/toast/simple_toast";
import {
  list_blocked_senders,
  unblock_sender_by_token,
  block_sender,
} from "@/services/api/blocked_senders";

export function BlockedSendersTab() {
  const { t } = use_i18n();
  const [blocked, set_blocked] = useState<DecryptedBlockedSender[]>([]);
  const [is_loading, set_is_loading] = useState(true);
  const [show_add_form, set_show_add_form] = useState(false);
  const [new_email, set_new_email] = useState("");
  const [is_adding, set_is_adding] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await list_blocked_senders();

        if (cancelled) return;
        if (result.data) set_blocked(result.data);
      } catch {
      } finally {
        if (!cancelled) set_is_loading(false);
      }
    }
    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const close_add_form = useCallback(() => {
    set_show_add_form(false);
    set_new_email("");
  }, []);

  const handle_unblock = useCallback(async (token: string) => {
    await unblock_sender_by_token(token);
    set_blocked((prev) => prev.filter((b) => b.sender_token !== token));
  }, []);

  const handle_add = useCallback(async () => {
    const value = new_email.trim();

    if (!value) return;

    const email_regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email_regex.test(value)) {
      show_toast(t("common.please_enter_valid_email"), "error");

      return;
    }
    set_is_adding(true);
    try {
      const result = await block_sender(value);

      if (result.data) {
        set_blocked((prev) => [result.data!, ...prev]);
        show_toast(
          t("common.blocked_email", { email: result.data.email }),
          "success",
        );
        close_add_form();
      } else if (result.error) {
        show_toast(result.error, "error");
      }
    } finally {
      set_is_adding(false);
    }
  }, [new_email, close_add_form, t]);

  return (
    <>
      <div className="px-4 pt-3">
        {show_add_form ? (
          <div className="rounded-xl bg-[var(--mobile-bg-card)] p-4 space-y-3">
            <Input
              autoFocus
              className="w-full"
              placeholder={t("common.email_placeholder")}
              type="email"
              value={new_email}
              onChange={(e) => set_new_email(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handle_add();
              }}
            />
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-lg bg-[var(--bg-tertiary)] py-2.5 text-[14px] font-medium text-[var(--mobile-text-secondary)]"
                type="button"
                onClick={close_add_form}
              >
                {t("common.cancel")}
              </button>
              <button
                className="flex flex-1 items-center justify-center rounded-lg bg-[var(--mobile-accent)] py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
                disabled={is_adding || !new_email.trim()}
                type="button"
                onClick={handle_add}
              >
                {is_adding ? <Spinner size="xs" /> : t("common.add")}
              </button>
            </div>
          </div>
        ) : (
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--mobile-bg-card)] py-3 text-[14px] font-medium text-[var(--mobile-accent)]"
            type="button"
            onClick={() => set_show_add_form(true)}
          >
            <PlusIcon className="h-4 w-4" />
            {t("mail.block_sender")}
          </button>
        )}
      </div>
      {is_loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="md" />
        </div>
      ) : blocked.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-8 pt-12">
          <NoSymbolIcon className="h-16 w-16 text-[var(--mobile-text-muted)] opacity-40" />
          <p className="text-center text-[14px] text-[var(--mobile-text-muted)]">
            {t("settings.no_blocked_senders")}
          </p>
        </div>
      ) : (
        <div className="px-4 pt-3 space-y-2">
          {blocked.map((sender) => (
            <div
              key={sender.id}
              className="flex items-center gap-3 rounded-xl bg-[var(--mobile-bg-card)] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] text-[var(--mobile-text-primary)]">
                  {sender.name || sender.email}
                </p>
                {sender.name && (
                  <p className="truncate text-[13px] text-[var(--mobile-text-muted)]">
                    {sender.email}
                  </p>
                )}
              </div>
              <button
                className="text-[13px] text-[var(--mobile-accent)]"
                type="button"
                onClick={() => handle_unblock(sender.sender_token)}
              >
                {t("mail.unblock_sender")}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
