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
import { useState, useEffect, useCallback, useMemo } from "react";
import { EyeSlashIcon } from "@heroicons/react/24/outline";

import { SettingsGroup, SettingsHeader } from "./shared";

import {
  list_ghost_aliases,
  decrypt_ghost_aliases,
  expire_ghost_alias,
  extend_ghost_alias,
  type DecryptedGhostAlias,
} from "@/services/api/ghost_aliases";
import { register_ghost_email } from "@/stores/ghost_alias_store";
import { Spinner } from "@/components/ui/spinner";
import { show_toast } from "@/components/toast/simple_toast";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { INSTANT_ALIAS_DELETE_KEY } from "@/components/settings/hooks/use_aliases";
import { app_locale, get_display_time_zone } from "@/utils/date_format";

export function GhostAliasesSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const { limits } = use_plan_limits();
  const can_expire_instantly = useMemo(
    () =>
      !limits || (limits.limits[INSTANT_ALIAS_DELETE_KEY]?.limit ?? 0) !== 0,
    [limits],
  );
  const [aliases, set_aliases] = useState<DecryptedGhostAlias[]>([]);
  const [loading, set_loading] = useState(true);
  const [load_error, set_load_error] = useState(false);
  const [action_loading, set_action_loading] = useState<string | null>(null);
  const [confirm_expire_id, set_confirm_expire_id] = useState<string | null>(
    null,
  );
  const [too_new_info, set_too_new_info] = useState<{
    is_open: boolean;
    eligible_date: string | null;
  }>({ is_open: false, eligible_date: null });

  const load_aliases = useCallback(async () => {
    set_loading(true);
    set_load_error(false);
    try {
      const response = await list_ghost_aliases();

      if (response.data?.aliases) {
        const decrypted = await decrypt_ghost_aliases(response.data.aliases);

        decrypted.forEach((a) => register_ghost_email(a.full_address));
        set_aliases(decrypted);
      } else {
        set_load_error(true);
      }
    } catch {
      set_load_error(true);
    } finally {
      set_loading(false);
    }
  }, []);

  useEffect(() => {
    load_aliases();
  }, [load_aliases]);

  const handle_expire = useCallback(
    async (alias_id: string) => {
      const alias = aliases.find((a) => a.id === alias_id);

      if (alias && !can_expire_instantly) {
        const created = new Date(alias.created_at);
        const eligible = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000);

        if (new Date() < eligible) {
          set_too_new_info({
            is_open: true,
            eligible_date: eligible.toLocaleDateString(app_locale(), {
              timeZone: get_display_time_zone(),
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
          });

          return;
        }
      }
      set_confirm_expire_id(alias_id);
    },
    [aliases, can_expire_instantly],
  );

  const expire_grace_date = useMemo(
    () =>
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString(
        app_locale(),
        {
          timeZone: get_display_time_zone(),
          month: "short",
          day: "numeric",
          year: "numeric",
        },
      ),
    [confirm_expire_id],
  );

  const confirm_expire = useCallback(async () => {
    if (!confirm_expire_id) return;
    const alias_id = confirm_expire_id;

    set_confirm_expire_id(null);
    set_action_loading(alias_id);
    try {
      const result = await expire_ghost_alias(alias_id);

      if (result.error) {
        show_toast(
          result.error || t("common.something_went_wrong_try_again"),
          "error",
        );

        return;
      }
      await load_aliases();
    } finally {
      set_action_loading(null);
    }
  }, [confirm_expire_id, load_aliases, t]);

  const handle_extend = useCallback(
    async (alias_id: string) => {
      set_action_loading(alias_id);
      try {
        const result = await extend_ghost_alias(alias_id, 30);

        if (result.error) {
          show_toast(
            result.error || t("common.something_went_wrong_try_again"),
            "error",
          );

          return;
        }
        await load_aliases();
      } finally {
        set_action_loading(null);
      }
    },
    [load_aliases, t],
  );

  const now = new Date();
  const active_aliases = aliases.filter(
    (a) => a.is_enabled && (!a.expires_at || new Date(a.expires_at) > now),
  );
  const expired_aliases = aliases.filter(
    (a) => !a.is_enabled || (a.expires_at && new Date(a.expires_at) <= now),
  );

  const format_date = (iso?: string) => {
    if (!iso) return "-";

    return new Date(iso).toLocaleDateString(app_locale(), {
      timeZone: get_display_time_zone(),
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const days_until = (iso?: string) => {
    if (!iso) return null;
    const diff = Math.ceil(
      (new Date(iso).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    return diff > 0 ? diff : 0;
  };

  const is_at_max_extension = (alias: DecryptedGhostAlias) => {
    if (!alias.expires_at) return false;
    const max_expires =
      new Date(alias.created_at).getTime() + 90 * 24 * 60 * 60 * 1000;
    const current_expires = new Date(alias.expires_at).getTime();

    return current_expires >= max_expires - 60_000;
  };

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.ghost_aliases_title")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="px-4 pt-4">
          <p className="text-[13px] text-[var(--text-muted)]">
            {t("settings.ghost_aliases_description")}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner size="md" />
          </div>
        ) : load_error ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[14px] text-[var(--text-muted)]">
              {t("settings.aliases_load_failed")}
            </p>
            <button
              className="mt-3 text-[14px] font-medium text-[var(--mobile-accent)]"
              type="button"
              onClick={() => load_aliases()}
            >
              {t("common.retry")}
            </button>
          </div>
        ) : aliases.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <EyeSlashIcon className="mx-auto mb-2 h-6 w-6 text-[var(--text-muted)]" />
            <p className="text-[14px] text-[var(--text-muted)]">
              {t("settings.ghost_aliases_empty")}
            </p>
          </div>
        ) : (
          <>
            {active_aliases.length > 0 && (
              <SettingsGroup title={t("settings.ghost_alias_active")}>
                {active_aliases.map((alias) => (
                  <div
                    key={alias.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background:
                          "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)",
                      }}
                    >
                      <EyeSlashIcon className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-[var(--text-primary)]">
                        {alias.full_address}
                      </p>
                      <p className="text-[12px] text-[var(--text-muted)]">
                        {t("settings.ghost_alias_expires_in", {
                          days: days_until(alias.expires_at) ?? 0,
                        })}{" "}
                        ({format_date(alias.expires_at)})
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        className="rounded-[12px] bg-[var(--mobile-bg-card-hover)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] disabled:opacity-50"
                        disabled={
                          action_loading === alias.id ||
                          is_at_max_extension(alias)
                        }
                        type="button"
                        onClick={() => handle_extend(alias.id)}
                      >
                        {t("settings.ghost_alias_extend")}
                      </button>
                      <button
                        className="rounded-[12px] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-60"
                        disabled={action_loading === alias.id}
                        style={{
                          background:
                            "linear-gradient(180deg, #ff6b6b 0%, #f74f4f 50%, #e83b3b 100%)",
                        }}
                        type="button"
                        onClick={() => handle_expire(alias.id)}
                      >
                        {t("settings.ghost_alias_expire_now")}
                      </button>
                    </div>
                  </div>
                ))}
              </SettingsGroup>
            )}

            {expired_aliases.length > 0 && (
              <SettingsGroup title={t("settings.ghost_alias_expired_grace")}>
                {expired_aliases.map((alias) => (
                  <div
                    key={alias.id}
                    className="flex items-center gap-3 px-4 py-3 opacity-60"
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background:
                          "linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)",
                      }}
                    >
                      <EyeSlashIcon className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-[var(--text-primary)]">
                        {alias.full_address}
                      </p>
                      <p className="text-[12px] text-[var(--text-muted)]">
                        {t("settings.ghost_alias_grace_until", {
                          date: format_date(alias.grace_expires_at),
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </SettingsGroup>
            )}
          </>
        )}
      </div>

      <ConfirmationModal
        confirm_text={null}
        is_open={too_new_info.is_open}
        message={t("settings.ghost_alias_too_new_message", {
          date: too_new_info.eligible_date ?? "",
        })}
        on_cancel={() =>
          set_too_new_info({ is_open: false, eligible_date: null })
        }
        on_confirm={() =>
          set_too_new_info({ is_open: false, eligible_date: null })
        }
        title={t("settings.ghost_alias_too_new_title")}
        variant="info"
      />
      <ConfirmationModal
        is_open={confirm_expire_id !== null}
        message={t("settings.ghost_alias_expire_confirm_message", {
          date: expire_grace_date,
        })}
        on_cancel={() => set_confirm_expire_id(null)}
        on_confirm={confirm_expire}
        title={t("settings.ghost_alias_expire_confirm_title")}
        variant="danger"
      />
    </div>
  );
}
