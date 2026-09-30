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
import type * as React from "react";

import {
  AdjustmentsHorizontalIcon,
  ArchiveBoxIcon,
  ArrowDownTrayIcon,
  ArrowPathRoundedSquareIcon,
  ArrowUpTrayIcon,
  ArrowUturnRightIcon,
  AtSymbolIcon,
  BookOpenIcon,
  BuildingOffice2Icon,
  CircleStackIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  DevicePhoneMobileIcon,
  EyeSlashIcon,
  FolderIcon,
  FunnelIcon,
  GlobeAltIcon,
  InboxArrowDownIcon,
  LifebuoyIcon,
  LockClosedIcon,
  PaperClipIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SwatchIcon,
  TrashIcon,
  UserGroupIcon,
  UserPlusIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

export const PLAN_FEATURE_ICONS = {
  accounts: UserGroupIcon,
  activity: ClipboardDocumentListIcon,
  advanced_alias: AdjustmentsHorizontalIcon,
  alias: AtSymbolIcon,
  apps: DevicePhoneMobileIcon,
  attachment: PaperClipIcon,
  catch_all: InboxArrowDownIcon,
  contacts: UsersIcon,
  controls: AdjustmentsHorizontalIcon,
  delete: TrashIcon,
  directory: BookOpenIcon,
  domain: GlobeAltIcon,
  early_access: RocketLaunchIcon,
  everything: SparklesIcon,
  export: ArrowUpTrayIcon,
  filter: FunnelIcon,
  folder: FolderIcon,
  forward: ArrowUturnRightIcon,
  ghost_alias: EyeSlashIcon,
  import: ArrowDownTrayIcon,
  invite: UserPlusIcon,
  lock: LockClosedIcon,
  members: UsersIcon,
  org: BuildingOffice2Icon,
  retention: ArchiveBoxIcon,
  schedule: ClockIcon,
  shield: ShieldCheckIcon,
  storage: CircleStackIcon,
  support: LifebuoyIcon,
  sync: ArrowPathRoundedSquareIcon,
  theme: SwatchIcon,
  transfer: ArrowPathRoundedSquareIcon,
} satisfies Record<string, React.ElementType>;

export type PlanFeatureIcon = keyof typeof PLAN_FEATURE_ICONS;
