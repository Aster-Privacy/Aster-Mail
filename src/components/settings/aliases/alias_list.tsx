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
import type { DecryptedEmailAlias } from "@/services/api/aliases";
import type { DecryptedDomainAddress } from "@/services/api/domains";

import { useState, useMemo, useEffect } from "react";
import {
  AtSymbolIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { Button, Checkbox } from "@aster/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Spinner } from "@/components/ui/spinner";
import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { UpgradeInlineCard } from "@/components/upgrade/upgrade_inline_card";
import {
  AliasItem,
  DomainAddressItem,
} from "@/components/settings/aliases/alias_card";
import { RecentlyDeletedAliasesSection } from "@/components/settings/aliases/recently_deleted_aliases_section";
import { update_alias, delete_alias, toggle_alias_pin, get_alias_preferences } from "@/services/api/aliases";
import { show_toast } from "@/components/toast/simple_toast";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";

type FilterMode = "all" | "enabled" | "disabled";

interface AliasListProps {
  aliases: DecryptedEmailAlias[];
  domain_addresses: (DecryptedDomainAddress & { domain_name: string })[];
  aliases_loading: boolean;
  toggling_id: string | null;
  alias_deleting_id: string | null;
  domain_addr_deleting_id: string | null;
  on_alias_toggle: (id: string, enabled: boolean) => void;
  on_alias_delete: (id: string) => void;
  on_domain_addr_delete: (id: string, domain_id: string) => void;
  on_avatar_changed?: () => void;
  on_display_name_saved?: (alias_id: string, name: string) => void;
  on_aliases_changed?: () => void;
  on_domain_address_display_name_saved?: (
    address_id: string,
    name: string,
  ) => void;
  on_alias_pin_toggled?: () => void;
}

function UndecryptableAliasCard({
  alias,
  deleting,
  on_delete,
}: {
  alias: DecryptedEmailAlias;
  deleting: boolean;
  on_delete: (id: string) => void;
}) {
  const { t } = use_i18n();

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-surf-secondary border border-amber-500/30">
      <div className="flex w-10 h-10 items-center justify-center rounded-full flex-shrink-0 bg-amber-500/10">
        <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-txt-primary">
          {t("settings.alias_decrypt_failed_title")}
        </p>
        <p className="text-xs mt-0.5 text-txt-muted">
          {t("settings.alias_decrypt_failed_hint")}
        </p>
      </div>
      <Button
        className="h-8 w-8 flex-shrink-0 text-red-500 hover:text-red-500 hover:bg-red-500/10"
        disabled={deleting}
        size="icon"
        title={t("common.delete")}
        variant="ghost"
        onClick={() => on_delete(alias.id)}
      >
        {deleting ? <Spinner size="xs" /> : <TrashIcon className="w-4 h-4" />}
      </Button>
    </div>
  );
}

