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
import { useState, useEffect, useCallback } from "react";
import { EyeSlashIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import {
  list_ghost_aliases,
  decrypt_ghost_aliases,
  expire_ghost_alias,
  extend_ghost_alias,
  type DecryptedGhostAlias,
} from "@/services/api/ghost_aliases";
import { register_ghost_email } from "@/stores/ghost_alias_store";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { use_i18n } from "@/lib/i18n/context";

export function GhostAliasesSection() {
  const { t } = use_i18n();
  const [aliases, set_aliases] = useState<DecryptedGhostAlias[]>([]);
  const [loading, set_loading] = useState(true);
  const [action_loading, set_action_loading] = useState<string | null>(null);
  const [too_new_info, set_too_new_info] = useState<{
    is_open: boolean;
    eligible_date: string | null;
  }>({ is_open: false, eligible_date: null });

  const load_aliases = useCallback(async () => {
    set_loading(true);
    try {
      const response = await list_ghost_aliases();

      if (response.data?.aliases) {
        const decrypted = await decrypt_ghost_aliases(response.data.aliases);

        decrypted.forEach((a) => register_ghost_email(a.full_address));
        set_aliases(decrypted);
      }
    } catch {
      set_aliases([]);
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

      if (alias) {
        const created = new Date(alias.created_at);
        const eligible = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000);

        if (new Date() < eligible) {
          set_too_new_info({
            is_open: true,
            eligible_date: eligible.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
          });

          return;
        }
      }
      set_action_loading(alias_id);
      try {
        await expire_ghost_alias(alias_id);
        await load_aliases();
      } finally {
        set_action_loading(null);
      }
    },
    [load_aliases, aliases],
  );

  const handle_extend = useCallback(
    async (alias_id: string) => {
      set_action_loading(alias_id);
      try {
        await extend_ghost_alias(alias_id, 30);
        await load_aliases();
      } finally {
        set_action_loading(null);
      }
    },
    [load_aliases],
  );

  const now = new Date();
  const active_aliases = aliases.filter(
    (a) => a.is_enabled && (!a.expires_at || new Date(a.expires_at) > now),
  );
  const expired_aliases = aliases.filter(
    (a) => !a.is_enabled || (a.expires_at && new Date(a.expires_at) <= now),
  );
  const this_month_count = aliases.filter((a) => {
    const created = new Date(a.created_at);

    return (
      created.getMonth() === now.getMonth() &&
      created.getFullYear() === now.getFullYear()
    );
  }).length;

  const format_date = (iso?: string) => {
    if (!iso) return "-";

    return new Date(iso).toLocaleDateString(undefined, {
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

  if (loading) {
    return <SettingsSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
              <EyeSlashIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
              Ghost Aliases
            </h3>
            <span className="text-xs text-txt-muted">
              {this_month_count} this month
            </span>
          </div>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-3 text-txt-muted">
          Disposable aliases created via Ghost Mode. Your real address stays
          hidden.
        </p>
      </div>

      {aliases.length === 0 ? (
        <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
          <EyeSlashIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
          <p className="text-sm text-txt-muted">
            No ghost aliases yet. Use Ghost Mode when composing to create one.
          </p>
        </div>
      ) : (
        <>
          {active_aliases.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-txt-muted mb-2">
                Active
              </h3>
              <div className="space-y-2">
                {active_aliases.map((alias) => (
                  <div
                    key={alias.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surf-tertiary border border-edge-secondary"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        background:
                          "linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)",
                      }}
                    >
                      <EyeSlashIcon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-txt-primary">
                        {alias.full_address}
                      </p>
                      <p className="text-xs text-txt-muted">
                        Expires in {days_until(alias.expires_at)} days (
                        {format_date(alias.expires_at)})
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button
                        disabled={
                          action_loading === alias.id ||
                          is_at_max_extension(alias)
                        }
                        size="sm"
                        variant="depth"
                        onClick={() => handle_extend(alias.id)}
                      >
                        Extend
                      </Button>
                      <button
                        className="px-3 py-1.5 text-xs font-medium rounded-[14px] text-white transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={action_loading === alias.id}
                        style={{
                          background:
                            "linear-gradient(180deg, #ff6b6b 0%, #f74f4f 50%, #e83b3b 100%)",
                          boxShadow:
                            "0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                        }}
                        onClick={() => handle_expire(alias.id)}
                      >
                        Expire
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {expired_aliases.length > 0 && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wider text-txt-muted mb-2">
                Expired (grace period)
              </h3>
              <div className="space-y-2">
                {expired_aliases.map((alias) => (
                  <div
                    key={alias.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surf-tertiary border border-edge-secondary opacity-60"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        background:
                          "linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)",
                      }}
                    >
                      <EyeSlashIcon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-txt-primary">
                        {alias.full_address}
                      </p>
                      <p className="text-xs text-txt-muted">
                        Grace period until {format_date(alias.grace_expires_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
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
    </div>
  );
}
