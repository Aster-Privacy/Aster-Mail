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
import { useEffect, useRef, useCallback } from "react";

import { use_should_reduce_motion } from "@/provider";

const COLORS = [
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#F59E0B",
  "#10B981",
  "#06B6D4",
];
const PARTICLE_COUNT = 60;
const DURATION = 2500;
const GRAVITY = 0.12;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotation_speed: number;
  opacity: number;
  shape: "rect" | "circle";
}

function create_particles(width: number, height: number): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    x: width * 0.5 + (Math.random() - 0.5) * width * 0.3,
    y: height * 0.4,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 10 - 4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: Math.random() * 6 + 3,
    rotation: Math.random() * 360,
    rotation_speed: (Math.random() - 0.5) * 15,
    opacity: 1,
    shape: Math.random() > 0.5 ? "rect" : "circle",
  }));
}

interface InboxZeroConfettiProps {
  is_active: boolean;
}

export function InboxZeroConfetti({ is_active }: InboxZeroConfettiProps) {
  const canvas_ref = useRef<HTMLCanvasElement>(null);
  const animation_ref = useRef<number>(0);
  const reduce_motion = use_should_reduce_motion();

  const start_animation = useCallback(() => {
    const canvas = canvas_ref.current;

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const particles = create_particles(canvas.offsetWidth, canvas.offsetHeight);
    const start_time = performance.now();

    const animate = (time: number) => {
      const elapsed = time - start_time;

      if (elapsed > DURATION) {
        ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

        return;
      }

      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      const fade =
        elapsed > DURATION * 0.7
          ? 1 - (elapsed - DURATION * 0.7) / (DURATION * 0.3)
          : 1;

      for (const p of particles) {
        p.vy += GRAVITY;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotation_speed;
        p.opacity = fade;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;

        if (p.shape === "rect") {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      animation_ref.current = requestAnimationFrame(animate);
    };

    animation_ref.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (is_active && !reduce_motion) {
      start_animation();
    }

    return () => {
      if (animation_ref.current) {
        cancelAnimationFrame(animation_ref.current);
      }
    };
  }, [is_active, reduce_motion, start_animation]);

  if (!is_active || reduce_motion) return null;

  return (
    <canvas
      ref={canvas_ref}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
