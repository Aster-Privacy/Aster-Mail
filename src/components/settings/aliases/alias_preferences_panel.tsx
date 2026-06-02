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
import { AdjustmentsHorizontalIcon } from "@heroicons/react/24/outline";
import { InfoHint } from "@/components/settings/aliases/info_hint";
import { Switch, UpgradeBtn } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { go_to_billing } from "@/components/settings/aliases/feature_lock";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import type { AliasPreferences } from "@/services/api/aliases";
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
      <div className="flex-1 pr-6">
        <p className="text-sm font-medium text-txt-primary flex items-center gap-1.5">
          {label}
          {info && <InfoHint tip={info} title={label} />}
        </p>
        <p className="text-sm mt-0.5 text-txt-muted">{description}</p>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

const PrefRow = pref_row;


interface AliasPreferencesPanelProps {
  available_domains: string[];
}

export function AliasPreferencesPanel({ available_domains }: AliasPreferencesPanelProps) {
  const { t } = use_i18n();
  const { is_feature_locked } = use_plan_limits();

  const [loading, set_loading] = useState(false);
  const [prefs, set_prefs] = useState<AliasPreferences>({
    alias_sender_format: "via",
    readable_reverse_aliases: false,
    alias_always_expand: false,
    alias_unsubscribe_action: "disable_alias",
    alias_disabled_response: "ignore",
    alias_delete_action: "trash",
  });

  const debounce_timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    get_alias_preferences()
      .then((r) => {
        if (r.data) set_prefs(r.data);
        set_loading(false);
      })
      .catch(() => set_loading(false));
  }, []);

  const save_pref = useCallback((patch: Partial<AliasPreferences>) => {
    set_prefs((prev) => ({ ...prev, ...patch }));
    if (debounce_timer.current) clearTimeout(debounce_timer.current);
    debounce_timer.current = setTimeout(() => {
      update_alias_preferences(patch).catch(() => {});
    }, 500);
  }, []);

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
        {loading ? <div /> : (
          <>
              {available_domains.length > 0 && (
                <PrefRow
                  description={t("settings.alias_pref_default_domain_desc")}
                  label={t("settings.alias_pref_default_domain")}
                >
                  <Select
                    value={prefs.alias_default_domain ?? available_domains[0] ?? ""}
                    onValueChange={(v) => save_pref({ alias_default_domain: v })}
                  >
                    <SelectTrigger className="h-9 w-44 shrink-0 bg-transparent">
                      <SelectValue />
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
                info="How the sender's name appears in forwarded emails."
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
                info="When on, reverse alias addresses include the sender's email so you can tell who's writing at a glance."
                label={t("settings.alias_pref_readable_reverse")}
              >
                {readable_locked ? (
                  <UpgradeBtn size="sm" onClick={go_to_billing}>
                    {t("settings.alias_feature_locked_upgrade_cta")}
                  </UpgradeBtn>
                ) : (
                  <Switch
                    checked={prefs.readable_reverse_aliases}
                    onCheckedChange={(v) => save_pref({ readable_reverse_aliases: v })}
                  />
                )}
              </PrefRow>

              <PrefRow
                description={t("settings.alias_pref_always_expand_desc")}
                info="Show every alias's full settings panel automatically instead of hiding them behind the gear icon."
                label={t("settings.alias_pref_always_expand")}
              >
                <Switch
                  checked={prefs.alias_always_expand}
                  onCheckedChange={(v) => save_pref({ alias_always_expand: v })}
                />
              </PrefRow>

              <PrefRow
                description={t("settings.alias_pref_unsubscribe_action_desc")}
                info="What happens when you click the unsubscribe button in a forwarded email."
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
                info="What the sender sees when they email a disabled alias or a blocked contact."
                label={t("settings.alias_pref_disabled_response")}
              >
                <Select
                  value={prefs.alias_disabled_response}
                  onValueChange={(v) =>
                    save_pref({ alias_disabled_response: v as "ignore" | "reject" })
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
                info="Move to trash keeps deleted aliases recoverable for 30 days. Delete immediately removes them permanently."
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