export function AliasList({
  aliases,
  domain_addresses,
  aliases_loading,
  toggling_id,
  alias_deleting_id,
  domain_addr_deleting_id,
  on_alias_toggle,
  on_alias_delete,
  on_domain_addr_delete,
  on_avatar_changed,
  on_display_name_saved,
  on_aliases_changed,
  on_domain_address_display_name_saved,
  on_alias_pin_toggled,
}: AliasListProps) {
  const { t } = use_i18n();
  const { is_feature_locked } = use_plan_limits();
  const is_avatar_locked = is_feature_locked("has_alias_avatars");
  const [auto_expand, set_auto_expand] = useState(false);

  useEffect(() => {
    get_alias_preferences().then((r) => {
      if (r.data?.alias_always_expand) set_auto_expand(true);
    }).catch(() => {});
  }, []);

  const handle_pin_toggle = async (alias_id: string) => {
    const response = await toggle_alias_pin(alias_id);

    if (!response.error) {
      show_toast(
        response.data?.is_pinned
          ? t("settings.alias_pinned_toast")
          : t("settings.alias_unpinned_toast"),
        "success",
      );
      on_alias_pin_toggled?.();
    }
  };

  const [search_query, set_search_query] = useState("");
  const [filter_mode, set_filter_mode] = useState<FilterMode>("all");
  const [bulk_mode, set_bulk_mode] = useState(false);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [show_bulk_delete_confirm, set_show_bulk_delete_confirm] = useState(false);

  const filtered_aliases = useMemo(() => {
    let result = aliases;
    const query = search_query.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (a) =>
          a.full_address.toLowerCase().includes(query) ||
          (a.display_name ?? "").toLowerCase().includes(query),
      );
    }
    if (filter_mode === "enabled") {
      result = result.filter((a) => a.is_enabled);
    } else if (filter_mode === "disabled") {
      result = result.filter((a) => !a.is_enabled);
    }
    return result;
  }, [aliases, search_query, filter_mode]);

  const handle_select = (alias_id: string, selected: boolean) => {
    set_selected_ids((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(alias_id);
      } else {
        next.delete(alias_id);
      }
      return next;
    });
  };

  const handle_select_all = (checked: boolean) => {
    if (checked) {
      set_selected_ids(new Set(filtered_aliases.map((a) => a.id)));
    } else {
      set_selected_ids(new Set());
    }
  };

  const handle_bulk_enable = async () => {
    const ids = Array.from(selected_ids);
    await Promise.all(ids.map((id) => update_alias(id, { is_enabled: true })));
    on_aliases_changed?.();
    show_toast(t("settings.alias_bulk_enable"), "success");
  };

  const handle_bulk_disable = async () => {
    const ids = Array.from(selected_ids);
    await Promise.all(ids.map((id) => update_alias(id, { is_enabled: false })));
    on_aliases_changed?.();
    show_toast(t("settings.alias_bulk_disable"), "success");
  };

  const handle_bulk_delete_confirm = async () => {
    try {
      const ids = Array.from(selected_ids);
      await Promise.all(ids.map((id) => delete_alias(id)));
      set_selected_ids(new Set());
      set_show_bulk_delete_confirm(false);
      on_aliases_changed?.();
    } catch {}
  };

  const exit_bulk_mode = () => {
    set_bulk_mode(false);
    set_selected_ids(new Set());
  };

  const all_filtered_selected =
    filtered_aliases.length > 0 &&
    filtered_aliases.every((a) => selected_ids.has(a.id));

  if (aliases_loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-xl animate-pulse bg-surf-secondary border border-edge-secondary"
          >
            <div className="w-10 h-10 rounded-full bg-surf-tertiary" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 rounded bg-surf-tertiary" />
              <div className="h-3 w-24 rounded bg-surf-tertiary" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (aliases.length === 0 && domain_addresses.length === 0) {
    return (
      <div className="space-y-4">
        <UpgradeInlineCard
          limit_key="max_email_aliases"
          resource_label="aliases"
        />
        <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
          <AtSymbolIcon className="w-6 h-6 mx-auto mb-2 text-txt-muted" />
          <p className="text-sm text-txt-muted">
            {t("settings.no_aliases_yet")}
          </p>
        </div>
        <RecentlyDeletedAliasesSection
          on_restored={() => on_aliases_changed?.()}
        />
      </div>
    );
  }

  return (
    <>
      <UpgradeInlineCard
        className="mb-2"
        limit_key="max_email_aliases"
        resource_label="aliases"
      />

      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-muted pointer-events-none" />
          <input
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary placeholder:text-txt-muted outline-none focus:border-blue-500"
            placeholder={t("settings.alias_search_placeholder")}
            value={search_query}
            onChange={(e) => set_search_query(e.target.value)}
          />
        </div>
        <Select value={filter_mode} onValueChange={(v) => set_filter_mode(v as FilterMode)}>
          <SelectTrigger className="h-9 w-28 bg-transparent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("settings.alias_filter_all")}</SelectItem>
            <SelectItem value="enabled">{t("settings.alias_filter_enabled")}</SelectItem>
            <SelectItem value="disabled">{t("settings.alias_filter_disabled")}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          className={bulk_mode ? "h-9 text-blue-500 border-blue-500/30" : "h-9"}
          size="sm"
          variant={bulk_mode ? "outline" : "ghost"}
          onClick={() => bulk_mode ? exit_bulk_mode() : set_bulk_mode(true)}
        >
          {t("settings.alias_bulk_edit")}
        </Button>
      </div>

      {bulk_mode && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-surf-secondary border border-edge-secondary">
          <button
            className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
            type="button"
            onClick={() => handle_select_all(!all_filtered_selected)}
          >
            <Checkbox
              checked={all_filtered_selected}
              onCheckedChange={(v) => handle_select_all(!!v)}
            />
            <span className="text-sm text-txt-muted">
              {selected_ids.size > 0
                ? t("settings.alias_bulk_selected", { count: String(selected_ids.size) })
                : t("settings.alias_bulk_select_all")}
            </span>
          </button>
          {selected_ids.size > 0 && (
            <>
              <Button
                className="h-7 text-xs"
                size="sm"
                variant="ghost"
                onClick={handle_bulk_enable}
              >
                {t("settings.alias_bulk_enable")}
              </Button>
              <Button
                className="h-7 text-xs"
                size="sm"
                variant="ghost"
                onClick={handle_bulk_disable}
              >
                {t("settings.alias_bulk_disable")}
              </Button>
              <Button
                className="h-7 text-xs text-red-500 hover:text-red-500 hover:bg-red-500/10"
                size="sm"
                variant="ghost"
                onClick={() => set_show_bulk_delete_confirm(true)}
              >
                {t("settings.alias_bulk_delete")}
              </Button>
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        {filtered_aliases.map((alias) =>
          alias.decryption_failed ? (
            <UndecryptableAliasCard
              key={alias.id}
              alias={alias}
              deleting={alias_deleting_id === alias.id}
              on_delete={on_alias_delete}
            />
          ) : (
            <AliasItem
              key={alias.id}
              alias={alias}
              bulk_mode={bulk_mode}
              deleting={alias_deleting_id === alias.id}
              is_avatar_locked={is_avatar_locked}
              is_selected={selected_ids.has(alias.id)}
              on_avatar_changed={on_avatar_changed}
              on_delete={on_alias_delete}
              on_display_name_saved={on_display_name_saved}
              on_select={handle_select}
              default_advanced_open={auto_expand}
              on_pin_toggle={handle_pin_toggle}
              on_toggle={on_alias_toggle}
              toggling={toggling_id === alias.id}
            />
          ),
        )}
      </div>
      {domain_addresses.map((addr) => (
        <DomainAddressItem
          key={`da-${addr.id}`}
          address={addr}
          deleting={domain_addr_deleting_id === addr.id}
          is_avatar_locked={is_avatar_locked}
          on_avatar_changed={on_avatar_changed}
          on_delete={on_domain_addr_delete}
          on_display_name_saved={on_domain_address_display_name_saved}
        />
      ))}
      <RecentlyDeletedAliasesSection
        on_restored={() => on_aliases_changed?.()}
      />

      <ConfirmationModal
        confirm_text={t("common.delete")}
        is_open={show_bulk_delete_confirm}
        message={t("settings.delete_alias_confirmation")}
        on_cancel={() => set_show_bulk_delete_confirm(false)}
        on_confirm={handle_bulk_delete_confirm}
        title={t("common.delete_alias")}
        variant="danger"
      />
    </>
  );
}
