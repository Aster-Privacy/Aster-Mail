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

interface ComposeMockupProps {
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
      modal_overlay: "rgba(0,0,0,0.45)",
      card_shadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
      input_bg: "#f9fafb",
      toolbar_bg: "#f3f4f6",
      send_btn: "#3b82f6",
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
    modal_overlay: "rgba(0,0,0,0.75)",
    card_shadow: "0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
    input_bg: "#1e1e1e",
    toolbar_bg: "#1a1a1a",
    send_btn: "#3b82f6",
  };
}

type Colors = ReturnType<typeof get_colors>;

function MockupSidebar({ c }: { c: Colors }) {
  return (
    <div
      className="w-[46px] h-full flex flex-col p-1 gap-1 flex-shrink-0"
      style={{
        backgroundColor: c.sidebar_bg,
        borderRight: `1px solid ${c.sidebar_border}`,
      }}
    >
      <div className="flex items-center gap-1 px-0.5">
        <div className="w-3 h-3 rounded" style={{ backgroundColor: c.brand }} />
        <div
          className="flex-1 h-1 rounded-sm"
          style={{ backgroundColor: c.text_secondary }}
        />
      </div>
      <div
        className="h-4 rounded flex items-center justify-center"
        style={{
          background: c.compose_gradient,
          borderTop: `1px solid ${c.compose_border_top}`,
          borderBottom: `1px solid ${c.compose_border_bottom}`,
        }}
      >
        <div className="w-2 h-2 rounded-sm bg-white/80" />
      </div>
      <div className="flex-1 flex flex-col gap-px mt-0.5">
        <div
          className="h-3.5 rounded px-1 flex items-center gap-1"
          style={{
            backgroundColor: c.indicator_bg,
            border: `1px solid ${c.indicator_border}`,
          }}
        >
          <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: c.text_primary }} />
          <div className="flex-1 h-0.5 rounded-sm" style={{ backgroundColor: c.text_primary }} />
          <div className="w-1 h-1 rounded-full" style={{ backgroundColor: c.brand }} />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-3.5 rounded px-1 flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: c.text_muted }} />
            <div className="flex-1 h-0.5 rounded-sm" style={{ backgroundColor: c.text_muted }} />
          </div>
        ))}
        <div className="flex-1" />
        <div className="px-0.5">
          <div
            className="w-full h-0.5 rounded-full overflow-hidden"
            style={{ backgroundColor: c.storage_track }}
          >
            <div className="h-full rounded-full" style={{ width: "35%", backgroundColor: c.brand }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MockupEmailRows({ c }: { c: Colors }) {
  const rows = [
    { width: "28%", unread: true },
    { width: "24%", unread: false },
    { width: "32%", unread: false },
    { width: "22%", unread: false },
  ];

  return (
    <div className="flex-1 flex flex-col">
      <div
        className="h-3.5 flex items-center px-1.5 flex-shrink-0"
        style={{ borderBottom: `1px solid ${c.border_secondary}` }}
      >
        <div className="h-1 rounded-sm w-5" style={{ backgroundColor: c.text_primary }} />
        <div className="flex-1" />
        <div className="h-0.5 rounded-sm w-3" style={{ backgroundColor: c.text_muted }} />
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          className="h-5 flex items-center gap-1 px-1.5 flex-shrink-0"
          style={{
            backgroundColor: i === 0 ? c.selected_bg : undefined,
            borderBottom: `1px solid ${c.border_secondary}`,
          }}
        >
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: row.unread ? c.brand : c.avatar_read }}
          />
          <div
            className="h-0.5 rounded-sm flex-shrink-0"
            style={{ width: row.width, backgroundColor: row.unread ? c.text_primary : c.text_secondary }}
          />
          <div className="flex-1 h-0.5 rounded-sm" style={{ backgroundColor: c.text_tertiary }} />
          <div className="w-1.5 h-0.5 rounded-sm flex-shrink-0" style={{ backgroundColor: c.text_muted }} />
        </div>
      ))}
    </div>
  );
}

