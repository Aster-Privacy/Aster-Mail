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
import type { CategoryIconKey } from "@/data/category_catalog";

import {
  InboxIcon,
  TagIcon,
  UsersIcon,
  BellIcon,
  ChatBubbleLeftRightIcon,
  CreditCardIcon,
  PaperAirplaneIcon,
  ShoppingBagIcon,
  StarIcon,
  HeartIcon,
  BriefcaseIcon,
  HomeIcon,
  GlobeAltIcon,
  AcademicCapIcon,
  MegaphoneIcon,
  GiftIcon,
  FolderIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

export const CATEGORY_ICON_MAP: Record<CategoryIconKey, typeof InboxIcon> = {
  inbox: InboxIcon,
  tag: TagIcon,
  users: UsersIcon,
  bell: BellIcon,
  chat: ChatBubbleLeftRightIcon,
  credit_card: CreditCardIcon,
  plane: PaperAirplaneIcon,
  shopping_bag: ShoppingBagIcon,
  star: StarIcon,
  heart: HeartIcon,
  briefcase: BriefcaseIcon,
  home: HomeIcon,
  globe: GlobeAltIcon,
  academic_cap: AcademicCapIcon,
  megaphone: MegaphoneIcon,
  gift: GiftIcon,
  folder: FolderIcon,
  sparkles: SparklesIcon,
};

export function category_icon(key: CategoryIconKey): typeof InboxIcon {
  return CATEGORY_ICON_MAP[key] ?? TagIcon;
}
