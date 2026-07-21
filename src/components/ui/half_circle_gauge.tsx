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
interface HalfCircleGaugeProps {
  percent: number;
  size?: number;
  stroke_width?: number;
  color?: string;
  track_color?: string;
  value_label: string;
  text_label: string;
  value_color?: string;
  className?: string;
}

function polar_to_cartesian(cx: number, cy: number, r: number, angle_deg: number) {
  const angle_rad = (angle_deg * Math.PI) / 180;

  return {
    x: cx + r * Math.cos(angle_rad),
    y: cy - r * Math.sin(angle_rad),
  };
}

function describe_half_arc(cx: number, cy: number, r: number, percent: number) {
  const clamped = Math.max(0, Math.min(100, percent));
  const start = polar_to_cartesian(cx, cy, r, 180);
  const end_angle = 180 - (clamped / 100) * 180;
  const end = polar_to_cartesian(cx, cy, r, end_angle);

  return `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
}

export function HalfCircleGauge({
  percent,
  size = 96,
  stroke_width = 9,
  color = "#7c3aed",
  track_color = "#e5e7eb",
  value_label,
  text_label,
  value_color,
  className,
}: HalfCircleGaugeProps) {
  const width = size;
  const height = size / 2 + stroke_width / 2;
  const cx = width / 2;
  const cy = height - stroke_width / 2;
  const r = (size - stroke_width) / 2;
  const track_path = describe_half_arc(cx, cy, r, 100);
  const progress_path = describe_half_arc(cx, cy, r, percent);

  return (
    <div className={`flex flex-col items-center ${className ?? ""}`}>
      <div className="relative" style={{ width, height }}>
        <svg height={height} width={width}>
          <path
            d={track_path}
            fill="none"
            stroke={track_color}
            strokeLinecap="round"
            strokeWidth={stroke_width}
          />
          {percent > 0 && (
            <path
              d={progress_path}
              fill="none"
              stroke={color}
              strokeLinecap="round"
              strokeWidth={stroke_width}
            />
          )}
        </svg>
        <div
          className="absolute inset-x-0 bottom-0 flex items-end justify-center"
          style={{ paddingBottom: stroke_width * 0.15 }}
        >
          <span
            className="font-bold tabular-nums leading-none"
            style={{ fontSize: size * 0.22, color: value_color ?? "inherit" }}
          >
            {value_label}
          </span>
        </div>
      </div>
      <p className="text-xs text-txt-muted mt-1.5 text-center">{text_label}</p>
    </div>
  );
}
