import { useState, useEffect, useRef, useCallback } from "react";

interface SkeletonLoaderState<T> {
  is_loading: boolean;
  data: T | null;
  error: string | null;
}

interface SkeletonLoaderOptions {
  skip_initial?: boolean;
}

export function use_skeleton_loader<T>(
  fetch_fn: () => Promise<{ data?: T; error?: string }>,
  dependencies: unknown[] = [],
  options: SkeletonLoaderOptions = {},
): SkeletonLoaderState<T> & { refetch: () => void } {
  const [state, set_state] = useState<SkeletonLoaderState<T>>({
    is_loading: !options.skip_initial,
    data: null,
    error: null,
  });

  const is_mounted = useRef(true);
  const fetch_id = useRef(0);

  const fetch_data = useCallback(async () => {
    const current_fetch = ++fetch_id.current;

    set_state((prev) => ({ ...prev, is_loading: true, error: null }));

    const result = await fetch_fn();

    if (!is_mounted.current || current_fetch !== fetch_id.current) return;

    set_state({
      is_loading: false,
      data: result.data ?? null,
      error: result.error ?? null,
    });
  }, [fetch_fn]);

  useEffect(() => {
    is_mounted.current = true;
    fetch_data();

    return () => {
      is_mounted.current = false;
    };
  }, dependencies);

  return { ...state, refetch: fetch_data };
}

export function use_tab_skeleton(active_tab: string): {
  is_skeleton_visible: boolean;
  current_tab: string;
} {
  const [current_tab, set_current_tab] = useState(active_tab);

  useEffect(() => {
    if (active_tab !== current_tab) {
      set_current_tab(active_tab);
    }
  }, [active_tab, current_tab]);

  return { is_skeleton_visible: false, current_tab };
}

export function use_initial_skeleton(is_data_ready: boolean): boolean {
  return !is_data_ready;
}
