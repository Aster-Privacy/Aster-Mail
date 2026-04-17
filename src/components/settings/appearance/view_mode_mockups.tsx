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

interface ViewMockupProps {
  theme: "light" | "dark";
}

function get_colors(theme: "light" | "dark") {
  if (theme === "light") {
    return {
      bg: "#ffffff",
      sidebar_bg: "#f5f5f5",
      sidebar_border: "#e8e8e8",
      brand: "#3b82f6",
      compose_gradient:
        "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
      compose_border_top: "rgba(255,255,255,0.15)",
      compose_border_bottom: "rgba(0,0,0,0.15)",
      text_primary: "#111827",
      text_secondary: "#374151",
      text_tertiary: "#6b7280",
      text_muted: "#9ca3af",
      selected_bg: "#eff6ff",
      indicator_bg: "#ffffff",
      indicator_border: "#e8e8e8",
      border: "#e8e8e8",
      border_secondary: "#e5e7eb",
      body_line: "#e5e7eb",
      avatar_read: "#d1d5db",
      storage_track: "#0000000d",
      modal_overlay: "rgba(0,0,0,0.5)",
      card_shadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
    };
  }

  return {
    bg: "#121212",
    sidebar_bg: "#0a0a0a",
    sidebar_border: "#2a2a2a",
    brand: "#3b82f6",
    compose_gradient:
      "linear-gradient(to bottom, #6b8aff 0%, #4f6ef7 50%, #3b5ae8 100%)",
    compose_border_top: "rgba(255,255,255,0.15)",
    compose_border_bottom: "rgba(0,0,0,0.15)",
    text_primary: "#ffffff",
    text_secondary: "#e5e5e5",
    text_tertiary: "#888888",
    text_muted: "#666666",
    selected_bg: "#142744",
    indicator_bg: "#121212",
    indicator_border: "#333333",
    border: "#333333",
    border_secondary: "#2a2a2a",
    body_line: "#2a2a2a",
    avatar_read: "#3a3a3a",
    storage_track: "#ffffff0f",
    modal_overlay: "rgba(0,0,0,0.85)",
    card_shadow: "0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
  };
}

type Colors = ReturnType<typeof get_colors>;

