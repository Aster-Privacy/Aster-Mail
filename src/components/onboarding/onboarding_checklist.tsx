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
import type { ChecklistTasksState } from "@/services/api/onboarding";
import type { SettingsSection } from "@/components/settings/settings_content";
import type {
  TutorialListLabels,
  TutorialListLink,
  TutorialListTask,
} from "@/components/onboarding/tutorial_list";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TutorialList } from "@/components/onboarding/tutorial_list";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { use_onboarding_checklist } from "@/hooks/use_onboarding_checklist";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  safe_local_get,
  safe_local_remove,
  safe_local_set,
  safe_session_set,
} from "@/lib/safe_storage";
import { open_external } from "@/utils/open_link";

interface OnboardingChecklistProps {
  on_compose: () => void;
  on_open_settings: (section: SettingsSection) => void;
  on_open_shortcuts?: () => void;
  on_all_tasks_done?: () => void;
  on_visibility_change?: (visible: boolean) => void;
  hidden?: boolean;
}

interface ChecklistRow {
  key: keyof ChecklistTasksState;
  label_key:
    | "common.onboarding_checklist_install_app"
    | "common.onboarding_checklist_import_mail"
    | "common.onboarding_checklist_recovery_method"
    | "common.onboarding_checklist_first_email";
  on_click: () => void;
}

const DOWNLOAD_URL = "https://astermail.org/download";
const COLLAPSED_STORAGE_KEY = "aster_tutorial_list_collapsed";
const SEEN_INCOMPLETE_STORAGE_KEY = "aster_tutorial_list_seen_incomplete";
const DOMAIN_PURCHASE_SESSION_KEY = "alias_domains_purchase_open";
const DOMAIN_PURCHASE_EVENT = "aster:open-domain-purchase";

