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
import type { ComponentType } from "react";

export function polar_to_cartesian(
  center_x: number,
  center_y: number,
  radius: number,
  angle_degrees: number,
) {
  const angle_radians = ((angle_degrees - 180) * Math.PI) / 180;

  return {
    x: center_x + radius * Math.cos(angle_radians),
    y: center_y + radius * Math.sin(angle_radians),
  };
}

export function describe_semicircle_arc(
  center_x: number,
  center_y: number,
  radius: number,
  start_angle: number,
  end_angle: number,
) {
  const start = polar_to_cartesian(center_x, center_y, radius, end_angle);
  const end = polar_to_cartesian(center_x, center_y, radius, start_angle);
  const large_arc_flag = end_angle - start_angle <= 180 ? "0" : "1";

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large_arc_flag} 0 ${end.x} ${end.y}`;
}

interface StatRingProps {
  value: number;
  max: number;
  color_class: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  display_value?: string;
  sublabel?: string;
}

export function StatRing({
  value,
  max,
  color_class,
  icon: Icon,
  label,
  display_value,
  sublabel,
}: StatRingProps) {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : value > 0 ? 1 : 0;
  const dash = circumference * ratio;

  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-xl border border-edge-secondary">
      <div className="relative flex-shrink-0 w-11 h-11">
        <svg className="w-11 h-11 -rotate-90" viewBox="0 0 40 40">
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-edge-secondary"
            strokeWidth={4}
          />
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="currentColor"
            className={`${color_class} transition-all duration-500`}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon className={`w-4 h-4 ${color_class}`} />
        </div>
      </div>
      <div className="min-w-0">
        <p className={`text-lg font-bold tabular-nums ${color_class}`}>
          {display_value ?? value}
        </p>
        <p className="text-xs text-txt-muted mt-0.5 truncate">{label}</p>
        {sublabel && <p className="text-[11px] text-txt-muted mt-0.5 truncate">{sublabel}</p>}
      </div>
    </div>
  );
}

interface SemicircleGaugeProps {
  percent: number;
  bottom_label: string;
}

export function SemicircleGauge({
  percent,
  bottom_label,
}: SemicircleGaugeProps) {
  const clamped_percent = Math.min(100, Math.max(0, percent));
  const center_x = 100;
  const center_y = 96;
  const radius = 82;
  const stroke_width = 16;
  const progress_angle = (clamped_percent / 100) * 180;

  return (
    <div className="relative flex flex-col items-center w-full max-w-[220px]">
      <svg
        className="w-full h-auto"
        role="img"
        aria-label={`${Math.round(clamped_percent)}%`}
        viewBox="0 0 200 106"
      >
        <path
          d={describe_semicircle_arc(center_x, center_y, radius, 0, 180)}
          fill="none"
          stroke="currentColor"
          className="text-edge-secondary"
          strokeWidth={stroke_width}
          strokeLinecap="round"
        />
        <path
          d={describe_semicircle_arc(center_x, center_y, radius, 0, progress_angle)}
          fill="none"
          stroke="currentColor"
          className="text-blue-600 transition-all duration-500"
          strokeWidth={stroke_width}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-1">
        <p className="text-xl font-bold text-txt-primary tabular-nums leading-none">
          {Math.round(clamped_percent)}%
        </p>
        <p className="text-[11px] text-txt-muted mt-1">{bottom_label}</p>
      </div>
    </div>
  );
}
