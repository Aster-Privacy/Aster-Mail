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
import { type ReactNode } from "react";
import { SelectionMark } from "@aster/ui";

import { AVATAR_COLORS } from "@/lib/avatar_color";
import { cn } from "@/lib/utils";

export const SCENE_WIDTH = 1280;
export const SCENE_HEIGHT = 800;

const TOP_BAR_HEIGHT = 56;
const SIDEBAR_WIDTH = 248;
const FLOATING_RADIUS = 16;
const TOOLBAR_HEIGHT = 48;
const TABS_HEIGHT = 40;
const ROW_HEIGHT = 48;
const ROW_PAD = 16;
const AVATAR_SIZE = 32;
const ROW_GAP = 12;
const SENDER_COLUMN = 176;
const CONTENT_GAP = 24;

const ACCENT = "var(--accent-color)";
const ACCENT_FG = "var(--accent-fg)";
const PAGE_FILL = "var(--bg-secondary)";
const SURFACE_FILL = "var(--bg-primary)";
const HOVER_FILL = "var(--bg-hover)";
const READ_ROW_FILL =
  "color-mix(in srgb, var(--bg-secondary) 55%, var(--bg-primary))";
const SEARCH_FILL =
  "color-mix(in srgb, var(--text-primary) 7%, var(--bg-hover))";
const SELECTED_FILL = "var(--aster-selected, var(--bg-hover))";
const DIALOG_FILL = "var(--aster-dialog-bg, var(--modal-bg))";
const DIVIDER = "var(--border-secondary)";
const OUTLINE = "var(--border-primary)";
const STORAGE_TRACK = "var(--storage-track)";
const SCRIM = "var(--modal-overlay)";

type Tone = "strong" | "normal" | "faint" | "accent" | "on_accent";

