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
export const BATCH_LIMITS = {
  MAIL_BULK: 100,
  ARCHIVE: 500,
  LABELS: 100,
  DRAFTS: 50,
} as const;

export const BATCH_DELAYS = {
  DEFAULT_MS: 0,
} as const;

export const PROGRESS_THRESHOLDS = {
  SHOW_TOAST_PROGRESS: 50,
  SHOW_MODAL: 200,
} as const;
