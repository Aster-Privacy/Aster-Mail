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
import { useEffect, useState } from "react";
import {
  Button,
  IslandSection,
  IslandSections,
  SettingControlRow,
} from "@aster/ui";

import { GuardDevicesList } from "@/components/guard/guard_devices_list";
import { GuardHeldChanges } from "@/components/guard/guard_held_changes";
import { GuardSetupWizard } from "@/components/guard/guard_setup_wizard";
import {
  GuardSwitchesPanel,
  use_guard_device,
} from "@/components/guard/guard_switches_panel";
import {
  GuardMarkIcon,
  GuardPlatformGlyph,
} from "@/components/guard/guard_visuals";
import { use_auth } from "@/contexts/auth_context";
import { use_guard_status } from "@/hooks/use_guard_status";
import { use_i18n } from "@/lib/i18n/context";
import { SETTINGS_ANCHORS } from "@/lib/settings_links";
import { GUARD_SWITCH } from "@/services/api/guard";
import {
  GUARD_SETUP_OPEN_EVENT,
  take_guard_setup_request,
} from "@/services/guard/guard_setup_request";

const GUARD_SWITCH_BITS = Object.values(GUARD_SWITCH);
const GUARD_HEADER_DEVICE_LIMIT = 3;

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
  const [setup_wanted, set_setup_wanted] = useState(false);
  const { device } = use_guard_device(
    user_id,
    `${status?.version ?? 0}:${status?.this_device?.id ?? ""}`,
  );
  const on_refresh = () => void refresh();

  useEffect(() => {
    const on_request = () => set_setup_wanted(take_guard_setup_request());

    on_request();
    window.addEventListener(GUARD_SETUP_OPEN_EVENT, on_request);

    return () => window.removeEventListener(GUARD_SETUP_OPEN_EVENT, on_request);
  }, []);

  useEffect(() => {
    if (!setup_wanted || !status) return;
    set_setup_wanted(false);
    if (status.switches === 0) set_wizard_open(true);
  }, [setup_wanted, status]);

  if (!user_id || !status) return null;
  const is_on = status.switches !== 0;

  const shown_devices = status.devices.slice(0, GUARD_HEADER_DEVICE_LIMIT);
  const hidden_devices = status.devices.length - shown_devices.length;

  return (
    <IslandSections>
      <IslandSection
        data-testid="guard_section_header"
        icon={<GuardMarkIcon />}
        id={SETTINGS_ANCHORS.guard}
        title={t("guard.section_title")}
      >
        <SettingControlRow
          control={
            is_on ? undefined : (
              <Button
                data-testid="guard_set_up"
                size="sm"
                variant="outline"
                onClick={() => set_wizard_open(true)}
              >
                {t("guard.intro_start")}
              </Button>
            )
          }
          control_width="auto"
          description={
            <>
              {is_on
                ? t("guard.section_header_on_description")
                : t("guard.section_description")}
              {is_on && shown_devices.length > 0 && (
                <span
                  className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-txt-muted"
                  data-testid="guard_section_devices"
                >
                  {shown_devices.map((entry) => (
                    <span
                      key={entry.id}
                      className="inline-flex min-w-0 items-center gap-1.5"
                    >
                      <GuardPlatformGlyph
                        device_type={entry.device_type}
                        name={entry.name}
                      />
                      <span className="max-w-[160px] truncate">
                        {entry.name}
                      </span>
                    </span>
                  ))}
                  {hidden_devices > 0 && (
                    <span>
                      {t("guard.section_more_devices", {
                        count: hidden_devices,
                      })}
                    </span>
                  )}
                </span>
              )}
            </>
          }
          label={
            <span
              data-state={is_on ? "on" : "off"}
              data-testid="guard_section_state"
            >
              {is_on ? t("guard.section_on") : t("guard.section_off")}
            </span>
          }
        />
      </IslandSection>
      {is_on && (
        <IslandSection title={t("guard.section_protections_title")}>
          <GuardSwitchesPanel
            device={device}
            status={status}
            user_id={user_id}
            on_refresh={on_refresh}
          />
        </IslandSection>
      )}
      {is_on && (
        <GuardHeldChanges
          device={device}
          user_id={user_id}
          on_refresh={on_refresh}
        />
      )}
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
