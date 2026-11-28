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
import { useId } from "react";

import {
  AppChrome,
  FloatingPanel,
  InboxList,
  MessagePane,
  PreviewSvg,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  preview_ids,
} from "@/components/settings/appearance/app_preview";

const SPLIT_LIST_RATIO = 0.5;
const POPUP_WIDTH = 720;
const POPUP_HEIGHT = 700;

export function ViewMockupPopup() {
  const ids = preview_ids(useId());
  const popup_x = (SCENE_WIDTH - POPUP_WIDTH) / 2;
  const popup_y = (SCENE_HEIGHT - POPUP_HEIGHT) / 2;

  return (
    <PreviewSvg ids={ids}>
      <AppChrome ids={ids}>
        {(island) => <InboxList active_row={1} {...island} />}
      </AppChrome>
      <FloatingPanel
        h={POPUP_HEIGHT}
        ids={ids}
        w={POPUP_WIDTH}
        x={popup_x}
        y={popup_y}
      >
        <MessagePane
          h={POPUP_HEIGHT}
          w={POPUP_WIDTH}
          x={popup_x}
          y={popup_y}
        />
      </FloatingPanel>
    </PreviewSvg>
  );
}

export function ViewMockupSplit() {
  const ids = preview_ids(useId());

  return (
    <PreviewSvg ids={ids}>
      <AppChrome ids={ids}>
        {(island) => {
          const list_w = Math.round(island.w * SPLIT_LIST_RATIO);

          return (
            <g>
              <InboxList active_row={1} {...island} w={list_w} />
              <line
                style={{ stroke: "var(--border-primary)" }}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                x1={island.x + list_w}
                x2={island.x + list_w}
                y1={island.y}
                y2={island.y + island.h}
              />
              <MessagePane
                {...island}
                w={island.w - list_w - 1}
                x={island.x + list_w + 1}
              />
            </g>
          );
        }}
      </AppChrome>
    </PreviewSvg>
  );
}

export function ViewMockupFullpage() {
  const ids = preview_ids(useId());

  return (
    <PreviewSvg ids={ids}>
      <AppChrome ids={ids}>
        {(island) => <MessagePane show_back show_reply {...island} />}
      </AppChrome>
    </PreviewSvg>
  );
}
