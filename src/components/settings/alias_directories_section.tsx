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
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FolderIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button, Switch } from "@aster/ui";

import {
  list_alias_directories,
  create_alias_directory,
  update_alias_directory,
  delete_alias_directory,
  decrypt_alias_directory,
  DIRECTORY_DOMAIN,
  type DecryptedAliasDirectory,
} from "@/services/api/alias_directories";
import { SettingsSkeleton } from "@/components/settings/settings_skeleton";
import { show_toast } from "@/components/toast/simple_toast";
import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { FeatureLockOverlay } from "@/components/settings/aliases/feature_lock";
import { InfoHint } from "@/components/settings/aliases/info_hint";
import {
  TurnstileWidget,
  type TurnstileWidgetRef,
  TURNSTILE_SITE_KEY,
} from "@/components/auth/turnstile_widget";

const INPUT_CLASS =
  "flex-1 min-w-0 h-10 px-3 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary placeholder:text-txt-muted outline-none";

export function AliasDirectoriesSection() {
  const { t } = use_i18n();
  const { is_feature_locked, is_loading: limits_loading } = use_plan_limits();
  const locked = is_feature_locked("max_alias_directories");
  const [directories, set_directories] = useState<DecryptedAliasDirectory[]>(
    [],
  );
  const [loading, set_loading] = useState(true);
  const [directory_key, set_directory_key] = useState("");
  const [separator, set_separator] = useState<"." | "/" | "+" | "#">(".") ;
  const [busy, set_busy] = useState(false);
  const [captcha_token, set_captcha_token] = useState<string | null>(null);
  const turnstile_ref = useRef<TurnstileWidgetRef>(null);
  const turnstile_required = !!TURNSTILE_SITE_KEY;

  const load = useCallback(async () => {
    set_loading(true);
    try {
      const response = await list_alias_directories();

      if (response.data) {
        const decrypted = await Promise.all(
          (response.data.directories ?? []).map((d) =>
            decrypt_alias_directory(d, t("settings.alias_directory_key_label")),
          ),
        );

        set_directories(decrypted);
      }
    } catch {
      set_directories([]);
    } finally {
      set_loading(false);
    }
  }, [t]);

  useEffect(() => {
    if (limits_loading || locked) {
      set_loading(false);

      return;
    }
    load();
  }, [load, limits_loading, locked]);

  const handle_create = async () => {
    if (locked || !directory_key.trim()) return;
    if (turnstile_required && !captcha_token) return;
    set_busy(true);
    try {
      const response = await create_alias_directory(
        directory_key,
        DIRECTORY_DOMAIN,
        true,
        undefined,
        captcha_token ?? undefined,
      );

      set_captcha_token(null);
      turnstile_ref.current?.reset();

      if (response.error) {
        show_toast(t("settings.alias_directory_create_failed"), "error");
      } else {
        set_directory_key("");
        show_toast(t("settings.alias_directory_created"), "success");
        await load();
      }
    } finally {
      set_busy(false);
    }
  };

  const handle_toggle = async (directory: DecryptedAliasDirectory) => {
    const next = !directory.auto_create_enabled;

    set_directories((prev) =>
      prev.map((d) =>
        d.id === directory.id ? { ...d, auto_create_enabled: next } : d,
      ),
    );
    const response = await update_alias_directory(directory.id, {
      auto_create_enabled: next,
    });

    if (response.error) {
      set_directories((prev) =>
        prev.map((d) =>
          d.id === directory.id
            ? { ...d, auto_create_enabled: directory.auto_create_enabled }
            : d,
        ),
      );
      show_toast(response.error, "error");
    } else {
      show_toast(t("settings.alias_directory_updated"), "success");
    }
  };

  const handle_delete = async (directory_id: string) => {
    const response = await delete_alias_directory(directory_id);

    if (response.error) {
      show_toast(response.error, "error");
    } else {
      show_toast(t("settings.alias_directory_removed"), "success");
      set_directories((prev) => prev.filter((d) => d.id !== directory_id));
    }
  };

  if (limits_loading || loading) {
    return <SettingsSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2">
          <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
            <FolderIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.alias_directories_title")}
            <InfoHint tip={t("settings.alias_directories_info")} title={t("settings.alias_directories_title")} />
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-3 text-txt-muted">
          {t("settings.alias_directories_description")}
        </p>
      </div>

      {locked ? (
        <FeatureLockOverlay
          message={t("settings.alias_feature_locked_directories")}
        />
      ) : (
        <>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-txt-muted">@</span>
          <input
            className={INPUT_CLASS}
            placeholder={t("settings.alias_directory_key_placeholder")}
            value={directory_key}
            onChange={(e) =>
              set_directory_key(
                e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
              )
            }
            onKeyDown={(e) => e["key"] === "Enter" && handle_create()}
          />
          <Select
            value={separator}
            onValueChange={(v) => set_separator(v as "." | "/" | "+" | "#")}
          >
            <SelectTrigger className="h-10 w-28 shrink-0 bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=".">. (dot)</SelectItem>
              <SelectItem value="/">/ (slash)</SelectItem>
              <SelectItem value="+">+ (plus)</SelectItem>
              <SelectItem value="#"># (hash)</SelectItem>
            </SelectContent>
          </Select>
          <Button
            disabled={busy || !directory_key.trim() || (turnstile_required && !captcha_token)}
            size="xl"
            variant="depth"
            onClick={handle_create}
          >
            <PlusIcon className="w-4 h-4" />
            {t("settings.alias_directory_create")}
          </Button>
        </div>
        {directory_key.trim() && (
          <p className="text-xs text-txt-muted pl-5">
            anything{separator}{directory_key}@{DIRECTORY_DOMAIN}
          </p>
        )}
        {turnstile_required && directory_key.trim() && (
          <TurnstileWidget
            ref={turnstile_ref}
            on_verify={set_captcha_token}
            on_expire={() => set_captcha_token(null)}
          />
        )}
      </div>

      {directories.length === 0 ? (
        <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
          <FolderIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
          <p className="text-sm text-txt-muted">
            {t("settings.alias_directories_empty")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {directories.map((directory) => (
            <div
              key={directory.id}
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surf-tertiary border border-edge-secondary"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-surf-secondary border border-edge-secondary">
                <FolderIcon className="w-4 h-4 text-txt-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-txt-primary">
                  anything.{directory.label}@{directory.domain}
                </p>
                <p className="text-xs text-txt-muted">
                  {t("settings.alias_directory_pattern_hint", {
                    key: directory.label,
                    domain: directory.domain,
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <label className="flex items-center gap-1.5 text-xs text-txt-muted">
                  {t("settings.alias_directory_auto_create")}
                  <Switch
                    checked={directory.auto_create_enabled}
                    onCheckedChange={() => handle_toggle(directory)}
                  />
                </label>
                <Button
                  className="h-8 w-8 text-red-500 hover:text-red-500 hover:bg-red-500/10"
                  size="icon"
                  variant="ghost"
                  onClick={() => handle_delete(directory.id)}
                >
                  <TrashIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}
