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
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { Button } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";

function go_to_billing() {
  window.dispatchEvent(
    new CustomEvent("navigate-settings", { detail: "billing" }),
  );
}

export function FeatureLockOverlay({ message }: { message: string }) {
  const { t } = use_i18n();

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-6 rounded-lg bg-surf-tertiary border border-dashed border-edge-secondary text-center">
      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-surf-secondary border border-edge-secondary">
        <LockClosedIcon className="w-4 h-4 text-txt-muted" />
      </div>
      <p className="text-sm text-txt-secondary max-w-[280px]">{message}</p>
      <Button size="sm" variant="depth" onClick={go_to_billing}>
        {t("settings.alias_feature_locked_view_plans")}
      </Button>
    </div>
  );
}

export function LockedFeature({
  locked,
  message,
  children,
}: {
  locked: boolean;
  message: string;
  children: React.ReactNode;
}) {
  if (!locked) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none select-none opacity-40 blur-[1px]"
      >
        {children}
      </div>
      <div className="mt-3">
        <FeatureLockOverlay message={message} />
      </div>
    </div>
  );
}
