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

import type { EmailCategory } from "@/types/email";

import { category_for_tab } from "@/services/mail_categorizer";
import { get_index_entries } from "@/services/category_index";

interface CategorySource {
  id?: string;
  mail_category?: EmailCategory;
}

export function effective_category(email: CategorySource): EmailCategory {
  const id = email.id;

  if (id) {
    const [entry] = get_index_entries([id]);

    if (entry) return category_for_tab(entry.category);
  }

  return category_for_tab(email.mail_category);
}
