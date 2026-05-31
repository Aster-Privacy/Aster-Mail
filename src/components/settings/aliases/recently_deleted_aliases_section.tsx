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

import { useCallback, useEffect, useState } from "react";
import {
  ArrowUturnLeftIcon,
  ChevronDownIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { show_toast } from "@/components/toast/simple_toast";
import {
  list_deleted_aliases,
  restore_alias,
  decrypt_alias_field,
} from "@/services/api/aliases";

interface DecryptedDeletedAlias {
  id: string;
  full_address: string;
  display_name?: string;
  deleted_at: string;
}

interface RecentlyDeletedAliasesSectionProps {
  on_restored: () => void;
}

function decode_random_local_part(encoded: string): string {
  return new TextDecoder().decode(
    Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
  );
}

export function RecentlyDeletedAliasesSection({
  on_restored,
}: RecentlyDeletedAliasesSectionProps) {
  const { t } = use_i18n();
  const [aliases, set_aliases] = useState<DecryptedDeletedAlias[]>([]);
  const [loading, set_loading] = useState(true);
  const [load_error, set_load_error] = useState(false);
  const [expanded, set_expanded] = useState(false);
  const [restoring_id, set_restoring_id] = useState<string | null>(null);

  const load_deleted = useCallback(async () => {
    set_loading(true);
    set_load_error(false);
    try {
      const response = await list_deleted_aliases();

      if (response.error) {
        set_load_error(true);
        set_loading(false);

        return;
      }

      const rows = response.data?.aliases ?? [];

      const decrypted = await Promise.all(
        rows.map(async (row) => {
          let local_part = "";

          if (row.is_random) {
            local_part = decode_random_local_part(row.encrypted_local_part);
          } else {
            try {
              local_part = await decrypt_alias_field(
                row.encrypted_local_part,
                row.local_part_nonce,
              );
            } catch {
              local_part = "";
            }
          }

          let display_name: string | undefined;

          if (row.encrypted_display_name && row.display_name_nonce) {
            try {
              display_name = await decrypt_alias_field(
                row.encrypted_display_name,
                row.display_name_nonce,
              );
            } catch {}
          }

          return {
            id: row.id,
            full_address: `${local_part}@${row.domain}`,
            display_name,
            deleted_at: row.deleted_at,
          };
        }),
      );

      set_aliases(decrypted);
    } catch {
      set_aliases([]);
      set_load_error(true);
    } finally {
      set_loading(false);
    }
  }, []);

  useEffect(() => {
    load_deleted();
  }, [load_deleted]);

  const handle_restore = useCallback(
    async (deleted_id: string) => {
      set_restoring_id(deleted_id);
      try {
        const response = await restore_alias(deleted_id);

        if (response.error) {
          show_toast(
            t("settings.failed_restore_alias" as TranslationKey),
            "error",
          );
          await load_deleted();
        } else {
          show_toast(t("settings.alias_restored" as TranslationKey), "success");
          set_aliases((prev) => prev.filter((a) => a.id !== deleted_id));
          on_restored();
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        show_toast(
          t("settings.failed_restore_alias" as TranslationKey),
          "error",
        );
        await load_deleted();
      } finally {
        set_restoring_id(null);
      }
    },
    [t, on_restored, load_deleted],
  );

  const format_date = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  if (loading) return null;

  if (load_error) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-lg bg-surf-tertiary border border-edge-secondary">
        <p className="text-xs text-txt-muted">
          {t("settings.recently_deleted_load_failed")}
        </p>
        <Button size="sm" variant="outline" onClick={() => load_deleted()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  if (aliases.length === 0) return null;

  return (
    <div>
      <button
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 py-2 text-left"
        type="button"
        onClick={() => set_expanded((v) => !v)}
      >
        <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-txt-muted">
          <TrashIcon aria-hidden="true" className="w-4 h-4 flex-shrink-0" />
          {t("settings.recently_deleted_aliases_title" as TranslationKey)}
          <span className="text-txt-muted opacity-70">({aliases.length})</span>
        </h3>
        <ChevronDownIcon
          aria-hidden="true"
          className={`w-4 h-4 text-txt-muted transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="space-y-2">
          <p className="text-xs text-txt-muted">
            {t(
              "settings.recently_deleted_aliases_description" as TranslationKey,
            )}
          </p>
          {aliases.map((alias) => (
            <div
              key={alias.id}
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surf-tertiary border border-edge-secondary opacity-80"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background:
                    "linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)",
                }}
              >
                <TrashIcon aria-hidden="true" className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-txt-primary">
                  {alias.full_address}
                </p>
                <p className="text-xs text-txt-muted">
                  {t("settings.alias_deleted_at" as TranslationKey, {
                    date: format_date(alias.deleted_at),
                  })}
                </p>
              </div>
              <Button
                disabled={restoring_id === alias.id}
                size="sm"
                variant="depth"
                onClick={() => handle_restore(alias.id)}
              >
                {restoring_id === alias.id ? (
                  <Spinner size="xs" />
                ) : (
                  <>
                    <ArrowUturnLeftIcon
                      aria-hidden="true"
                      className="w-3.5 h-3.5"
                    />
                    {t("settings.restore_alias_action" as TranslationKey)}
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