function MockupSidebar({ c }: { c: Colors }) {
  return (
    <div
      className="w-[52px] h-full flex flex-col p-1.5 gap-1.5 flex-shrink-0"
      style={{
        backgroundColor: c.sidebar_bg,
        borderRight: `1px solid ${c.sidebar_border}`,
      }}
    >
      <div className="flex items-center gap-1.5 px-1">
        <div className="w-4 h-4 rounded" style={{ backgroundColor: c.brand }} />
        <div
          className="flex-1 h-1.5 rounded-sm"
          style={{ backgroundColor: c.text_secondary }}
        />
      </div>
      <div
        className="h-5 rounded flex items-center justify-center"
        style={{
          background: c.compose_gradient,
          borderTop: `1px solid ${c.compose_border_top}`,
          borderBottom: `1px solid ${c.compose_border_bottom}`,
        }}
      >
        <div className="w-2.5 h-2.5 rounded-sm bg-white/80" />
      </div>
      <div className="flex-1 flex flex-col mt-0.5">
        <div className="px-1 mb-0.5">
          <div
            className="w-3.5 h-0.5 rounded-sm"
            style={{ backgroundColor: c.text_muted, opacity: 0.5 }}
          />
        </div>
        <div className="space-y-px">
          <div
            className="h-4 rounded px-1.5 flex items-center gap-1"
            style={{
              backgroundColor: c.indicator_bg,
              border: `1px solid ${c.indicator_border}`,
            }}
          >
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: c.text_primary }}
            />
            <div
              className="flex-1 h-1 rounded-sm"
              style={{ backgroundColor: c.text_primary }}
            />
            <div
              className="w-1 h-1 rounded-full"
              style={{ backgroundColor: c.brand }}
            />
          </div>
          <div className="h-4 rounded px-1.5 flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: c.text_muted }}
            />
            <div
              className="flex-1 h-1 rounded-sm"
              style={{ backgroundColor: c.text_muted }}
            />
          </div>
          <div className="h-4 rounded px-1.5 flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: c.text_muted }}
            />
            <div
              className="flex-1 h-1 rounded-sm"
              style={{ backgroundColor: c.text_muted }}
            />
          </div>
        </div>
        <div className="px-1 mt-1.5 mb-0.5">
          <div
            className="w-3 h-0.5 rounded-sm"
            style={{ backgroundColor: c.text_muted, opacity: 0.5 }}
          />
        </div>
        <div className="h-4 rounded px-1.5 flex items-center gap-1">
          <div
            className="w-2 h-2 rounded-sm"
            style={{ backgroundColor: c.text_muted }}
          />
          <div
            className="flex-1 h-1 rounded-sm"
            style={{ backgroundColor: c.text_muted }}
          />
        </div>
        <div className="flex-1" />
        <div className="px-0.5">
          <div
            className="w-full h-1 rounded-full overflow-hidden"
            style={{ backgroundColor: c.storage_track }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: "35%", backgroundColor: c.brand }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MockupEmailList({
  c,
  full_width = false,
}: {
  c: Colors;
  full_width?: boolean;
}) {
  return (
    <div
      className={full_width ? "flex-1 flex flex-col" : "w-[55%] flex flex-col"}
      style={full_width ? undefined : { borderRight: `1px solid ${c.border}` }}
    >
      <div
        className="h-4 flex items-center justify-between px-1.5 flex-shrink-0"
        style={{ borderBottom: `1px solid ${c.border_secondary}` }}
      >
        <div className="flex items-center gap-1">
          <div
            className="w-2 h-2 rounded-sm"
            style={{ border: `1.5px solid ${c.text_muted}` }}
          />
          <div
            className="h-1.5 rounded-sm w-5"
            style={{ backgroundColor: c.text_primary }}
          />
        </div>
        <div className="flex items-center gap-0.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: c.text_muted }}
          />
          <div
            className="h-0.5 rounded-sm w-4"
            style={{ backgroundColor: c.text_muted }}
          />
        </div>
      </div>
      <div className="flex-1">
        <div
          className="h-6 flex items-center gap-1 px-1.5"
          style={{
            backgroundColor: c.selected_bg,
            borderBottom: `1px solid ${c.border_secondary}`,
          }}
        >
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: c.brand }}
          />
          <div
            className="h-1 rounded-sm flex-shrink-0"
            style={{ width: "28%", backgroundColor: c.text_primary }}
          />
          <div
            className="flex-1 h-1 rounded-sm"
            style={{ backgroundColor: c.text_secondary }}
          />
          <div
            className="w-2 h-0.5 rounded-sm flex-shrink-0"
            style={{ backgroundColor: c.text_muted }}
          />
          <div
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: c.brand }}
          />
        </div>
        <div
          className="h-6 flex items-center gap-1 px-1.5"
          style={{ borderBottom: `1px solid ${c.border_secondary}` }}
        >
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: c.avatar_read }}
          />
          <div
            className="h-1 rounded-sm flex-shrink-0"
            style={{ width: "24%", backgroundColor: c.text_secondary }}
          />
          <div
            className="flex-1 h-1 rounded-sm"
            style={{ backgroundColor: c.text_tertiary }}
          />
          <div
            className="w-2 h-0.5 rounded-sm flex-shrink-0"
            style={{ backgroundColor: c.text_muted }}
          />
        </div>
        <div
          className="h-6 flex items-center gap-1 px-1.5"
          style={{ borderBottom: `1px solid ${c.border_secondary}` }}
        >
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: c.avatar_read }}
          />
          <div
            className="h-1 rounded-sm flex-shrink-0"
            style={{ width: "32%", backgroundColor: c.text_secondary }}
          />
          <div
            className="flex-1 h-1 rounded-sm"
            style={{ backgroundColor: c.text_tertiary }}
          />
          <div
            className="w-2 h-0.5 rounded-sm flex-shrink-0"
            style={{ backgroundColor: c.text_muted }}
          />
        </div>
        <div
          className="h-6 flex items-center gap-1 px-1.5"
          style={{ borderBottom: `1px solid ${c.border_secondary}` }}
        >
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: c.avatar_read }}
          />
          <div
            className="h-1 rounded-sm flex-shrink-0"
            style={{ width: "26%", backgroundColor: c.text_secondary }}
          />
          <div
            className="flex-1 h-1 rounded-sm"
            style={{ backgroundColor: c.text_tertiary }}
          />
          <div
            className="w-2 h-0.5 rounded-sm flex-shrink-0"
            style={{ backgroundColor: c.text_muted }}
          />
        </div>
      </div>
    </div>
  );
}

