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
import { use_registration } from "@/components/register/hooks/use_registration";
import { Spinner } from "@/components/ui/spinner";

export interface step_generating_props {
  reg: ReturnType<typeof use_registration>;
}

export function StepGenerating({ reg }: step_generating_props) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <Spinner className="h-10 w-10 text-[#4a7aff]" size="lg" />
      <h2 className="mt-8 text-2xl font-bold text-[var(--text-primary)]">
        {reg.t("auth.setting_up_account")}
      </h2>
      <p className="mt-3 text-sm text-[var(--text-tertiary)]">
        {reg.generation_status}
      </p>
      <p className="mt-8 max-w-xs text-center text-xs leading-relaxed text-[var(--text-muted)]">
        {reg.t("auth.encryption_keys_local")}
      </p>
    </div>
  );
}
