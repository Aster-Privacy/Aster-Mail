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
import { useNavigate } from "react-router-dom";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { t } = use_i18n();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-surf-secondary">
      <div className="text-7xl font-extrabold tracking-tighter mb-3 select-none" style={{ color: 'var(--accent-color, #3b82f6)' }}>
        404
      </div>
      <div className="text-sm mb-8 text-txt-muted max-w-xs">
        {t("errors.not_found")}
      </div>
      <Button size="md" variant="depth" onClick={() => navigate("/")}>
        {t("common.go_back")}
      </Button>
    </div>
  );
}