const TONES: Record<Tone, { color: string; opacity: number }> = {
  strong: { color: "var(--text-primary)", opacity: 0.78 },
  normal: { color: "var(--text-secondary)", opacity: 0.42 },
  faint: { color: "var(--text-muted)", opacity: 0.34 },
  accent: { color: ACCENT, opacity: 1 },
  on_accent: { color: ACCENT_FG, opacity: 0.92 },
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TextBarProps {
  x: number;
  y: number;
  w: number;
  h?: number;
  tone?: Tone;
}

function TextBar({ x, y, w, h = 9, tone = "normal" }: TextBarProps) {
  if (w <= 0) return null;
  const { color, opacity } = TONES[tone];

  return (
    <rect
      height={h}
      rx={h / 2}
      style={{ fill: color, opacity }}
      width={w}
      x={x}
      y={y}
    />
  );
}

interface GlyphProps {
  x: number;
  y: number;
  size?: number;
  tone?: Tone;
}

function Glyph({ x, y, size = 18, tone = "faint" }: GlyphProps) {
  const { color, opacity } = TONES[tone];

  return (
    <rect
      height={size}
      rx={size * 0.3}
      style={{ fill: color, opacity: Math.min(1, opacity * 1.35) }}
      width={size}
      x={x}
      y={y}
    />
  );
}

function HorizontalRule({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <line
      style={{ stroke: DIVIDER }}
      strokeWidth={1}
      vectorEffect="non-scaling-stroke"
      x1={x}
      x2={x + w}
      y1={y}
      y2={y}
    />
  );
}

function top_rounded_path({ x, y, w, h }: Rect, r: number) {
  return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;
}

export function preview_ids(id: string) {
  const base = id.replace(/[^a-zA-Z0-9]/g, "");

  return {
    island_clip: `pv${base}island`,
    pane_clip: `pv${base}pane`,
    window_clip: `pv${base}window`,
    shadow: `pv${base}shadow`,
    blur: `pv${base}blur`,
  };
}

export type PreviewIds = ReturnType<typeof preview_ids>;

interface PreviewSvgProps {
  width?: number;
  height?: number;
  ids: PreviewIds;
  children: ReactNode;
}

export function PreviewSvg({
  width = SCENE_WIDTH,
  height = SCENE_HEIGHT,
  ids,
  children,
}: PreviewSvgProps) {
  return (
    <svg
      aria-hidden="true"
      className="block h-full w-full"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <filter
          height="160%"
          id={ids.shadow}
          width="140%"
          x="-20%"
          y="-25%"
        >
          <feDropShadow
            dx="0"
            dy="14"
            floodColor="black"
            floodOpacity="0.24"
            stdDeviation="18"
          />
        </filter>
        <filter height="120%" id={ids.blur} width="120%" x="-10%" y="-10%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      {children}
    </svg>
  );
}

export function get_island(width: number, height: number): Rect {
  return {
    x: SIDEBAR_WIDTH,
    y: TOP_BAR_HEIGHT,
    w: width - SIDEBAR_WIDTH,
    h: height - TOP_BAR_HEIGHT,
  };
}

function TopBar({ width }: { width: number }) {
  const island = get_island(width, SCENE_HEIGHT);
  const search_w = Math.min(560, island.w * 0.6);

  return (
    <g>
      <rect
        height={24}
        rx={6}
        style={{ fill: ACCENT }}
        width={24}
        x={20}
        y={16}
      />
      <TextBar h={12} tone="strong" w={76} x={52} y={22} />
      <rect
        height={36}
        rx={18}
        style={{ fill: SEARCH_FILL }}
        width={search_w}
        x={island.x}
        y={10}
      />
      <Glyph size={16} x={island.x + 14} y={20} />
      <TextBar tone="faint" w={112} x={island.x + 42} y={23} />
      <Glyph size={20} x={width - 124} y={18} />
      <Glyph size={20} x={width - 88} y={18} />
      <circle
        cx={width - 34}
        cy={28}
        r={18}
        style={{ fill: AVATAR_COLORS[7] }}
      />
    </g>
  );
}

const NAV_ITEMS = [
  { label: 52, count: 12 },
  { label: 34, count: 0 },
  { label: 66, count: 0 },
  { label: 56, count: 0 },
  { label: 44, count: 8 },
  { label: 58, count: 0 },
];

const FOLDER_ITEMS = [
  { label: 38, color: AVATAR_COLORS[3] },
  { label: 58, color: AVATAR_COLORS[2] },
];

const LABEL_ITEMS = [
  { label: 44, color: AVATAR_COLORS[6] },
  { label: 52, color: AVATAR_COLORS[5] },
];

function Sidebar({ height }: { height: number }) {
  const storage_top = height - 104;
  const fits = (y: number) => y + 32 <= storage_top - 12;
  const nav_top = 128;
  const pitch = 34;
  const folders_top = nav_top + 14 + NAV_ITEMS.length * pitch + 18;
  const labels_top = folders_top + 14 + FOLDER_ITEMS.length * pitch + 12;

  return (
    <g>
      <rect
        height={40}
        rx={20}
        style={{ fill: ACCENT }}
        width={SIDEBAR_WIDTH - 24}
        x={12}
        y={TOP_BAR_HEIGHT + 8}
      />
      <Glyph size={16} tone="on_accent" x={88} y={TOP_BAR_HEIGHT + 20} />
      <TextBar tone="on_accent" w={60} x={112} y={TOP_BAR_HEIGHT + 24} />

      <TextBar h={7} tone="faint" w={30} x={24} y={nav_top} />
      {NAV_ITEMS.map((item, index) => {
        const y = nav_top + 14 + index * pitch;

        return (
          <g key={`nav${index}`}>
            {index === 0 && (
              <rect
                height={32}
                rx={10}
                style={{ fill: SELECTED_FILL }}
                width={SIDEBAR_WIDTH - 24}
                x={12}
                y={y}
              />
            )}
            <Glyph
              tone={index === 0 ? "strong" : "faint"}
              x={24}
              y={y + 7}
            />
            <TextBar
              tone={index === 0 ? "strong" : "normal"}
              w={item.label}
              x={54}
              y={y + 12}
            />
            {item.count > 0 && (
              <TextBar
                h={8}
                tone={index === 0 ? "strong" : "faint"}
                w={item.count}
                x={SIDEBAR_WIDTH - 24 - item.count}
                y={y + 12}
              />
            )}
          </g>
        );
      })}

      {fits(folders_top + 14) && (
        <g>
          <TextBar h={7} tone="faint" w={48} x={24} y={folders_top} />
          {FOLDER_ITEMS.map((item, index) => {
            const y = folders_top + 14 + index * pitch;

            return fits(y) ? (
              <g key={`folder${index}`}>
                <rect
                  height={14}
                  rx={3}
                  style={{ fill: item.color, opacity: 0.85 }}
                  width={18}
                  x={24}
                  y={y + 9}
                />
                <TextBar w={item.label} x={54} y={y + 12} />
              </g>
            ) : null;
          })}
        </g>
      )}

      {fits(labels_top + 14) && (
        <g>
          <TextBar h={7} tone="faint" w={42} x={24} y={labels_top} />
          {LABEL_ITEMS.map((item, index) => {
            const y = labels_top + 14 + index * pitch;

            return fits(y) ? (
              <g key={`label${index}`}>
                <circle
                  cx={33}
                  cy={y + 16}
                  r={6}
                  style={{ fill: item.color }}
                />
                <TextBar w={item.label} x={54} y={y + 12} />
              </g>
            ) : null;
          })}
        </g>
      )}

      <TextBar h={8} tone="normal" w={78} x={24} y={storage_top} />
      <TextBar h={8} tone="faint" w={24} x={SIDEBAR_WIDTH - 48} y={storage_top} />
      <rect
        height={4}
        rx={2}
        style={{ fill: STORAGE_TRACK }}
        width={SIDEBAR_WIDTH - 48}
        x={24}
        y={storage_top + 18}
      />
      <rect
        height={4}
        rx={2}
        style={{ fill: ACCENT }}
        width={(SIDEBAR_WIDTH - 48) * 0.12}
        x={24}
        y={storage_top + 18}
      />
      <TextBar h={7} tone="faint" w={86} x={24} y={storage_top + 32} />
      <Glyph size={16} x={24} y={height - 42} />
      <TextBar w={78} x={52} y={height - 38} />
    </g>
  );
}

interface AppChromeProps {
  width?: number;
  height?: number;
  ids: PreviewIds;
  children?: (island: Rect) => ReactNode;
}

export function AppChrome({
  width = SCENE_WIDTH,
  height = SCENE_HEIGHT,
  ids,
  children,
}: AppChromeProps) {
  const island = get_island(width, height);

  return (
    <g>
      <rect height={height} style={{ fill: PAGE_FILL }} width={width} />
      <TopBar width={width} />
      <Sidebar height={height} />
      <clipPath id={ids.island_clip}>
        <rect
          height={island.h}
          width={island.w}
          x={island.x}
          y={island.y}
        />
      </clipPath>
      <rect
        height={island.h}
        style={{ fill: SURFACE_FILL }}
        width={island.w}
        x={island.x}
        y={island.y}
      />
      <g clipPath={`url(#${ids.island_clip})`}>{children?.(island)}</g>
      <path
        d={`M${island.x} ${island.y + island.h}V${island.y}H${island.x + island.w}`}
        style={{ fill: "none", stroke: DIVIDER }}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

const ROWS = [
  { sender: 112, subject: 168, preview: 220, time: 34, unread: true },
  { sender: 84, subject: 210, preview: 160, time: 38, unread: true },
  { sender: 128, subject: 132, preview: 260, time: 30, unread: false },
  { sender: 96, subject: 186, preview: 190, time: 40, unread: false },
  { sender: 120, subject: 150, preview: 240, time: 36, unread: true },
  { sender: 76, subject: 224, preview: 150, time: 44, unread: false },
  { sender: 104, subject: 176, preview: 210, time: 40, unread: false },
  { sender: 92, subject: 140, preview: 280, time: 46, unread: false },
  { sender: 118, subject: 198, preview: 170, time: 44, unread: false },
  { sender: 88, subject: 160, preview: 230, time: 46, unread: false },
  { sender: 108, subject: 204, preview: 180, time: 40, unread: false },
  { sender: 98, subject: 172, preview: 200, time: 44, unread: false },
  { sender: 124, subject: 150, preview: 250, time: 46, unread: false },
  { sender: 80, subject: 188, preview: 210, time: 40, unread: false },
];

const TABS = [
  { label: 52, count: 0, color: ACCENT },
  { label: 76, count: 14, color: "var(--color-success)" },
  { label: 44, count: 14, color: ACCENT },
  { label: 56, count: 14, color: "var(--color-warning)" },
];

interface InboxListProps extends Rect {
  active_row?: number;
}

export function InboxList({ x, y, w, h, active_row }: InboxListProps) {
  const content_x = x + ROW_PAD + AVATAR_SIZE + ROW_GAP;
  const content_right = x + w - ROW_PAD;
  const content_w = content_right - content_x;
  const sender_w = Math.min(SENDER_COLUMN, content_w * 0.45);
  const subject_x = content_x + sender_w + CONTENT_GAP;
  const rows_top = y + TOOLBAR_HEIGHT + TABS_HEIGHT;
  const rows_space = y + h - rows_top;
  const row_count = Math.max(
    1,
    Math.min(ROWS.length, Math.round(rows_space / ROW_HEIGHT)),
  );
  const row_height = rows_space / row_count;
  let tab_x = x + ROW_PAD;

  return (
    <g>
      <rect
        height={15}
        rx={4}
        style={{ fill: "none", stroke: "var(--text-muted)", opacity: 0.6 }}
        strokeWidth={1.5}
        width={15}
        x={x + ROW_PAD}
        y={y + 17}
      />
      <Glyph size={16} x={x + 48} y={y + 16} />
      <TextBar h={11} tone="strong" w={42} x={x + 80} y={y + 19} />
      <TextBar h={11} tone="accent" w={8} x={x + 128} y={y + 19} />
      <Glyph size={16} x={x + w - 92} y={y + 16} />
      <TextBar h={8} tone="faint" w={46} x={x + w - 66} y={y + 20} />

      {TABS.map((tab, index) => {
        const label_x = tab_x;
        const pill_x = label_x + tab.label + 6;
        const tab_w = tab.label + (tab.count ? tab.count + 16 : 0);

        tab_x += tab_w + 24;
        if (label_x + tab_w > x + w - ROW_PAD) return null;

        return (
          <g key={`tab${index}`}>
            <TextBar
              tone={index === 0 ? "accent" : "normal"}
              w={tab.label}
              x={label_x}
              y={y + TOOLBAR_HEIGHT + 14}
            />
            {tab.count > 0 && (
              <rect
                height={14}
                rx={7}
                style={{ fill: tab.color, opacity: 0.85 }}
                width={tab.count + 10}
                x={pill_x}
                y={y + TOOLBAR_HEIGHT + 12}
              />
            )}
            {index === 0 && (
              <rect
                height={2}
                rx={1}
                style={{ fill: ACCENT }}
                width={tab.label}
                x={label_x}
                y={y + TOOLBAR_HEIGHT + TABS_HEIGHT - 2}
              />
            )}
          </g>
        );
      })}
      <HorizontalRule w={w} x={x} y={rows_top} />

      {ROWS.slice(0, row_count).map((row, index) => {
        const row_y = rows_top + index * row_height;
        const is_active = index === active_row;
        const center = row_y + row_height / 2;
        const time_x = content_right - row.time;
        const subject_room = time_x - 16 - subject_x;
        const subject_w = Math.min(row.subject, subject_room * 0.55);
        const preview_x = subject_x + subject_w + 8;
        const preview_w = Math.min(row.preview, time_x - 16 - preview_x);
        const row_fill = is_active
          ? HOVER_FILL
          : row.unread
            ? SURFACE_FILL
            : READ_ROW_FILL;

        return (
          <g key={`row${index}`}>
            <rect
              height={row_height}
              style={{ fill: row_fill }}
              width={w}
              x={x}
              y={row_y}
            />
            {index > 0 && <HorizontalRule w={w} x={x} y={row_y} />}
            {row.unread && (
              <circle cx={x + 8} cy={center} r={3.5} style={{ fill: ACCENT }} />
            )}
            <circle
              cx={x + ROW_PAD + AVATAR_SIZE / 2}
              cy={center}
              r={AVATAR_SIZE / 2}
              style={{ fill: AVATAR_COLORS[(index * 5 + 2) % AVATAR_COLORS.length] }}
            />
            <TextBar
              tone={row.unread ? "strong" : "normal"}
              w={Math.min(row.sender, sender_w - 8)}
              x={content_x}
              y={center - 4.5}
            />
            {subject_room > 24 && (
              <TextBar
                tone={row.unread ? "strong" : "normal"}
                w={subject_w}
                x={subject_x}
                y={center - 4.5}
              />
            )}
            {preview_w > 24 && (
              <TextBar tone="faint" w={preview_w} x={preview_x} y={center - 4.5} />
            )}
            <TextBar
              h={8}
              tone={row.unread ? "normal" : "faint"}
              w={row.time}
              x={time_x}
              y={center - 4}
            />
          </g>
        );
      })}
    </g>
  );
}

const BODY_PARAGRAPHS = [
  [0.94, 0.98, 0.9, 0.56],
  [0.96, 0.92, 0.97, 0.88, 0.38],
  [0.82, 0.64],
];

interface MessagePaneProps extends Rect {
  show_back?: boolean;
  show_reply?: boolean;
  max_body_width?: number;
}

export function MessagePane({
  x,
  y,
  w,
  h,
  show_back = false,
  show_reply = false,
  max_body_width = 720,
}: MessagePaneProps) {
  const pad = 24;
  const body_w = Math.min(w - pad * 2, max_body_width);
  const body_x = x + pad;
  const reply_y = y + h - 36 - pad;
  const body_bottom = show_reply ? reply_y - pad : y + h - pad;
  const lines: ReactNode[] = [];
  let line_y = y + 172;
  let paragraph_index = 0;

  while (line_y + 8 <= body_bottom) {
    const paragraph = BODY_PARAGRAPHS[paragraph_index % BODY_PARAGRAPHS.length];

    for (const [line_index, fraction] of paragraph.entries()) {
      if (line_y + 8 > body_bottom) break;
      lines.push(
        <TextBar
          key={`body${paragraph_index}_${line_index}`}
          h={8}
          tone="normal"
          w={body_w * fraction}
          x={body_x}
          y={line_y}
        />,
      );
      line_y += 20;
    }
    line_y += 16;
    paragraph_index += 1;
  }

  return (
    <g>
      {show_back && <Glyph size={18} tone="normal" x={x + 16} y={y + 15} />}
      {[0, 1, 2, 3].map((index) => (
        <Glyph
          key={`action${index}`}
          size={16}
          x={x + (show_back ? 56 : 16) + index * 32}
          y={y + 16}
        />
      ))}
      <Glyph size={16} x={x + w - 64} y={y + 16} />
      <Glyph size={16} x={x + w - 32} y={y + 16} />
      <HorizontalRule w={w} x={x} y={y + TOOLBAR_HEIGHT} />

      <TextBar
        h={16}
        tone="strong"
        w={Math.min(body_w * 0.62, 380)}
        x={body_x}
        y={y + 76}
      />
      <circle
        cx={body_x + 18}
        cy={y + 128}
        r={18}
        style={{ fill: AVATAR_COLORS[2] }}
      />
      <TextBar tone="strong" w={104} x={body_x + 48} y={y + 114} />
      <TextBar h={8} tone="faint" w={156} x={body_x + 48} y={y + 132} />
      <TextBar
        h={8}
        tone="faint"
        w={64}
        x={x + w - pad - 64}
        y={y + 116}
      />
      {lines}
      {show_reply && reply_y > y + 172 && (
        <g>
          {[0, 1].map((index) => (
            <g key={`reply${index}`}>
              <rect
                height={36}
                rx={18}
                style={{ fill: "none", stroke: OUTLINE }}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                width={104}
                x={body_x + index * 116}
                y={reply_y}
              />
              <Glyph size={14} tone="normal" x={body_x + index * 116 + 18} y={reply_y + 11} />
              <TextBar
                h={8}
                tone="normal"
                w={48}
                x={body_x + index * 116 + 40}
                y={reply_y + 14}
              />
            </g>
          ))}
        </g>
      )}
    </g>
  );
}

interface FloatingPanelProps extends Rect {
  ids: PreviewIds;
  radius?: number;
  top_only?: boolean;
  children?: ReactNode;
}

export function FloatingPanel({
  x,
  y,
  w,
  h,
  ids,
  radius = FLOATING_RADIUS,
  top_only = false,
  children,
}: FloatingPanelProps) {
  const rect = { x, y, w, h };
  const outline_props = {
    style: { fill: "none", stroke: OUTLINE },
    strokeWidth: 1,
    vectorEffect: "non-scaling-stroke" as const,
  };
  const render_shape = (extra = {}) =>
    top_only ? (
      <path d={top_rounded_path(rect, radius)} {...extra} />
    ) : (
      <rect height={h} rx={radius} width={w} x={x} y={y} {...extra} />
    );

  return (
    <g>
      <g filter={`url(#${ids.shadow})`} style={{ fill: DIALOG_FILL }}>
        {render_shape()}
      </g>
      <clipPath id={ids.window_clip}>{render_shape()}</clipPath>
      <g clipPath={`url(#${ids.window_clip})`}>{children}</g>
      {render_shape(outline_props)}
    </g>
  );
}

export function ComposeBody({ x, y, w, h }: Rect) {
  const pad = 16;
  const header = 44;
  const field = 40;
  const body_top = y + header + field * 2 + 20;
  const body_pattern = [0.82, 0.9, 0.58, 0, 0.42, 0.94, 0.88, 0.64, 0];
  const body_count = Math.max(0, Math.floor((y + h - 64 - 8 - body_top) / 20) + 1);
  const body_lines = Array.from(
    { length: body_count },
    (_, index) => body_pattern[index % body_pattern.length],
  );

  return (
    <g>
      <ComposeHeader w={w} x={x} y={y} />
      <HorizontalRule w={w - pad * 2} x={x + pad} y={y + header} />
      <TextBar h={8} tone="faint" w={18} x={x + pad} y={y + header + 16} />
      <rect
        height={22}
        rx={11}
        style={{ fill: SELECTED_FILL }}
        width={128}
        x={x + pad + 30}
        y={y + header + 9}
      />
      <circle
        cx={x + pad + 41}
        cy={y + header + 20}
        r={7}
        style={{ fill: AVATAR_COLORS[0] }}
      />
      <TextBar h={7} tone="normal" w={92} x={x + pad + 54} y={y + header + 17} />
      <HorizontalRule w={w - pad * 2} x={x + pad} y={y + header + field} />
      <TextBar
        tone="strong"
        w={Math.min(180, w * 0.4)}
        x={x + pad}
        y={y + header + field + 15}
      />
      <HorizontalRule w={w - pad * 2} x={x + pad} y={y + header + field * 2} />
      {body_lines.map((fraction, index) =>
        fraction > 0 ? (
          <TextBar
            key={`compose_line${index}`}
            h={8}
            tone="normal"
            w={(w - pad * 2) * fraction}
            x={x + pad}
            y={body_top + index * 20}
          />
        ) : null,
      )}
      <rect
        height={36}
        rx={18}
        style={{ fill: ACCENT }}
        width={88}
        x={x + pad}
        y={y + h - 52}
      />
      <TextBar
        h={9}
        tone="on_accent"
        w={36}
        x={x + pad + 26}
        y={y + h - 38.5}
      />
      {[0, 1, 2, 3].map((index) => (
        <Glyph
          key={`compose_tool${index}`}
          size={16}
          x={x + pad + 108 + index * 30}
          y={y + h - 42}
        />
      ))}
      <Glyph size={16} x={x + w - pad - 16} y={y + h - 42} />
    </g>
  );
}

export function ComposeHeader({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      <TextBar tone="strong" w={92} x={x + 16} y={y + 18} />
      {[0, 1, 2].map((index) => (
        <Glyph
          key={`minimized_action${index}`}
          size={14}
          x={x + w - 30 - index * 28}
          y={y + 15}
        />
      ))}
    </g>
  );
}

export const COMPOSE_DOCK = {
  width: 700,
  height: 600,
  minimized_width: 320,
  header_height: 44,
  edge: 16,
};

export function PageBackdrop({
  width = SCENE_WIDTH,
  height = SCENE_HEIGHT,
}: {
  width?: number;
  height?: number;
}) {
  return <rect height={height} style={{ fill: PAGE_FILL }} width={width} />;
}

export function ScrimLayer({
  width = SCENE_WIDTH,
  height = SCENE_HEIGHT,
}: {
  width?: number;
  height?: number;
}) {
  return <rect height={height} style={{ fill: SCRIM }} width={width} />;
}

interface PreviewOptionProps {
  label: string;
  is_selected: boolean;
  on_select: () => void;
  scope_class?: string;
  className?: string;
  children: ReactNode;
}

export function PreviewOption({
  label,
  is_selected,
  on_select,
  scope_class,
  className,
  children,
}: PreviewOptionProps) {
  return (
    <button
      aria-pressed={is_selected}
      className={cn(
        "group flex min-w-0 cursor-pointer flex-col gap-2 rounded-xl text-center outline-none",
        className,
      )}
      type="button"
      onClick={on_select}
    >
      <span className="relative block aspect-[16/10] w-full rounded-xl border border-edge-secondary transition-colors group-hover:border-edge-primary group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-[var(--accent-color)]">
        <span
          className={cn(
            "absolute inset-0 overflow-hidden rounded-[11px]",
            scope_class,
          )}
        >
          {children}
        </span>
        <SelectionMark check={false} className="rounded-[11px]" selected={is_selected} />
      </span>
      <span className="px-1 text-center text-sm font-medium leading-snug text-txt-primary">
        {label}
      </span>
    </button>
  );
}
