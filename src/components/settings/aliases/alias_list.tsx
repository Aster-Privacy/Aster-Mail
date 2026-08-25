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

import { useState, useMemo, useEffect, useRef } from "react";
import {
  AtSymbolIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  NoSymbolIcon,
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
import { BottomPagination } from "@/components/email/inbox/inbox_bottom_pagination";
import { update_alias, delete_alias } from "@/services/api/aliases";
import {
  alias_is_restorable,
  restore_orphaned_alias,
} from "@/services/api/aliases/restore";
import { Input } from "@/components/ui/input";
import { show_toast } from "@/components/toast/simple_toast";
import { ConfirmationModal } from "@/components/modals/confirmation_modal";
import { ignore_error } from "@/lib/ignore_error";

type FilterMode = "all" | "enabled" | "disabled";

const ALIASES_PER_PAGE = 50;

const BULK_BATCH_SIZE = 10;

interface AliasListProps {
  aliases: DecryptedEmailAlias[];
  domain_addresses: (DecryptedDomainAddress & { domain_name: string })[];
  aliases_loading: boolean;
  aliases_load_failed?: boolean;
  on_reload?: () => void;
  toggling_id: string | null;
  alias_deleting_id: string | null;
  domain_addr_deleting_id: string | null;
  on_alias_toggle: (id: string, enabled: boolean) => void;
  on_alias_delete: (id: string) => void;
  on_domain_addr_delete: (id: string, domain_id: string) => void;
  on_avatar_changed?: () => void;
  on_aliases_changed?: () => void;
  on_domain_address_display_name_saved?: (
    address_id: string,
    name: string,
  ) => void;
  on_alias_pin_toggle: (id: string) => void;
  on_open_editor: (alias_id: string) => void;
  on_open_domain_editor: (address_id: string) => void;
}

function UndecryptableAliasCard({
  alias,
  deleting,
  on_delete,
  on_restored,
}: {
  alias: DecryptedEmailAlias;
  deleting: boolean;
  on_delete: (id: string) => void;
  on_restored?: () => void;
}) {
  const { t } = use_i18n();
  const orphaned = alias.orphaned_by_key_rotation === true;
  const restorable = alias_is_restorable(alias);
  const [restore_open, set_restore_open] = useState(false);
  const [claimed_local_part, set_claimed_local_part] = useState("");
  const [restoring, set_restoring] = useState(false);
  const [restore_error, set_restore_error] = useState<string | null>(null);

  const handle_restore = async () => {
    set_restoring(true);
    set_restore_error(null);

    try {
      const outcome = await restore_orphaned_alias(alias, claimed_local_part);

      if (outcome.status === "restored") {
        set_restore_open(false);
        set_claimed_local_part("");
        on_restored?.();

        return;
      }

      set_restore_error(
        outcome.status === "address_mismatch"
          ? t("settings.alias_restore_mismatch")
          : t("settings.alias_restore_failed"),
      );
    } catch {
      set_restore_error(t("settings.alias_restore_failed"));
    } finally {
      set_restoring(false);
    }
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl bg-surf-secondary border ${
        orphaned ? "border-edge-primary" : "border-amber-500/30"
      }`}
    >
      <div
        className={`flex w-10 h-10 items-center justify-center rounded-full flex-shrink-0 ${
          orphaned ? "bg-accent-primary/10" : "bg-amber-500/10"
        }`}
      >
        {orphaned ? (
          <InformationCircleIcon className="w-5 h-5 text-accent-primary" />
        ) : (
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-txt-primary">
          {orphaned
            ? t("settings.alias_orphaned_title")
            : t("settings.alias_decrypt_failed_title")}
        </p>
        <p className="text-xs mt-0.5 text-txt-muted">
          {orphaned
            ? t("settings.alias_orphaned_hint")
            : t("settings.alias_decrypt_failed_hint")}
        </p>
        {restorable && !restore_open && (
          <button
            className="mt-1.5 text-xs font-medium text-accent-primary hover:underline"
            type="button"
            onClick={() => set_restore_open(true)}
          >
            {t("settings.alias_restore_action")}
          </button>
        )}
        {restorable && restore_open && (
          <div className="mt-2 space-y-1.5">
            <p className="text-xs text-txt-secondary">
              {t("settings.alias_restore_prompt")}
            </p>
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="h-8 text-xs"
                disabled={restoring}
                placeholder={t("settings.alias_restore_placeholder")}
                value={claimed_local_part}
                onChange={(event) => {
                  set_claimed_local_part(event.target.value);
                  set_restore_error(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && claimed_local_part.trim()) {
                    void handle_restore();
                  }
                }}
              />
              <span className="text-xs text-txt-muted flex-shrink-0">
                @{alias.domain}
              </span>
              <Button
                className="h-8 flex-shrink-0"
                disabled={restoring || !claimed_local_part.trim()}
                size="sm"
                onClick={() => void handle_restore()}
              >
                {restoring ? (
                  <Spinner size="xs" />
                ) : (
                  t("settings.alias_restore_confirm")
                )}
              </Button>
            </div>
            {restore_error && (
              <p className="text-xs text-red-500">{restore_error}</p>
            )}
          </div>
        )}
      </div>
      <Button
        className={`h-8 w-8 flex-shrink-0 ${
          orphaned
            ? "text-txt-muted hover:text-red-500 hover:bg-red-500/10"
            : "text-red-500 hover:text-red-500 hover:bg-red-500/10"
        }`}
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
  aliases_load_failed,
  on_reload,
  toggling_id,
  alias_deleting_id,
  domain_addr_deleting_id,
  on_alias_toggle,
  on_alias_delete,
  on_domain_addr_delete,
  on_avatar_changed,
  on_aliases_changed,
  on_domain_address_display_name_saved,
  on_alias_pin_toggle,
  on_open_editor,
  on_open_domain_editor,
}: AliasListProps) {
  const { t } = use_i18n();
  const { is_feature_locked } = use_plan_limits();
  const is_avatar_locked = is_feature_locked("has_alias_avatars");
  const [search_query, set_search_query] = useState("");
  const [filter_mode, set_filter_mode] = useState<FilterMode>("all");
  const [bulk_mode, set_bulk_mode] = useState(false);
  const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
  const [show_bulk_delete_confirm, set_show_bulk_delete_confirm] =
    useState(false);

  const [deleted_refresh_signal, set_deleted_refresh_signal] = useState(0);
  const prev_aliases_length_ref = useRef(aliases.length);

  useEffect(() => {
    if (aliases.length < prev_aliases_length_ref.current) {
      set_deleted_refresh_signal((s) => s + 1);
    }
    prev_aliases_length_ref.current = aliases.length;
  }, [aliases.length]);

  const filtered_aliases = useMemo(() => {
    let result = aliases;
    const query = search_query.trim().toLowerCase();

    if (query) {
      result = result.filter(
        (a) =>
          a.full_address.toLowerCase().includes(query) ||
          (a.display_name ?? "").toLowerCase().includes(query) ||
          (a.note ?? "").toLowerCase().includes(query) ||
          (a.websites ?? []).some((url) => url.toLowerCase().includes(query)),
      );
    }
    if (filter_mode === "enabled") {
      result = result.filter((a) => a.is_enabled);
    } else if (filter_mode === "disabled") {
      result = result.filter((a) => !a.is_enabled);
    }

    return result;
  }, [aliases, search_query, filter_mode]);

  const filtered_domain_addresses = useMemo(() => {
    let result = domain_addresses;
    const query = search_query.trim().toLowerCase();

    if (query) {
      result = result.filter(
        (a) =>
          `${a.local_part}@${a.domain_name}`.toLowerCase().includes(query) ||
          (a.display_name ?? "").toLowerCase().includes(query),
      );
    }
    if (filter_mode === "enabled") {
      result = result.filter((a) => a.is_enabled);
    } else if (filter_mode === "disabled") {
      result = result.filter((a) => !a.is_enabled);
    }

    return result;
  }, [domain_addresses, search_query, filter_mode]);

  const filtered_entries = useMemo(
    () => [
      ...filtered_aliases.map((alias) => ({
        kind: "alias" as const,
        key: alias.id,
        alias,
      })),
      ...filtered_domain_addresses.map((address) => ({
        kind: "domain_address" as const,
        key: `da-${address.id}`,
        address,
      })),
    ],
    [filtered_aliases, filtered_domain_addresses],
  );

  const [current_page, set_current_page] = useState(0);
  const list_top_ref = useRef<HTMLDivElement>(null);

  const total_pages = Math.max(
    1,
    Math.ceil(filtered_entries.length / ALIASES_PER_PAGE),
  );

  useEffect(() => {
    set_current_page(0);
  }, [search_query, filter_mode]);

  useEffect(() => {
    set_selected_ids((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filtered_aliases.map((a) => a.id));
      const next = new Set(Array.from(prev).filter((id) => visible.has(id)));

      return next.size === prev.size ? prev : next;
    });
  }, [filtered_aliases]);

  useEffect(() => {
    if (current_page > total_pages - 1) {
      set_current_page(total_pages - 1);
    }
  }, [current_page, total_pages]);

  const page_entries = useMemo(
    () =>
      filtered_entries.slice(
        current_page * ALIASES_PER_PAGE,
        current_page * ALIASES_PER_PAGE + ALIASES_PER_PAGE,
      ),
    [filtered_entries, current_page],
  );

  const handle_page_change = (page: number) => {
    set_current_page(page);
    list_top_ref.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

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

  const run_bulk_toggle = async (is_enabled: boolean) => {
    const ids = Array.from(selected_ids);
    const results: { error?: string }[] = [];

    for (let index = 0; index < ids.length; index += BULK_BATCH_SIZE) {
      const batch = ids.slice(index, index + BULK_BATCH_SIZE);

      results.push(
        ...(await Promise.all(
          batch.map((id) =>
            update_alias(id, { is_enabled }).catch((caught) => {
              ignore_error(
                "components/settings/aliases/alias_list:run_bulk_toggle",
                caught,
              );

              return { error: "request_failed" };
            }),
          ),
        )),
      );
    }
    const failed = results.filter((result) => !!result.error).length;

    on_aliases_changed?.();

    if (failed > 0) {
      show_toast(
        t("settings.alias_bulk_update_partial_failed", {
          count: failed,
          total: ids.length,
        }),
        "error",
      );

      return;
    }

    show_toast(
      is_enabled
        ? t("settings.alias_bulk_enabled")
        : t("settings.alias_bulk_disabled"),
      "success",
    );
  };

  const handle_bulk_enable = async () => {
    await run_bulk_toggle(true);
  };

  const handle_bulk_disable = async () => {
    await run_bulk_toggle(false);
  };

  const handle_bulk_delete_confirm = async () => {
    const ids = Array.from(selected_ids);
    const results: { error?: string }[] = [];

    for (let index = 0; index < ids.length; index += BULK_BATCH_SIZE) {
      const batch = ids.slice(index, index + BULK_BATCH_SIZE);

      results.push(
        ...(await Promise.all(
          batch.map((id) =>
            delete_alias(id).catch((caught) => {
              ignore_error(
                "components/settings/aliases/alias_list:handle_bulk_delete_confirm",
                caught,
              );

              return { error: "request_failed" };
            }),
          ),
        )),
      );
    }
    const failed_ids = ids.filter((_, index) => !!results[index].error);

    set_selected_ids(new Set(failed_ids));
    set_show_bulk_delete_confirm(false);
    on_aliases_changed?.();

    if (failed_ids.length > 0) {
      show_toast(
        t("settings.alias_bulk_delete_partial_failed", {
          count: failed_ids.length,
          total: ids.length,
        }),
        "error",
      );
    }
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

  if (
    aliases_load_failed &&
    aliases.length === 0 &&
    domain_addresses.length === 0
  ) {
    return (
      <div className="text-center py-8 rounded-xl bg-surf-secondary border border-dashed border-edge-secondary">
        <p className="text-sm text-txt-secondary mb-3">
          {t("settings.aliases_load_failed")}
        </p>
        {on_reload && (
          <Button onClick={on_reload} size="sm" variant="outline">
            {t("common.retry")}
          </Button>
        )}
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
          refresh_signal={deleted_refresh_signal}
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
          <MagnifyingGlassIcon className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-muted pointer-events-none" />
          <input
            className="w-full h-9 ps-9 pe-3 rounded-lg bg-transparent border border-edge-secondary text-sm text-txt-primary placeholder:text-txt-muted outline-none focus:border-blue-500"
            placeholder={t("settings.alias_search_placeholder")}
            value={search_query}
            onChange={(e) => set_search_query(e.target.value)}
          />
        </div>
        <Select
          value={filter_mode}
          onValueChange={(v) => set_filter_mode(v as FilterMode)}
        >
          <SelectTrigger className="h-9 w-28 bg-transparent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("settings.alias_filter_all")}
            </SelectItem>
            <SelectItem value="enabled">
              {t("settings.alias_filter_enabled")}
            </SelectItem>
            <SelectItem value="disabled">
              {t("settings.alias_filter_disabled")}
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          className="h-9 shrink-0"
          size="md"
          variant={bulk_mode ? "outline" : "depth"}
          onClick={() => (bulk_mode ? exit_bulk_mode() : set_bulk_mode(true))}
        >
          {t("settings.alias_bulk_edit")}
        </Button>
      </div>

      {bulk_mode && (
        <div className="flex h-12 items-center justify-between gap-2 mb-3 px-1 border-b border-edge-secondary">
          <button
            className="flex min-w-0 cursor-pointer items-center gap-2 text-start"
            type="button"
            onClick={() => handle_select_all(!all_filtered_selected)}
          >
            <Checkbox
              checked={all_filtered_selected}
              className="pointer-events-none"
              tabIndex={-1}
            />
            <span className="text-sm text-txt-muted tabular-nums">
              {selected_ids.size > 0
                ? t("settings.alias_bulk_selected", {
                    count: selected_ids.size,
                  })
                : t("settings.alias_bulk_select_all")}
            </span>
          </button>
          <div
            aria-hidden={selected_ids.size === 0}
            className={`flex shrink-0 items-center gap-1.5 transition-opacity ${
              selected_ids.size > 0
                ? "opacity-100"
                : "pointer-events-none opacity-0"
            }`}
          >
            <Button
              disabled={selected_ids.size === 0}
              size="sm"
              variant="outline"
              onClick={handle_bulk_enable}
            >
              <CheckCircleIcon className="w-3.5 h-3.5" />
              {t("settings.alias_bulk_enable")}
            </Button>
            <Button
              disabled={selected_ids.size === 0}
              size="sm"
              variant="outline"
              onClick={handle_bulk_disable}
            >
              <NoSymbolIcon className="w-3.5 h-3.5" />
              {t("settings.alias_bulk_disable")}
            </Button>
            <Button
              className="text-red-500 hover:text-red-500"
              disabled={selected_ids.size === 0}
              size="sm"
              variant="outline"
              onClick={() => set_show_bulk_delete_confirm(true)}
            >
              <TrashIcon className="w-3.5 h-3.5" />
              {t("settings.alias_bulk_delete")}
            </Button>
          </div>
        </div>
      )}

      <div ref={list_top_ref} className="space-y-2">
        {page_entries.map((entry) =>
          entry.kind === "domain_address" ? (
            <DomainAddressItem
              key={entry.key}
              address={entry.address}
              deleting={domain_addr_deleting_id === entry.address.id}
              is_avatar_locked={is_avatar_locked}
              on_avatar_changed={on_avatar_changed}
              on_delete={on_domain_addr_delete}
              on_display_name_saved={on_domain_address_display_name_saved}
              on_open_editor={() => on_open_domain_editor(entry.address.id)}
            />
          ) : entry.alias.decryption_failed ? (
            <UndecryptableAliasCard
              key={entry.key}
              alias={entry.alias}
              deleting={alias_deleting_id === entry.alias.id}
              on_delete={on_alias_delete}
              on_restored={on_aliases_changed}
            />
          ) : (
            <AliasItem
              key={entry.key}
              alias={entry.alias}
              bulk_mode={bulk_mode}
              deleting={alias_deleting_id === entry.alias.id}
              is_avatar_locked={is_avatar_locked}
              is_selected={selected_ids.has(entry.alias.id)}
              on_avatar_changed={on_avatar_changed}
              on_delete={on_alias_delete}
              on_open_editor={() => on_open_editor(entry.alias.id)}
              on_pin_toggle={on_alias_pin_toggle}
              on_select={handle_select}
              on_toggle={on_alias_toggle}
              toggling={toggling_id === entry.alias.id}
            />
          ),
        )}
      </div>
      <BottomPagination
        current_page={current_page}
        on_page_change={handle_page_change}
        total_pages={total_pages}
      />
      <RecentlyDeletedAliasesSection
        on_restored={() => on_aliases_changed?.()}
        refresh_signal={deleted_refresh_signal}
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
