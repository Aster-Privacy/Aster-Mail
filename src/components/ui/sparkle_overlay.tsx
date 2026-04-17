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
import { useEffect, useRef } from "react";

interface SparkleOverlayProps {
  is_active: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  fade_speed: number;
  fade_dir: number;
}

export function SparkleOverlay({ is_active }: SparkleOverlayProps) {
  const canvas_ref = useRef<HTMLCanvasElement>(null);
  const animation_ref = useRef<number>(0);
  const particles_ref = useRef<Particle[]>([]);
  const initialized_ref = useRef(false);

  useEffect(() => {
    const canvas = canvas_ref.current;

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    if (!initialized_ref.current) {
      const rect = canvas.getBoundingClientRect();

      if (rect.width === 0 || rect.height === 0) return;

      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;

      const count = Math.max(10, Math.floor((w * h) / 140));

      const max_size = 1.3;

      particles_ref.current = Array.from({ length: count }, () => ({
        x: max_size + Math.random() * (w - max_size * 2),
        y: max_size + Math.random() * (h - max_size * 2),
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        size: 0.5 + Math.random() * 0.8,
        opacity: Math.random(),
        fade_speed: 0.004 + Math.random() * 0.012,
        fade_dir: Math.random() > 0.5 ? 1 : -1,
      }));

      initialized_ref.current = true;
    }

    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    const color_str = getComputedStyle(canvas).color;
    const rgb_match = color_str.match(/(\d+)/g);
    const [r, g, b] = rgb_match ? rgb_match.map(Number) : [255, 255, 255];

    const reduce_motion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduce_motion) {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles_ref.current) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.opacity * 0.7})`;
        ctx.fill();
      }

      return;
    }

    const animate = () => {
      ctx.clearRect(0, 0, w, h);

      for (const p of particles_ref.current) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < p.size || p.x > w - p.size) p.vx *= -1;
        if (p.y < p.size || p.y > h - p.size) p.vy *= -1;

        p.x = Math.max(p.size, Math.min(w - p.size, p.x));
        p.y = Math.max(p.size, Math.min(h - p.size, p.y));

        p.opacity += p.fade_dir * p.fade_speed;
        if (p.opacity >= 1) {
          p.opacity = 1;
          p.fade_dir = -1;
        }
        if (p.opacity <= 0) {
          p.opacity = 0;
          p.fade_dir = 1;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.opacity * 0.7})`;
        ctx.fill();
      }

      animation_ref.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animation_ref.current);
    };
  }, []);

  return (
    <canvas
      ref={canvas_ref}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        borderRadius: "inherit",
        color: "var(--text-primary)",
        opacity: is_active ? 1 : 0,
        transition: "opacity 0.2s ease",
      }}
    />
  );
}
