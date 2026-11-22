//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type {
  DecryptedExternalAccount,
  ForwardingEntry,
} from "@/services/api/external_accounts";
import type { TranslationFn } from "@/components/settings/external_accounts/form_types";

import { useCallback, useEffect, useRef, useState } from "react";
import { AtSymbolIcon } from "@heroicons/react/24/outline";
import { Button, IslandSection, SettingNote, Spinner } from "@aster/ui";

import {
  create_forwarding_address,
  list_external_sources,
  list_forwarding_addresses,
  open_forwarding_label,
  revoke_forwarding_address,
  rotate_forwarding_address,
  seal_forwarding_label,
  set_forwarding_label,
} from "@/services/api/external_accounts";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { show_toast } from "@/components/toast/simple_toast";
import { prompt_upgrade } from "@/components/settings/aliases/feature_lock";
import { copy_text } from "@/utils/copy_text";
import { format_date, format_time } from "@/utils/date_format";

interface ForwardingAddressSectionProps {
  account: DecryptedExternalAccount;
  t: TranslationFn;
}

interface OpenedEntry {
  entry: ForwardingEntry;
  address: string | null;
}

type PendingAction = { kind: "replace" | "remove"; id: string } | null;

function format_stamp(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return `${format_date(date)} ${format_time(date)}`;
}

async function open_entry(entry: ForwardingEntry): Promise<OpenedEntry> {
  if (!entry.encrypted_label || !entry.label_nonce) {
    return { entry, address: null };
  }
  const payload = await open_forwarding_label(
    entry.encrypted_label,
    entry.label_nonce,
  );

  return { entry, address: payload?.address || null };
}

