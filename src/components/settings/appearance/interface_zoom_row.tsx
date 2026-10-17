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
import { useEffect, useMemo, useState } from "react";

import { SettingRow } from "@/components/settings/appearance/setting_row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { use_i18n } from "@/lib/i18n/context";
import { to_intl_locale } from "@/lib/i18n/languages";
import { is_mac_platform } from "@/lib/utils";
import {
  INTERFACE_ZOOM_DEFAULT,
  INTERFACE_ZOOM_EVENT,
  INTERFACE_ZOOM_STEPS,
  get_interface_zoom,
  is_interface_zoom_supported,
  normalize_interface_zoom,
  set_interface_zoom,
} from "@/native/desktop_interface_zoom";

function zoom_key(value: number): string {
  return normalize_interface_zoom(value).toFixed(2);
}

export function InterfaceZoomRow() {
  const { t, language } = use_i18n();
  const [zoom, set_zoom] = useState<number>(INTERFACE_ZOOM_DEFAULT);
  const supported = is_interface_zoom_supported();

  useEffect(() => {
    if (!supported) return;
    let active = true;
    const handle_change = (event: Event) => {
      const detail = (event as CustomEvent<number>).detail;

      if (typeof detail === "number") set_zoom(detail);
    };

    window.addEventListener(INTERFACE_ZOOM_EVENT, handle_change);
    void get_interface_zoom().then((value) => {
      if (active) set_zoom(value);
    });

    return () => {
      active = false;
      window.removeEventListener(INTERFACE_ZOOM_EVENT, handle_change);
    };
  }, [supported]);

  const format_percent = useMemo(() => {
    const formatter = new Intl.NumberFormat(to_intl_locale(language), {
      style: "percent",
      maximumFractionDigits: 0,
    });

    return (value: number) => formatter.format(value);
  }, [language]);

  const options = useMemo(() => {
    const values: number[] = [...INTERFACE_ZOOM_STEPS];

    if (!values.some((value) => zoom_key(value) === zoom_key(zoom))) {
      values.push(normalize_interface_zoom(zoom));
      values.sort((a, b) => a - b);
    }

    return values;
  }, [zoom]);

  if (!supported) return null;

  const shortcut = is_mac_platform()
    ? t("settings.interface_zoom_shortcut_mac")
    : t("settings.interface_zoom_shortcut");

  return (
    <SettingRow
      description={`${t("settings.interface_zoom_description")} ${shortcut}`}
      label={t("settings.interface_zoom")}
    >
      <Select
        value={zoom_key(zoom)}
        onValueChange={(value) => {
          void set_interface_zoom(Number(value));
        }}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((value) => (
            <SelectItem key={zoom_key(value)} value={zoom_key(value)}>
              {format_percent(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingRow>
  );
}
