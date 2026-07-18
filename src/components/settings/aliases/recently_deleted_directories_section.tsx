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
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import {
  list_deleted_alias_directories,
  restore_alias_directory,
  purge_deleted_alias_directory,
  empty_deleted_alias_directories,
  decrypt_deleted_alias_directory,
  type DecryptedDeletedAliasDirectory,
} from "@/services/api/alias_directories";

interface RecentlyDeletedDirectoriesSectionProps {
  on_restored: () => void;
  refresh_signal: number;
}

export function RecentlyDeletedDirectoriesSection({
  on_restored,
  refresh_signal,
}: RecentlyDeletedDirectoriesSectionProps) {
  const { t } = use_i18n();
  const [directories, set_directories] = useState<
    DecryptedDeletedAliasDirectory[]
  >([]);
  const [loading, set_loading] = useState(true);
  const [load_error, set_load_error] = useState(false);
  const [expanded, set_expanded] = useState(false);
  const [restoring_id, set_restoring_id] = useState<string | null>(null);
  const [purging_id, set_purging_id] = useState<string | null>(null);
  const [emptying, set_emptying] = useState(false);
  const [confirm_purge, set_confirm_purge] =
    useState<DecryptedDeletedAliasDirectory | null>(null);
  const [confirm_empty, set_confirm_empty] = useState(false);

  const load_deleted = useCallback(async () => {
    set_loading(true);
    set_load_error(false);
    try {
      const response = await list_deleted_alias_directories();

      if (response.error) {
        set_load_error(true);
        set_loading(false);

        return;
      }

      const rows = response.data?.directories ?? [];

      const decrypted = await Promise.all(
        rows.map((row) =>
          decrypt_deleted_alias_directory(
            row,
            t("settings.alias_directory_key_label"),
          ),
        ),
      );

      set_directories(decrypted);
    } catch {
      set_directories([]);
      set_load_error(true);
    } finally {
      set_loading(false);
    }
  }, [t]);

  useEffect(() => {
    load_deleted();
  }, [load_deleted, refresh_signal]);

  const handle_restore = useCallback(
    async (deleted_id: string) => {
      set_restoring_id(deleted_id);
      try {
        const response = await restore_alias_directory(deleted_id);

        if (response.error) {
          show_toast(t("settings.failed_restore_directory"), "error");
          await load_deleted();
        } else {
          show_toast(t("settings.directory_restored"), "success");
          set_directories((prev) => prev.filter((d) => d.id !== deleted_id));
          on_restored();
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        show_toast(t("settings.failed_restore_directory"), "error");
        await load_deleted();
      } finally {
        set_restoring_id(null);
      }
    },
    [t, on_restored, load_deleted],
  );

  const do_purge = useCallback(
    async (deleted_id: string) => {
      set_purging_id(deleted_id);
      try {
        const response = await purge_deleted_alias_directory(deleted_id);

        if (response.error) {
          show_toast(t("settings.failed_purge_directory"), "error");
          await load_deleted();
        } else {
          show_toast(t("settings.directory_purged"), "success");
          set_directories((prev) => prev.filter((d) => d.id !== deleted_id));
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error(error);
        show_toast(t("settings.failed_purge_directory"), "error");
        await load_deleted();
      } finally {
        set_purging_id(null);
      }
    },
    [t, load_deleted],
  );

  const do_empty = useCallback(async () => {
    set_emptying(true);
    try {
      const response = await empty_deleted_alias_directories();

      if (response.error) {
        show_toast(t("settings.failed_empty_trash"), "error");
        await load_deleted();
      } else {
        show_toast(t("settings.trash_emptied"), "success");
        set_directories([]);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error(error);
      show_toast(t("settings.failed_empty_trash"), "error");
      await load_deleted();
    } finally {
      set_emptying(false);
    }
  }, [t, load_deleted]);

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

  if (directories.length === 0) return null;

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
          {t("settings.recently_deleted_directories_title")}
          <span className="text-txt-muted opacity-70">
            ({directories.length})
          </span>
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-txt-muted">
              {t("settings.recently_deleted_directories_description")}
            </p>
            <Button
              disabled={emptying}
              size="sm"
              variant="ghost"
              onClick={() => set_confirm_empty(true)}
            >
              {emptying ? (
                <Spinner size="xs" />
              ) : (
                <>
                  <TrashIcon aria-hidden="true" className="w-3.5 h-3.5" />
                  {t("settings.recently_deleted_empty_trash")}
                </>
              )}
            </Button>
          </div>
          {directories.map((directory) => (
            <div
              key={directory.id}
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
                  anything.{directory.label}@{directory.domain}
                </p>
                <p className="text-xs text-txt-muted">
                  {t("settings.alias_deleted_at", {
                    date: format_date(directory.deleted_at),
                  })}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Button
                  disabled={restoring_id === directory.id}
                  size="sm"
                  variant="depth"
                  onClick={() => handle_restore(directory.id)}
                >
                  {restoring_id === directory.id ? (
                    <Spinner size="xs" />
                  ) : (
                    <>
                      <ArrowUturnLeftIcon
                        aria-hidden="true"
                        className="w-3.5 h-3.5"
                      />
                      {t("settings.restore_alias_action")}
                    </>
                  )}
                </Button>
                <Button
                  aria-label={t("settings.delete_alias_permanently_action")}
                  disabled={purging_id === directory.id}
                  size="sm"
                  variant="ghost"
                  onClick={() => set_confirm_purge(directory)}
                >
                  {purging_id === directory.id ? (
                    <Spinner size="xs" />
                  ) : (
                    <TrashIcon
                      aria-hidden="true"
                      className="w-3.5 h-3.5 text-red-500"
                    />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmationModal
        confirm_text={t("settings.delete_alias_permanently_action")}
        is_open={confirm_purge !== null}
        message={t("settings.purge_directory_confirm_message", {
          key: confirm_purge?.label ?? "",
          domain: confirm_purge?.domain ?? "",
        })}
        on_cancel={() => set_confirm_purge(null)}
        on_confirm={() => {
          const target = confirm_purge;

          set_confirm_purge(null);
          if (target) do_purge(target.id);
        }}
        title={t("settings.purge_directory_confirm_title")}
        variant="danger"
      />

      <ConfirmationModal
        confirm_text={t("settings.recently_deleted_empty_trash")}
        is_open={confirm_empty}
        message={t("settings.empty_directory_trash_confirm_message", {
          count: directories.length,
        })}
        on_cancel={() => set_confirm_empty(false)}
        on_confirm={() => {
          set_confirm_empty(false);
          do_empty();
        }}
        title={t("settings.empty_trash_confirm_title")}
        variant="danger"
      />
    </div>
  );
}
