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
import type { CustomCategoryRule } from "@/data/category_catalog";

import { useState } from "react";
import { Switch, Button, UpgradeBtn } from "@aster/ui";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  Squares2X2Icon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";

import { InfoPopover } from "@/components/ui/info_popover";
import { ConfirmModal } from "@/components/email/inbox/inbox_confirmation_dialog";
import { CustomCategoryModal } from "./custom_category_modal";
import { use_preferences } from "@/contexts/preferences_context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { show_plan_limit_upgrade } from "@/stores/upgrade_store";
import {
  BUILTIN_CATEGORIES,
  allowed_custom_categories,
} from "@/data/category_catalog";
import { category_icon } from "@/data/category_icons";
import { use_i18n } from "@/lib/i18n/context";

export function CategorySettingsSection() {
  const { preferences, update_preference, update_preferences } =
    use_preferences();
  const { t } = use_i18n();
  const { limits } = use_plan_limits();
  const [modal_open, set_modal_open] = useState(false);
  const [editing_rule, set_editing_rule] = useState<CustomCategoryRule | null>(
    null,
  );
  const [deleting_rule, set_deleting_rule] =
    useState<CustomCategoryRule | null>(null);

  const enabled_ids = new Set(preferences.enabled_categories ?? []);
  const custom_categories = preferences.custom_categories ?? [];

  const category_limit = limits
    ? (limits.limits["max_custom_categories"]?.limit ?? -1)
    : -1;
  const is_unlimited = category_limit < 0;
  const at_limit = !is_unlimited && custom_categories.length >= category_limit;
  const can_add_custom = is_unlimited || category_limit > 0;

  const permitted_custom_ids = new Set(
    allowed_custom_categories(custom_categories, category_limit).map(
      (r) => r.id,
    ),
  );

  const toggle_builtin = (id: string, currently_enabled: boolean) => {
    const next_ids = new Set(enabled_ids);

    if (currently_enabled) {
      next_ids.delete(id);
    } else {
      next_ids.add(id);
    }

    update_preference("enabled_categories", Array.from(next_ids), true);
  };

  const toggle_custom = (rule: CustomCategoryRule) => {
    const next = custom_categories.map((r) =>
      r.id === rule.id ? { ...r, enabled: !r.enabled } : r,
    );

    update_preference("custom_categories", next, true);
  };

  const confirm_delete_custom = () => {
    if (!deleting_rule) return;

    const next = custom_categories.filter((r) => r.id !== deleting_rule.id);

    update_preference("custom_categories", next, true);
    set_deleting_rule(null);
  };

  const handle_add_category = () => {
    if (!can_add_custom || at_limit) {
      show_plan_limit_upgrade({ resource: "custom categories" });
      return;
    }

    set_editing_rule(null);
    set_modal_open(true);
  };

  const save_custom = (rule: CustomCategoryRule) => {
    const exists = custom_categories.some((r) => r.id === rule.id);
    const next = exists
      ? custom_categories.map((r) => (r.id === rule.id ? rule : r))
      : [...custom_categories, rule];

    update_preferences({ custom_categories: next }, true);
  };

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          <Squares2X2Icon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
          {t("settings.categories_title")}
        </h3>
        <p className="text-sm text-txt-muted mt-1">
          {t("settings.categories_description")}
        </p>
      </div>

      <div className="flex items-center justify-between py-4 border-t border-b border-edge-secondary">
        <div className="flex-1 pr-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-txt-primary">
            {t("settings.inbox_categories")}
            <InfoPopover
              description={t("settings.inbox_categories_description")}
              title={t("settings.inbox_categories")}
            />
          </p>
          <p className="text-sm mt-0.5 text-txt-muted">
            {t("settings.inbox_categories_short")}
          </p>
        </div>
        <Switch
          size="lg"
          checked={preferences.inbox_categories_enabled !== false}
          onCheckedChange={() =>
            update_preference(
              "inbox_categories_enabled",
              preferences.inbox_categories_enabled === false,
              true,
            )
          }
        />
      </div>

      <div className="aster_scrollbar_thin max-h-[420px] overflow-y-auto pr-1 mt-2">
        {BUILTIN_CATEGORIES.filter((cat) => cat.removable).map((cat) => {
          const Icon = category_icon(cat.icon);
          const is_enabled = enabled_ids.has(cat.id);

          return (
            <div
              key={cat.id}
              className="flex items-center justify-between py-3"
            >
              <div className="flex-1 pr-4 flex items-center gap-3">
                <Icon className="w-[18px] h-[18px] text-txt-muted flex-shrink-0" />
                <p className="flex items-center gap-1.5 text-sm font-medium text-txt-primary">
                  {t(cat.label_key)}
                  <InfoPopover
                    description={t(cat.info_key)}
                    title={t(cat.label_key)}
                  />
                </p>
              </div>
              <Switch
                checked={is_enabled}
                onCheckedChange={() => toggle_builtin(cat.id, is_enabled)}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-5 pt-4 border-t border-edge-secondary">
        <div className="flex items-center justify-between mb-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-txt-primary">
            {t("settings.custom_categories_title")}
            <InfoPopover
              description={t("settings.category_tutorial_text")}
              title={t("settings.custom_categories_title")}
            />
          </p>
          {!can_add_custom || at_limit ? (
            <UpgradeBtn size="sm" onClick={handle_add_category}>
              {t("settings.add_category")}
            </UpgradeBtn>
          ) : (
            <Button variant="outline" onClick={handle_add_category}>
              <PlusIcon className="w-4 h-4" />
              {t("settings.add_category")}
            </Button>
          )}
        </div>

        <p className="text-sm text-txt-muted mb-3">
          {t("settings.custom_categories_tutorial")}
        </p>

        {!can_add_custom ? (
          <p className="text-sm text-txt-muted italic">
            {t("settings.custom_categories_locked")}
          </p>
        ) : (
          <>
            {at_limit && (
              <p className="text-sm text-txt-muted italic mb-2">
                {t("settings.custom_categories_limit_reached")}
              </p>
            )}

            {custom_categories.length === 0 ? (
              <p className="text-sm text-txt-muted italic">
                {t("settings.no_custom_categories")}
              </p>
            ) : (
              <div className="aster_scrollbar_thin max-h-[320px] space-y-1 overflow-y-auto pr-1">
                {custom_categories.map((rule) => {
                  const Icon = category_icon(rule.icon);
                  const is_locked = !permitted_custom_ids.has(rule.id);

                  return (
                    <div
                      key={rule.id}
                      className={`flex items-center justify-between py-2 ${is_locked ? "opacity-60" : ""}`}
                    >
                      <div className="flex-1 pr-4 flex items-center gap-3">
                        <Icon className="w-[18px] h-[18px] text-txt-muted flex-shrink-0" />
                        <div>
                          <p className="flex items-center gap-1.5 text-sm font-medium text-txt-primary">
                            {rule.name}
                            {is_locked && (
                              <span className="text-xs font-normal text-txt-muted italic">
                                {t("settings.custom_category_locked_badge")}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-txt-muted">
                            {[...rule.match_domains, ...rule.match_keywords]
                              .slice(0, 4)
                              .join(", ")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          title={t("common.edit")}
                          variant="ghost"
                          onClick={() => {
                            set_editing_rule(rule);
                            set_modal_open(true);
                          }}
                        >
                          <PencilIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
                          size="icon"
                          title={t("common.delete")}
                          variant="ghost"
                          onClick={() => set_deleting_rule(rule)}
                        >
                          <TrashIcon className="w-4 h-4" />
                        </Button>
                        {is_locked ? (
                          <Button
                            size="icon"
                            title={t("settings.custom_category_locked_badge")}
                            variant="ghost"
                            onClick={() =>
                              show_plan_limit_upgrade({
                                resource: "custom categories",
                              })
                            }
                          >
                            <LockClosedIcon className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Switch
                            checked={rule.enabled}
                            onCheckedChange={() => toggle_custom(rule)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <CustomCategoryModal
        existing={editing_rule}
        is_open={modal_open}
        on_close={() => set_modal_open(false)}
        on_save={save_custom}
      />

      <ConfirmModal
        confirm_text={t("common.delete")}
        confirm_variant="destructive"
        description={t("settings.delete_category_description", {
          name: deleting_rule?.name ?? "",
        })}
        dont_ask={false}
        hide_dont_ask
        show={!!deleting_rule}
        title={t("settings.delete_category_title")}
        on_cancel={() => set_deleting_rule(null)}
        on_confirm={confirm_delete_custom}
        on_dont_ask_change={() => {}}
      />
    </div>
  );
}