export function ForwardingAddressSection({
  account,
  t,
}: ForwardingAddressSectionProps) {
  const [entries, set_entries] = useState<OpenedEntry[] | null>(null);
  const [busy, set_busy] = useState<"create" | "replace" | "remove" | null>(
    null,
  );
  const [pending, set_pending] = useState<PendingAction>(null);
  const mounted_ref = useRef(true);

  useEffect(() => {
    mounted_ref.current = true;

    return () => {
      mounted_ref.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const response = await list_forwarding_addresses();

    if (!mounted_ref.current) return;
    if (response.error || !response.data) {
      set_entries([]);

      return;
    }
    const mine = response.data.filter(
      (entry) => entry.account_id === account.id,
    );
    const opened = await Promise.all(mine.map(open_entry));

    if (!mounted_ref.current) return;
    set_entries(opened);
  }, [account.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const seal_and_store = async (id: string, address: string) => {
    const sealed = await seal_forwarding_label({
      label: account.label_name || account.email,
      address,
    });

    return set_forwarding_label(id, sealed);
  };

  const handle_limit = (server_code?: string) => {
    if (server_code !== "PLAN_LIMIT_EXCEEDED") return false;
    prompt_upgrade(
      t("settings.ext_v2_forwarding_limit"),
      undefined,
      "max_forwarding_addresses",
    );

    return true;
  };

  const handle_create = async () => {
    if (busy) return;
    set_busy("create");
    const sources = await list_external_sources();
    const tag_token =
      sources.data?.find(
        (source) => source.account_token === account.account_token,
      )?.tag_token ?? null;
    const response = await create_forwarding_address(account.id, tag_token);

    if (!mounted_ref.current) return;

    if (response.error || !response.data) {
      set_busy(null);
      if (!handle_limit(response.server_code)) {
        show_toast(response.error || t("common.save_failed"), "error");
      }

      return;
    }

    const created = response.data;
    const stored = await seal_and_store(
      created.forwarding.id,
      created.address,
    );

    if (!mounted_ref.current) return;
    set_busy(null);
    if (stored.error) {
      show_toast(stored.error, "error");
    } else {
      show_toast(t("settings.ext_v2_forwarding_created"), "success");
    }
    set_entries((prev) => [
      ...(prev ?? []),
      {
        entry: { ...created.forwarding, account_id: account.id },
        address: created.address,
      },
    ]);
  };

  const handle_confirm = async () => {
    if (!pending || busy) return;
    const { kind, id } = pending;

    set_busy(kind);

    if (kind === "remove") {
      const response = await revoke_forwarding_address(id);

      if (!mounted_ref.current) return;
      set_busy(null);
      set_pending(null);
      if (response.error) {
        show_toast(response.error, "error");

        return;
      }
      set_entries((prev) =>
        (prev ?? []).filter((item) => item.entry.id !== id),
      );
      show_toast(t("settings.ext_v2_forwarding_removed"), "success");

      return;
    }

    const response = await rotate_forwarding_address(id);

    if (!mounted_ref.current) return;
    if (response.error || !response.data) {
      set_busy(null);
      set_pending(null);
      if (!handle_limit(response.server_code)) {
        show_toast(response.error || t("common.save_failed"), "error");
      }

      return;
    }

    const created = response.data;
    const stored = await seal_and_store(
      created.forwarding.id,
      created.address,
    );

    if (!mounted_ref.current) return;
    set_busy(null);
    set_pending(null);
    if (stored.error) {
      show_toast(stored.error, "error");
    } else {
      show_toast(t("settings.ext_v2_forwarding_replaced"), "success");
    }
    set_entries((prev) =>
      (prev ?? []).map((item) =>
        item.entry.id === id
          ? {
              entry: { ...created.forwarding, account_id: account.id },
              address: created.address,
            }
          : item,
      ),
    );
  };

  const handle_copy = async (address: string) => {
    const ok = await copy_text(address);

    show_toast(
      ok
        ? t("common.address_copied_to_clipboard")
        : t("common.failed_to_copy_to_clipboard"),
      ok ? "success" : "error",
    );
  };

  const label = account.label_name || account.email;
  const steps = [
    t("settings.ext_v2_forwarding_step_copy"),
    t("settings.ext_v2_forwarding_step_add", { email: account.email }),
    t("settings.ext_v2_forwarding_step_confirm", {
      email: account.email,
      label,
    }),
  ];

  return (
    <IslandSection
      divided
      description={t("settings.ext_v2_forwarding_description", {
        email: account.email,
        label,
      })}
      icon={<AtSymbolIcon />}
      title={t("settings.ext_v2_forwarding_title")}
    >
      {entries === null ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : (
        <>
          {entries.map(({ entry, address }) => (
            <div
              key={entry.id}
              className="flex flex-col gap-3 px-4 py-3"
              data-testid="ext-forwarding-entry"
            >
              {address ? (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 select-all break-all rounded-md bg-surf-secondary px-3 py-2 font-mono text-[13px] text-txt-primary">
                    {address}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handle_copy(address)}
                  >
                    {t("common.copy")}
                  </Button>
                </div>
              ) : (
                <SettingNote tone="warning">
                  {t("settings.ext_v2_forwarding_hidden")}
                </SettingNote>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] text-txt-secondary">
                  {entry.last_received_at
                    ? t("settings.ext_v2_forwarding_last_received", {
                        date: format_stamp(entry.last_received_at),
                      })
                    : t("settings.ext_v2_forwarding_never_received")}
                </span>
                <div className="flex gap-2">
                  <Button
                    disabled={busy !== null}
                    size="sm"
                    variant="ghost"
                    onClick={() => set_pending({ kind: "replace", id: entry.id })}
                  >
                    {t("settings.ext_v2_forwarding_replace")}
                  </Button>
                  <Button
                    disabled={busy !== null}
                    size="sm"
                    variant="ghost"
                    onClick={() => set_pending({ kind: "remove", id: entry.id })}
                  >
                    {t("settings.ext_v2_forwarding_remove")}
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {entries.some((item) => item.address) && (
            <ol className="flex list-decimal flex-col gap-1 px-4 py-3 pl-8 text-[13px] leading-5 text-txt-secondary">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}

          {entries.length === 0 && (
            <div className="flex justify-end px-4 py-3">
              <Button
                is_loading={busy === "create"}
                size="sm"
                onClick={() => void handle_create()}
              >
                {t("settings.ext_v2_forwarding_create")}
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmationModal
        confirm_text={
          pending?.kind === "remove"
            ? t("settings.ext_v2_forwarding_remove")
            : t("settings.ext_v2_forwarding_replace")
        }
        is_loading={busy === "replace" || busy === "remove"}
        is_open={pending !== null}
        message={
          pending?.kind === "remove"
            ? t("settings.ext_v2_forwarding_remove_message")
            : t("settings.ext_v2_forwarding_replace_message", {
                email: account.email,
              })
        }
        title={
          pending?.kind === "remove"
            ? t("settings.ext_v2_forwarding_remove_title")
            : t("settings.ext_v2_forwarding_replace_title")
        }
        variant={pending?.kind === "remove" ? "danger" : "warning"}
        on_cancel={() => {
          if (!busy) set_pending(null);
        }}
        on_confirm={() => void handle_confirm()}
      />
    </IslandSection>
  );
}