function ComposeCard({ c, full_height = false }: { c: Colors; full_height?: boolean }) {
  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 6,
        boxShadow: c.card_shadow,
        height: full_height ? "85%" : undefined,
        width: full_height ? "70%" : undefined,
      }}
    >
      <div
        className="flex items-center px-1.5 flex-shrink-0 gap-0.5"
        style={{
          height: 12,
          background: c.compose_gradient,
          borderBottom: `1px solid ${c.compose_border_bottom}`,
        }}
      >
        <div className="flex-1 h-0.5 rounded-sm bg-white/60" style={{ width: "40%" }} />
        <div className="flex gap-0.5">
          <div className="w-1 h-1 rounded-sm bg-white/50" />
          <div className="w-1 h-1 rounded-sm bg-white/50" />
          <div className="w-1 h-1 rounded-sm bg-white/50" />
        </div>
      </div>
      <div className="flex flex-col flex-1 overflow-hidden" style={{ backgroundColor: c.bg }}>
        {["To", "Subject"].map((label) => (
          <div
            key={label}
            className="flex items-center px-1.5 flex-shrink-0 gap-1"
            style={{ height: 10, borderBottom: `1px solid ${c.border_secondary}` }}
          >
            <div className="h-0.5 rounded-sm" style={{ width: 8, backgroundColor: c.text_muted }} />
            <div
              className="flex-1 h-0.5 rounded-sm"
              style={{ backgroundColor: label === "To" ? c.text_secondary : c.text_tertiary, opacity: 0.6 }}
            />
          </div>
        ))}
        <div className="flex-1 p-1 flex flex-col gap-0.5">
          <div className="h-0.5 rounded-sm" style={{ backgroundColor: c.body_line }} />
          <div className="h-0.5 rounded-sm w-[88%]" style={{ backgroundColor: c.body_line }} />
          <div className="h-0.5 rounded-sm w-[72%]" style={{ backgroundColor: c.body_line }} />
        </div>
        <div
          className="flex items-center px-1.5 flex-shrink-0 gap-1"
          style={{ height: 11, borderTop: `1px solid ${c.border_secondary}`, backgroundColor: c.toolbar_bg }}
        >
          <div
            className="h-2 rounded-sm px-1 flex items-center"
            style={{ backgroundColor: c.send_btn }}
          >
            <div className="w-2 h-0.5 rounded-sm bg-white/90" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: c.text_muted }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ComposeMockupDefault({ theme }: ComposeMockupProps) {
  const c = get_colors(theme);

  return (
    <div
      className="w-full h-full rounded-md overflow-hidden flex relative"
      style={{ backgroundColor: c.bg }}
    >
      <MockupSidebar c={c} />
      <div className="flex-1 flex" style={{ backgroundColor: c.bg }}>
        <MockupEmailRows c={c} />
      </div>
      <div className="absolute bottom-1.5 right-1.5" style={{ width: "44%", minWidth: 0 }}>
        <ComposeCard c={c} />
      </div>
    </div>
  );
}

export function ComposeMockupFullscreen({ theme }: ComposeMockupProps) {
  const c = get_colors(theme);

  return (
    <div
      className="w-full h-full rounded-md overflow-hidden flex relative"
      style={{ backgroundColor: c.bg }}
    >
      <MockupSidebar c={c} />
      <div className="flex-1 flex" style={{ backgroundColor: c.bg }}>
        <MockupEmailRows c={c} />
      </div>
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ backgroundColor: c.modal_overlay }}
      >
        <ComposeCard c={c} full_height />
      </div>
    </div>
  );
}

export function ComposeMockupMinimized({ theme }: ComposeMockupProps) {
  const c = get_colors(theme);

  return (
    <div
      className="w-full h-full rounded-md overflow-hidden flex relative"
      style={{ backgroundColor: c.bg }}
    >
      <MockupSidebar c={c} />
      <div className="flex-1 flex" style={{ backgroundColor: c.bg }}>
        <MockupEmailRows c={c} />
      </div>
      <div className="absolute bottom-0 right-1.5" style={{ width: "44%" }}>
        <div
          className="flex items-center px-1.5 gap-0.5"
          style={{
            height: 13,
            background: c.compose_gradient,
            borderRadius: "4px 4px 0 0",
            borderTop: `1px solid ${c.compose_border_top}`,
            border: `1px solid ${c.border}`,
            borderBottom: "none",
            boxShadow: c.card_shadow,
          }}
        >
          <div className="flex-1 h-0.5 rounded-sm bg-white/60" style={{ maxWidth: "55%" }} />
          <div className="flex gap-0.5 ml-auto">
            <div className="w-1 h-1 rounded-sm bg-white/50" />
            <div className="w-1 h-1 rounded-sm bg-white/50" />
          </div>
        </div>
      </div>
    </div>
  );
}
