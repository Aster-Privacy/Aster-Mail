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
import type { AliasPreferences } from "@/services/api/aliases";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdjustmentsHorizontalIcon } from "@heroicons/react/24/outline";
import { Switch, UpgradeBtn } from "@aster/ui";

import { InfoHint } from "@/components/settings/aliases/info_hint";
import { label_toggle_children_with_text } from "@/lib/labeled_control";
import { use_i18n } from "@/lib/i18n/context";
import { prompt_upgrade } from "@/components/settings/aliases/feature_lock";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { show_toast } from "@/components/toast/simple_toast";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { ignore_error } from "@/lib/ignore_error";
import {
  get_alias_preferences,
  update_alias_preferences,
} from "@/services/api/aliases";

interface PrefRowProps {
  label: string;
  description: string;
  info?: string;
  children: React.ReactNode;
}

function pref_row({ label, description, info, children }: PrefRowProps) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex-1 pe-6">
        <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
          {label}
          {info && <InfoHint tip={info} title={label} />}
        </p>
        <p className="text-sm mt-0.5 text-txt-muted">{description}</p>
      </div>
      <div className="flex-shrink-0">
        {label_toggle_children_with_text(children, label)}
      </div>
    </div>
  );
}

const PrefRow = pref_row;

interface AliasPreferencesPanelProps {
  available_domains: string[];
  on_default_domain_change?: (domain: string) => void;
}

