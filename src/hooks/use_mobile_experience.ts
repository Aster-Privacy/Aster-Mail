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
import { Capacitor } from "@capacitor/core";

export const MOBILE_EXPERIENCE_BREAKPOINT_PX = 768;

export function compute_is_mobile_experience(): boolean {
  if (Capacitor.isNativePlatform()) return true;

  const params = new URLSearchParams(window.location.search);
  const override = params.get("mobile");

  if (override === "true") return true;
  if (override === "false") return false;

  const ua = navigator.userAgent.toLowerCase();
  const is_mobile_ua = /android|iphone|ipad|ipod|mobile/i.test(ua);
  const is_narrow = window.innerWidth < MOBILE_EXPERIENCE_BREAKPOINT_PX;

  return is_mobile_ua && is_narrow;
}

let locked_is_mobile: boolean | null = null;

export function get_locked_mobile_experience(): boolean {
  if (locked_is_mobile === null) {
    locked_is_mobile = compute_is_mobile_experience();
  }

  return locked_is_mobile;
}

export function reset_locked_mobile_experience(): void {
  locked_is_mobile = null;
}

export function use_mobile_experience(): boolean {
  const [is_mobile] = useState(get_locked_mobile_experience);

  return is_mobile;
}
