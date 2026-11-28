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
  COMPOSE_DOCK,
  ComposeBody,
  ComposeHeader,
  FloatingPanel,
  InboxList,
  PageBackdrop,
  PreviewSvg,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  ScrimLayer,
  preview_ids,
  type PreviewIds,
} from "@/components/settings/appearance/app_preview";

function InboxScene({ ids }: { ids: PreviewIds }) {
  return (
    <AppChrome ids={ids}>{(island) => <InboxList {...island} />}</AppChrome>
  );
}

export function ComposeMockupDefault() {
  const ids = preview_ids(useId());
  const x = SCENE_WIDTH - COMPOSE_DOCK.edge - COMPOSE_DOCK.width;
  const y = SCENE_HEIGHT - COMPOSE_DOCK.height;

  return (
    <PreviewSvg ids={ids}>
      <InboxScene ids={ids} />
      <FloatingPanel
        top_only
        h={COMPOSE_DOCK.height}
        ids={ids}
        w={COMPOSE_DOCK.width}
        x={x}
        y={y}
      >
        <ComposeBody
          h={COMPOSE_DOCK.height}
          w={COMPOSE_DOCK.width}
          x={x}
          y={y}
        />
      </FloatingPanel>
    </PreviewSvg>
  );
}

export function ComposeMockupFullscreen() {
  const ids = preview_ids(useId());
  const edge = COMPOSE_DOCK.edge;
  const w = SCENE_WIDTH - edge * 2;
  const h = SCENE_HEIGHT - edge * 2;

  return (
    <PreviewSvg ids={ids}>
      <PageBackdrop />
      <g filter={`url(#${ids.blur})`}>
        <InboxScene ids={ids} />
      </g>
      <ScrimLayer />
      <FloatingPanel h={h} ids={ids} w={w} x={edge} y={edge}>
        <ComposeBody h={h} w={w} x={edge} y={edge} />
      </FloatingPanel>
    </PreviewSvg>
  );
}

export function ComposeMockupMinimized() {
  const ids = preview_ids(useId());
  const w = COMPOSE_DOCK.minimized_width;
  const h = COMPOSE_DOCK.header_height;
  const x = SCENE_WIDTH - COMPOSE_DOCK.edge - w;
  const y = SCENE_HEIGHT - h;

  return (
    <PreviewSvg ids={ids}>
      <InboxScene ids={ids} />
      <FloatingPanel top_only h={h} ids={ids} w={w} x={x} y={y}>
        <ComposeHeader w={w} x={x} y={y} />
      </FloatingPanel>
    </PreviewSvg>
  );
}