export function OnboardingChecklist({
  on_compose,
  on_open_settings,
  on_open_shortcuts,
  on_all_tasks_done,
  on_visibility_change,
  hidden = false,
}: OnboardingChecklistProps): JSX.Element | null {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const {
    state,
    is_loading,
    account_id,
    dismiss,
    refresh,
    mark_install_app_done,
  } = use_onboarding_checklist();
  const storage_suffix = account_id ? `_${account_id}` : "";
  const collapsed_key = `${COLLAPSED_STORAGE_KEY}${storage_suffix}`;
  const seen_incomplete_key = `${SEEN_INCOMPLETE_STORAGE_KEY}${storage_suffix}`;
  const loaded_suffix_ref = useRef(storage_suffix);
  const { limits } = use_plan_limits();
  const is_free_plan = limits?.plan_code === "free";
  const reported_done_ref = useRef(false);
  const [is_collapsed, set_is_collapsed] = useState(
    () => safe_local_get(collapsed_key) === "1",
  );
  const [seen_incomplete, set_seen_incomplete] = useState(
    () => safe_local_get(seen_incomplete_key) === "1",
  );

  useEffect(() => {
    if (loaded_suffix_ref.current === storage_suffix) return;
    loaded_suffix_ref.current = storage_suffix;
    reported_done_ref.current = false;
    set_is_collapsed(safe_local_get(collapsed_key) === "1");
    set_seen_incomplete(safe_local_get(seen_incomplete_key) === "1");
  }, [storage_suffix, collapsed_key, seen_incomplete_key]);

  const rows: ChecklistRow[] = useMemo(
    () => [
      {
        key: "import_mail",
        label_key: "common.onboarding_checklist_import_mail",
        on_click: () => {
          on_open_settings("import");
          void refresh();
        },
      },
      {
        key: "first_email",
        label_key: "common.onboarding_checklist_first_email",
        on_click: () => {
          on_compose();
          void refresh();
        },
      },
      {
        key: "recovery_method",
        label_key: "common.onboarding_checklist_recovery_method",
        on_click: () => {
          on_open_settings("account");
          void refresh();
        },
      },
      {
        key: "install_app",
        label_key: "common.onboarding_checklist_install_app",
        on_click: () => {
          open_external(DOWNLOAD_URL);
          mark_install_app_done();
        },
      },
    ],
    [on_compose, on_open_settings, mark_install_app_done, refresh],
  );

  const all_tasks_done =
    !!state && rows.every((row) => state.tasks[row.key] === true);
  const is_active = !is_loading && !!state && !state.dismissed_at;

  useEffect(() => {
    if (!all_tasks_done || reported_done_ref.current) return;
    reported_done_ref.current = true;
    on_all_tasks_done?.();
  }, [all_tasks_done, on_all_tasks_done]);

  useEffect(() => {
    if (!is_active || all_tasks_done || seen_incomplete) return;
    if (loaded_suffix_ref.current !== storage_suffix) return;
    safe_local_set(seen_incomplete_key, "1");
    set_seen_incomplete(true);
  }, [
    is_active,
    all_tasks_done,
    seen_incomplete,
    storage_suffix,
    seen_incomplete_key,
  ]);

  const visible = is_active && (!all_tasks_done || seen_incomplete);

  useEffect(() => {
    if (is_loading) return;
    on_visibility_change?.(visible);
  }, [is_loading, visible, on_visibility_change]);

  const handle_toggle = useCallback(() => {
    const next_collapsed = !is_collapsed;

    if (next_collapsed) {
      safe_local_set(collapsed_key, "1");
    } else {
      safe_local_remove(collapsed_key);
    }
    set_is_collapsed(next_collapsed);
  }, [is_collapsed, collapsed_key]);

  const handle_hide_forever = useCallback(() => {
    void dismiss();
  }, [dismiss]);

  const handle_complete_click = useCallback(() => {
    on_open_settings("billing");
  }, [on_open_settings]);

  const tasks: TutorialListTask[] = useMemo(
    () =>
      rows.map((row) => ({
        key: row.key,
        label: t(row.label_key),
        done: state?.tasks[row.key] === true,
        on_click: row.on_click,
      })),
    [rows, state, t],
  );

  const domain_links: TutorialListLink[] = useMemo(
    () => [
      {
        key: "domain_get",
        label: t("common.onboarding_checklist_domain_get"),
        on_click: () => {
          safe_session_set(DOMAIN_PURCHASE_SESSION_KEY, "1");
          on_open_settings("domains");
          window.dispatchEvent(new CustomEvent(DOMAIN_PURCHASE_EVENT));
        },
      },
      {
        key: "domain_existing",
        label: t("common.onboarding_checklist_domain_existing"),
        on_click: () => {
          on_open_settings("domains");
        },
      },
    ],
    [on_open_settings, t],
  );

  const done_count = tasks.filter((task) => task.done).length;

  const labels: TutorialListLabels = useMemo(
    () => ({
      heading: t("common.onboarding_checklist_title"),
      complete: t("common.onboarding_checklist_complete"),
      complete_action: t("common.plan_prompt_action"),
      progress: t("common.x_of_y", {
        current: done_count,
        total: rows.length,
      }),
      task_done: t("common.onboarding_checklist_task_done"),
      domain_heading: t("common.onboarding_checklist_domain_heading"),
      domain_badge: t("common.onboarding_checklist_domain_badge"),
      hide_forever: t("common.onboarding_checklist_hide_forever"),
      shortcuts: t("common.onboarding_checklist_shortcuts"),
      open: t("common.onboarding_checklist_open"),
      close: t("common.onboarding_checklist_close"),
    }),
    [done_count, rows.length, t],
  );

  if (hidden || !visible) return null;

  return (
    <TutorialList
      domain_links={domain_links}
      is_open={!is_collapsed}
      labels={labels}
      on_complete_click={is_free_plan ? handle_complete_click : undefined}
      on_hide_forever={handle_hide_forever}
      on_shortcuts={on_open_shortcuts}
      on_toggle={handle_toggle}
      reduce_motion={reduce_motion}
      tasks={tasks}
    />
  );
}
