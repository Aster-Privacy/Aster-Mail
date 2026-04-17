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
import { Button } from "@aster/ui";

import { ThreeDotsHorizontal } from "@/components/common/icons";
import { use_i18n } from "@/lib/i18n/context";

export const Navbar = () => {
  const { t } = use_i18n();

  return (
    <nav className="w-full sticky top-0 z-40 flex items-center justify-between px-6 h-16 bg-background border-b border-border">
      <div className="flex items-center">
        <Button>{t("mail.compose")}</Button>
      </div>
      <div className="flex items-center">
        <Button size="icon" variant="ghost">
          <ThreeDotsHorizontal size={20} />
        </Button>
      </div>
    </nav>
  );
};
