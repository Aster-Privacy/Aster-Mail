//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
export const TRACKING_PIXEL_DOT_PX = 8;

export function TrackingPixelDot() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex flex-shrink-0 rounded-full bg-emerald-600 shadow-[0_0_0_1px_rgb(255_255_255),0_0_0_2px_rgb(0_0_0_/_0.6)]"
      data-tracking-pixel-dot=""
      style={{ width: TRACKING_PIXEL_DOT_PX, height: TRACKING_PIXEL_DOT_PX }}
    />
  );
}
