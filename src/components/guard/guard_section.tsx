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
import { useState } from "react";
import {
  Button,
  IslandSection,
  IslandSections,
  SettingControlRow,
} from "@aster/ui";
import {
  ShieldCheckIcon,
  ShieldExclamationIcon,
} from "@heroicons/react/24/outline";

import { GuardDevicesList } from "@/components/guard/guard_devices_list";
import { GuardSetupWizard } from "@/components/guard/guard_setup_wizard";
import {
  GuardSwitchesPanel,
  use_guard_device,
} from "@/components/guard/guard_switches_panel";
import { GuardChip } from "@/components/guard/guard_visuals";
import { use_auth } from "@/contexts/auth_context";
import { use_guard_status } from "@/hooks/use_guard_status";
import { use_i18n } from "@/lib/i18n/context";
import { SETTINGS_ANCHORS } from "@/lib/settings_links";
import { GUARD_SWITCH } from "@/services/api/guard";

const GUARD_SWITCH_BITS = Object.values(GUARD_SWITCH);

export function count_guard_protections(switches: number) {
  return {
    on: GUARD_SWITCH_BITS.filter((bit) => (switches & bit) !== 0).length,
    total: GUARD_SWITCH_BITS.length,
  };
}

export function GuardSection() {
  const { t } = use_i18n();
  const { user } = use_auth();
  const user_id = user?.id ?? null;
  const { status, refresh } = use_guard_status(!!user_id);
  const [wizard_open, set_wizard_open] = useState(false);
  const { device } = use_guard_device(
    user_id,
    `${status?.version ?? 0}:${status?.this_device?.id ?? ""}`,
  );
  const on_refresh = () => void refresh();

  if (!user_id || !status) return null;
  const is_on = status.switches !== 0;
  const protections = count_guard_protections(status.switches);

  return (
    <IslandSections>
      <IslandSection
        description={t("guard.section_description")}
        icon={<ShieldExclamationIcon />}
        id={SETTINGS_ANCHORS.guard}
        title={t("guard.section_title")}
      >
        <SettingControlRow
          control={
            is_on ? (
              <GuardChip
                icon={<ShieldCheckIcon aria-hidden className="h-4 w-4" />}
                test_id="guard_section_state"
                tone="success"
              >
                {t("guard.section_protections_count", protections)}
              </GuardChip>
            ) : (
              <span className="flex items-center gap-3">
                <GuardChip test_id="guard_section_state" tone="neutral">
                  {t("guard.section_off")}
                </GuardChip>
                <Button
                  data-testid="guard_set_up"
                  size="sm"
                  variant="depth"
                  onClick={() => set_wizard_open(true)}
                >
                  {t("guard.section_set_up")}
                </Button>
              </span>
            )
          }
          description={
            is_on
              ? t("guard.section_on_description")
              : t("guard.section_off_description")
          }
          label={t("guard.section_title")}
        />
        {is_on && (
          <GuardSwitchesPanel
            device={device}
            status={status}
            user_id={user_id}
            on_refresh={on_refresh}
          />
        )}
      </IslandSection>
      {is_on && (
        <GuardDevicesList
          device={device}
          status={status}
          user_id={user_id}
          on_refresh={on_refresh}
        />
      )}
      <GuardSetupWizard
        is_open={wizard_open}
        user_id={user_id}
        on_changed={on_refresh}
        on_close={() => set_wizard_open(false)}
      />
    </IslandSections>
  );
}
