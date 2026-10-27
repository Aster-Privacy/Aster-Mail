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
import { SpeakerWaveIcon } from "@heroicons/react/24/outline";
import { IslandRow, IslandSection, IslandSections } from "@aster/ui";

import { SettingsSaveIndicatorInline } from "./settings_save_indicator";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { is_iconic_sounds_supported } from "@/services/iconic_sounds";

interface SoundToggleProps {
  title: string;
  description: string;
  enabled: boolean;
  on_toggle: () => void;
}

function SoundToggle({
  title,
  description,
  enabled,
  on_toggle,
}: SoundToggleProps) {
  return (
    <IslandRow
      description={description}
      label={title}
      toggle={{
        checked: enabled,
        on_change: () => on_toggle(),
        size: "lg",
        aria_label: title,
      }}
    />
  );
}

export function SoundSection() {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const iconic_sounds_supported = is_iconic_sounds_supported();

  return (
    <IslandSections>
      <SettingsSaveIndicatorInline />

      <IslandSection icon={<SpeakerWaveIcon />} title={t("settings.sound")}>
        <SoundToggle
          description={t("settings.sound_new_notifications")}
          enabled={preferences.sound}
          on_toggle={() => update_preference("sound", !preferences.sound, true)}
          title={t("settings.notification_sound")}
        />
        {iconic_sounds_supported && (
          <SoundToggle
            description={t("settings.iconic_sounds_description")}
            enabled={preferences.iconic_sounds_enabled === true}
            on_toggle={() =>
              update_preference(
                "iconic_sounds_enabled",
                preferences.iconic_sounds_enabled !== true,
                true,
              )
            }
            title={t("settings.iconic_sounds")}
          />
        )}
      </IslandSection>
    </IslandSections>
  );
}
