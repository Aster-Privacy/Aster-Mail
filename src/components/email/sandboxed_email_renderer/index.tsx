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
export {
  CONTENT_READY_FALLBACK_MS,
  FIT_SLACK_PX,
  SETTLE_REMEASURE_DELAYS_MS,
  clear_iframe_height_cache,
  dispatch_iframe_ready,
  email_viewer_measure_width,
  fit_zoom_for,
  get_cached_iframe_height,
  link_hover_ink_for,
  link_ink_for,
  set_cached_iframe_height,
} from "./helpers";
export { SandboxedEmailRenderer } from "./renderer";
export {
  COLLAPSED_CONTENT_HEIGHT_PX,
  body_has_renderable_content,
  measure_content_bounds,
  should_recover_collapsed_height,
} from "./helpers";
