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
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";

interface TestResultBannerProps {
  label: string;
  result: { success: boolean; message: string };
}

export function TestResultBanner({ label, result }: TestResultBannerProps) {
  return (
    <div
      className={`flex items-start gap-2 px-3.5 py-2.5 rounded-2xl text-sm ${
        result.success
          ? "bg-[color-mix(in_srgb,#16a34a_12%,transparent)] text-green-700 dark:text-green-400"
          : "bg-[color-mix(in_srgb,#dc2626_12%,transparent)] text-red-700 dark:text-red-400"
      }`}
      role="status"
    >
      {result.success ? (
        <CheckCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      ) : (
        <XCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      )}
      <span className="min-w-0 break-words">
        {label}: {result.message}
      </span>
    </div>
  );
}