export function ViewMockupSplit({ theme }: ViewMockupProps) {
  const c = get_colors(theme);

  return (
    <div
      className="w-full h-full rounded-md overflow-hidden flex"
      style={{ backgroundColor: c.bg }}
    >
      <MockupSidebar c={c} />
      <div className="flex-1 flex" style={{ backgroundColor: c.bg }}>
        <MockupEmailList c={c} />
        <div className="flex-1 flex flex-col">
          <div
            className="h-3.5 flex items-center gap-0.5 px-1.5 flex-shrink-0"
            style={{ borderBottom: `1px solid ${c.border_secondary}` }}
          >
            <div
              className="w-1.5 h-1.5 rounded-sm"
              style={{ backgroundColor: c.text_muted }}
            />
            <div
              className="w-1.5 h-1.5 rounded-sm"
              style={{ backgroundColor: c.text_muted }}
            />
            <div
              className="w-1.5 h-1.5 rounded-sm"
              style={{ backgroundColor: c.text_muted }}
            />
            <div className="flex-1" />
            <div
              className="w-1.5 h-1.5 rounded-sm"
              style={{ backgroundColor: c.text_muted }}
            />
          </div>
          <div className="flex-1 p-2">
            <div
              className="w-[75%] h-1.5 rounded-sm mb-1"
              style={{ backgroundColor: c.text_primary }}
            />
            <div className="flex items-center gap-1 mb-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: c.brand }}
              />
              <div>
                <div
                  className="w-6 h-0.5 rounded-sm mb-0.5"
                  style={{ backgroundColor: c.text_secondary }}
                />
                <div
                  className="w-10 h-0.5 rounded-sm"
                  style={{ backgroundColor: c.text_muted }}
                />
              </div>
            </div>
            <div
              className="w-full mb-1.5"
              style={{ height: "1px", backgroundColor: c.border_secondary }}
            />
            <div className="space-y-1">
              <div
                className="w-full h-1 rounded-sm"
                style={{ backgroundColor: c.body_line }}
              />
              <div
                className="w-[92%] h-1 rounded-sm"
                style={{ backgroundColor: c.body_line }}
              />
              <div
                className="w-[85%] h-1 rounded-sm"
                style={{ backgroundColor: c.body_line }}
              />
              <div
                className="w-[78%] h-1 rounded-sm"
                style={{ backgroundColor: c.body_line }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ViewMockupPopup({ theme }: ViewMockupProps) {
  const c = get_colors(theme);

  return (
    <div
      className="w-full h-full rounded-md overflow-hidden flex relative"
      style={{ backgroundColor: c.bg }}
    >
      <MockupSidebar c={c} />
      <div className="flex-1 flex" style={{ backgroundColor: c.bg }}>
        <MockupEmailList full_width c={c} />
      </div>
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ backgroundColor: c.modal_overlay }}
      >
        <div
          className="w-[56%] rounded-lg flex flex-col overflow-hidden"
          style={{
            backgroundColor: c.bg,
            boxShadow: c.card_shadow,
            border: `1px solid ${c.border}`,
            height: "70%",
          }}
        >
          <div
            className="h-3.5 flex items-center px-1.5 flex-shrink-0 gap-0.5"
            style={{ borderBottom: `1px solid ${c.border_secondary}` }}
          >
            <div
              className="w-1.5 h-1.5 rounded-sm"
              style={{ backgroundColor: c.text_muted }}
            />
            <div
              className="w-1.5 h-1.5 rounded-sm"
              style={{ backgroundColor: c.text_muted }}
            />
            <div className="flex-1" />
            <div
              className="w-1.5 h-1.5 rounded-sm"
              style={{ backgroundColor: c.text_muted }}
            />
            <div
              className="w-1.5 h-1.5 rounded-sm"
              style={{ backgroundColor: c.text_muted }}
            />
            <div
              className="w-1.5 h-1.5 rounded-sm"
              style={{ backgroundColor: c.text_muted }}
            />
          </div>
          <div className="flex-1 p-2 overflow-hidden">
            <div
              className="w-[75%] h-1.5 rounded-sm mb-1"
              style={{ backgroundColor: c.text_primary }}
            />
            <div className="flex items-center gap-1 mb-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: c.brand }}
              />
              <div>
                <div
                  className="w-6 h-0.5 rounded-sm mb-0.5"
                  style={{ backgroundColor: c.text_secondary }}
                />
                <div
                  className="w-10 h-0.5 rounded-sm"
                  style={{ backgroundColor: c.text_muted }}
                />
              </div>
            </div>
            <div
              className="w-full mb-1.5"
              style={{ height: "1px", backgroundColor: c.border_secondary }}
            />
            <div className="space-y-1">
              <div
                className="w-full h-1 rounded-sm"
                style={{ backgroundColor: c.body_line }}
              />
              <div
                className="w-[90%] h-1 rounded-sm"
                style={{ backgroundColor: c.body_line }}
              />
              <div
                className="w-[75%] h-1 rounded-sm"
                style={{ backgroundColor: c.body_line }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ViewMockupFullpage({ theme }: ViewMockupProps) {
  const c = get_colors(theme);

  return (
    <div
      className="w-full h-full rounded-md overflow-hidden flex"
      style={{ backgroundColor: c.bg }}
    >
      <MockupSidebar c={c} />
      <div className="flex-1 flex flex-col" style={{ backgroundColor: c.bg }}>
        <div
          className="h-4 flex items-center justify-between px-2 flex-shrink-0"
          style={{ borderBottom: `1px solid ${c.border_secondary}` }}
        >
          <div className="flex items-center gap-0.5">
            <svg
              className="w-2 h-2"
              fill="none"
              stroke={c.brand}
              strokeLinecap="round"
              strokeWidth={2.5}
              viewBox="0 0 8 8"
            >
              <path d="M5 1L2 4L5 7" />
            </svg>
            <div
              className="w-3.5 h-1 rounded-sm"
              style={{ backgroundColor: c.brand }}
            />
          </div>
          <div className="flex items-center gap-0.5">
            <div
              className="h-0.5 w-3 rounded-sm"
              style={{ backgroundColor: c.text_muted }}
            />
            <div
              className="w-1.5 h-1.5 rounded-sm"
              style={{ backgroundColor: c.text_muted }}
            />
            <div
              className="w-1.5 h-1.5 rounded-sm"
              style={{ backgroundColor: c.text_muted }}
            />
          </div>
        </div>
        <div className="flex-1 p-2.5">
          <div
            className="w-[65%] h-2 rounded-sm mb-1.5"
            style={{ backgroundColor: c.text_primary }}
          />
          <div className="flex items-center gap-1.5 mb-2">
            <div
              className="w-3.5 h-3.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: c.brand }}
            />
            <div>
              <div
                className="w-8 h-1 rounded-sm mb-0.5"
                style={{ backgroundColor: c.text_secondary }}
              />
              <div
                className="w-14 h-0.5 rounded-sm"
                style={{ backgroundColor: c.text_muted }}
              />
            </div>
          </div>
          <div
            className="w-full mb-2"
            style={{ height: "1px", backgroundColor: c.border_secondary }}
          />
          <div className="space-y-1">
            <div
              className="w-full h-1 rounded-sm"
              style={{ backgroundColor: c.body_line }}
            />
            <div
              className="w-[94%] h-1 rounded-sm"
              style={{ backgroundColor: c.body_line }}
            />
            <div
              className="w-[88%] h-1 rounded-sm"
              style={{ backgroundColor: c.body_line }}
            />
            <div
              className="w-[82%] h-1 rounded-sm"
              style={{ backgroundColor: c.body_line }}
            />
            <div
              className="w-[75%] h-1 rounded-sm"
              style={{ backgroundColor: c.body_line }}
            />
            <div
              className="w-[90%] h-1 rounded-sm"
              style={{ backgroundColor: c.body_line }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
