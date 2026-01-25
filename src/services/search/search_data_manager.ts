import { clear_search_history, get_search_history } from "./search_history";
import { clear_saved_searches, get_saved_searches } from "./saved_searches";

import { clear_search_result_cache } from "@/hooks/use_search";
import { get_search_worker } from "@/services/crypto/search_worker_client";

export { secure_wipe_storage_key } from "./secure_wipe";

export interface ClearSearchDataOptions {
  clear_history?: boolean;
  clear_saved_searches?: boolean;
  clear_cache?: boolean;
  rebuild_index?: boolean;
}

export interface ClearSearchDataResult {
  success: boolean;
  cleared: {
    history: boolean;
    saved_searches: boolean;
    cache: boolean;
    index_rebuilt: boolean;
  };
  errors: string[];
}

function validate_user_id(user_id: string): boolean {
  return (
    typeof user_id === "string" && user_id.length > 0 && user_id.length < 100
  );
}

export async function clear_search_data(
  user_id: string,
  options: ClearSearchDataOptions = {},
): Promise<ClearSearchDataResult> {
  const result: ClearSearchDataResult = {
    success: true,
    cleared: {
      history: false,
      saved_searches: false,
      cache: false,
      index_rebuilt: false,
    },
    errors: [],
  };

  if (!validate_user_id(user_id)) {
    result.success = false;
    result.errors.push("Invalid user ID");

    return result;
  }

  const {
    clear_history = true,
    clear_saved_searches: clear_saved = true,
    clear_cache = true,
    rebuild_index = false,
  } = options;

  if (clear_history) {
    try {
      await clear_search_history(user_id);
      result.cleared.history = true;
    } catch (err) {
      result.errors.push(
        `Failed to clear history: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      result.success = false;
    }
  }

  if (clear_saved) {
    try {
      await clear_saved_searches(user_id);
      result.cleared.saved_searches = true;
    } catch (err) {
      result.errors.push(
        `Failed to clear saved searches: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      result.success = false;
    }
  }

  if (clear_cache) {
    try {
      clear_search_result_cache();

      const worker = get_search_worker();

      if (worker.is_ready()) {
        await worker.clear_cache();
      }

      result.cleared.cache = true;
    } catch (err) {
      result.errors.push(
        `Failed to clear cache: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      result.success = false;
    }
  }

  if (rebuild_index) {
    try {
      const worker = get_search_worker();

      if (worker.is_ready()) {
        await worker.clear_cache();
      }

      result.cleared.index_rebuilt = true;
    } catch (err) {
      result.errors.push(
        `Failed to clear index: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      result.success = false;
    }
  }

  return result;
}

export async function get_search_data_stats(user_id: string): Promise<{
  history_count: number;
  saved_searches_count: number;
  index_stats: {
    message_count: number;
    token_count: number;
    memory_estimate_bytes: number;
  } | null;
}> {
  if (!validate_user_id(user_id)) {
    return {
      history_count: 0,
      saved_searches_count: 0,
      index_stats: null,
    };
  }

  const [history, saved_searches] = await Promise.all([
    get_search_history(user_id),
    get_saved_searches(user_id),
  ]);

  let index_stats = null;

  try {
    const worker = get_search_worker();

    if (worker.is_ready()) {
      const stats = await worker.get_stats();

      index_stats = {
        message_count: stats.message_count,
        token_count: stats.token_count,
        memory_estimate_bytes: stats.memory_estimate_bytes,
      };
    }
  } catch {
    index_stats = null;
  }

  return {
    history_count: history.length,
    saved_searches_count: saved_searches.length,
    index_stats,
  };
}

export function format_bytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }

  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    units.length - 1,
  );
  const value = bytes / Math.pow(k, i);

  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