export function AliasPreferencesPanel({
  available_domains,
  on_default_domain_change,
}: AliasPreferencesPanelProps) {
  const { t } = use_i18n();
  const { is_feature_locked } = use_plan_limits();

  const [loading, set_loading] = useState(true);
  const [prefs, set_prefs] = useState<AliasPreferences>({
    alias_sender_format: "via",
    readable_reverse_aliases: false,
    alias_always_expand: false,
    alias_unsubscribe_action: "disable_alias",
    alias_disabled_response: "ignore",
    alias_delete_action: "trash",
  });

  const [load_failed, set_load_failed] = useState(false);

  const debounce_timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending_patch = useRef<Partial<AliasPreferences>>({});
  const revert_snapshot = useRef<AliasPreferences | null>(null);

  const load_prefs = useCallback(() => {
    set_loading(true);
    set_load_failed(false);
    get_alias_preferences()
      .then((r) => {
        if (r.data) {
          set_prefs(r.data);
        } else {
          set_load_failed(true);
        }
        set_loading(false);
      })
      .catch((caught) => {
        ignore_error(
          "components/settings/aliases/alias_preferences_panel:load_prefs",
          caught,
        );
        set_load_failed(true);
        set_loading(false);
      });
  }, []);

  useEffect(() => {
    load_prefs();
  }, [load_prefs]);

  const save_pref = useCallback(
    (patch: Partial<AliasPreferences>) => {
      if (load_failed) return;
      set_prefs((prev) => {
        if (!revert_snapshot.current) revert_snapshot.current = prev;

        return { ...prev, ...patch };
      });
      pending_patch.current = { ...pending_patch.current, ...patch };
      if (debounce_timer.current) clearTimeout(debounce_timer.current);
      debounce_timer.current = setTimeout(async () => {
        const merged = pending_patch.current;
        const snapshot = revert_snapshot.current;

        pending_patch.current = {};
        revert_snapshot.current = null;
        const fail = () => {
          if (snapshot) set_prefs(snapshot);
          show_toast(t("common.something_went_wrong_try_again"), "error");
        };

        try {
          const response = await update_alias_preferences(merged);

          if (!response.data?.success) fail();
        } catch (caught) {
          ignore_error(
            "components/settings/aliases/alias_preferences_panel:save_pref",
            caught,
          );
          fail();
        }
      }, 500);
    },
    [load_failed, t],
  );

  const readable_locked = is_feature_locked("has_advanced_aliases");

  return (
    <div className="space-y-0">
      <div className="mb-4">
        <h3 className="flex items-center gap-2 text-base font-semibold text-txt-primary">
          <AdjustmentsHorizontalIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
          {t("settings.alias_pref_section")}
        </h3>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>
      <div>
        {loading ? (
          <div />
        ) : load_failed ? (
          <LoadFailedNotice on_retry={load_prefs} />
        ) : (
          <>
            {available_domains.length > 0 && (
              <PrefRow
                description={t("settings.alias_pref_default_domain_desc")}
                label={t("settings.alias_pref_default_domain")}
              >
                <Select
                  value={
                    prefs.alias_default_domain &&
                    available_domains.includes(prefs.alias_default_domain)
                      ? prefs.alias_default_domain
                      : (available_domains[0] ?? "")
                  }
                  onValueChange={(v) => {
                    save_pref({ alias_default_domain: v });
                    on_default_domain_change?.(v);
                  }}
                >
                  <SelectTrigger className="h-9 w-44 shrink-0 bg-transparent">
                    <SelectValue
                      placeholder={t("settings.alias_pref_default_domain")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {available_domains.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </PrefRow>
            )}

            <PrefRow
              description={t("settings.alias_pref_sender_format_desc")}
              info={t("settings.alias_pref_sender_format_info")}
              label={t("settings.alias_pref_sender_format")}
            >
              <Select
                value={prefs.alias_sender_format}
                onValueChange={(v) =>
                  save_pref({ alias_sender_format: v as "via" | "at" })
                }
              >
                <SelectTrigger className="h-9 w-44 shrink-0 bg-transparent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="via">
                    {t("settings.alias_pref_sender_via")}
                  </SelectItem>
                  <SelectItem value="at">
                    {t("settings.alias_pref_sender_at")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </PrefRow>

            <PrefRow
              description={t("settings.alias_pref_readable_reverse_desc")}
              info={t("settings.alias_pref_readable_reverse_info")}
              label={t("settings.alias_pref_readable_reverse")}
            >
              {readable_locked ? (
                <UpgradeBtn
                  size="sm"
                  onClick={() =>
                    prompt_upgrade(
                      t("settings.feature_requires_upgrade"),
                      undefined,
                      "has_advanced_aliases",
                    )
                  }
                >
                  {t("settings.alias_feature_locked_upgrade_cta")}
                </UpgradeBtn>
              ) : (
                <Switch
                  checked={prefs.readable_reverse_aliases}
                  size="lg"
                  onCheckedChange={(v) =>
                    save_pref({ readable_reverse_aliases: v })
                  }
                />
              )}
            </PrefRow>

            <PrefRow
              description={t("settings.alias_pref_unsubscribe_action_desc")}
              info={t("settings.alias_pref_unsubscribe_action_info")}
              label={t("settings.alias_pref_unsubscribe_action")}
            >
              <Select
                value={prefs.alias_unsubscribe_action}
                onValueChange={(v) =>
                  save_pref({
                    alias_unsubscribe_action: v as
                      | "preserve"
                      | "disable_alias"
                      | "block_contact",
                  })
                }
              >
                <SelectTrigger className="h-9 w-40 shrink-0 bg-transparent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preserve">
                    {t("settings.alias_pref_unsubscribe_preserve")}
                  </SelectItem>
                  <SelectItem value="disable_alias">
                    {t("settings.alias_pref_unsubscribe_disable_alias")}
                  </SelectItem>
                  <SelectItem value="block_contact">
                    {t("settings.alias_pref_unsubscribe_block_contact")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </PrefRow>

            <PrefRow
              description={t("settings.alias_pref_disabled_response_desc")}
              info={t("settings.alias_pref_disabled_response_info")}
              label={t("settings.alias_pref_disabled_response")}
            >
              <Select
                value={prefs.alias_disabled_response}
                onValueChange={(v) =>
                  save_pref({
                    alias_disabled_response: v as "ignore" | "reject",
                  })
                }
              >
                <SelectTrigger className="h-9 w-36 shrink-0 bg-transparent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ignore">
                    {t("settings.alias_pref_disabled_ignore")}
                  </SelectItem>
                  <SelectItem value="reject">
                    {t("settings.alias_pref_disabled_reject")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </PrefRow>

            <PrefRow
              description={t("settings.alias_pref_delete_action_desc")}
              info={t("settings.alias_pref_delete_action_info")}
              label={t("settings.alias_pref_delete_action")}
            >
              <Select
                value={prefs.alias_delete_action}
                onValueChange={(v) =>
                  save_pref({ alias_delete_action: v as "trash" | "immediate" })
                }
              >
                <SelectTrigger className="h-9 w-40 shrink-0 bg-transparent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trash">
                    {t("settings.alias_pref_delete_trash")}
                  </SelectItem>
                  <SelectItem value="immediate">
                    {t("settings.alias_pref_delete_immediate")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </PrefRow>
          </>
        )}
      </div>
    </div>
  );
}
