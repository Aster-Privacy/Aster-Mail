import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  SecureBuffer,
  zero_uint8_array,
  constant_time_compare,
  DEFAULT_AUTO_ZERO_TIMEOUT_MS,
} from "./secure_memory";

describe("SecureBuffer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("creation and initialization", () => {
    it("should create buffer from Uint8Array", () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const buffer = SecureBuffer.from_uint8_array(data);

      expect(buffer.get_length()).toBe(5);
      expect(buffer.is_cleared()).toBe(false);
    });

    it("should create buffer from string", () => {
      const buffer = SecureBuffer.from_string("test password");

      expect(buffer.get_length()).toBe(13);
      expect(buffer.to_string()).toBe("test password");
      expect(buffer.is_cleared()).toBe(false);
    });

    it("should create empty buffer", () => {
      const buffer = SecureBuffer.empty();

      expect(buffer.get_length()).toBe(0);
      expect(buffer.is_cleared()).toBe(false);
    });

    it("should zero source array after creating from Uint8Array", () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      SecureBuffer.from_uint8_array(data);

      expect(data.every((b) => b === 0)).toBe(true);
    });
  });

  describe("data access", () => {
    it("should return copy of bytes via get_bytes", () => {
      const original = new Uint8Array([10, 20, 30, 40, 50]);
      const buffer = SecureBuffer.from_uint8_array(original.slice());

      const bytes = buffer.get_bytes();

      expect(bytes).not.toBeNull();
      expect(bytes).toEqual(new Uint8Array([10, 20, 30, 40, 50]));
    });

    it("should return null from get_bytes after zeroing", () => {
      const buffer = SecureBuffer.from_string("secret");
      buffer.zero();

      expect(buffer.get_bytes()).toBeNull();
    });

    it("should return view of bytes via get_bytes_view", () => {
      const buffer = SecureBuffer.from_string("test");
      const view = buffer.get_bytes_view();

      expect(view).not.toBeNull();
      expect(view!.length).toBe(4);
    });

    it("should return null from get_bytes_view after zeroing", () => {
      const buffer = SecureBuffer.from_string("secret");
      buffer.zero();

      expect(buffer.get_bytes_view()).toBeNull();
    });

    it("should return string via to_string", () => {
      const buffer = SecureBuffer.from_string("hello world");

      expect(buffer.to_string()).toBe("hello world");
    });

    it("should return null from to_string after zeroing", () => {
      const buffer = SecureBuffer.from_string("secret");
      buffer.zero();

      expect(buffer.to_string()).toBeNull();
    });
  });

  describe("zeroing behavior", () => {
    it("should zero buffer contents", () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const buffer = SecureBuffer.from_uint8_array(data.slice());

      buffer.zero();

      expect(buffer.is_cleared()).toBe(true);
      expect(buffer.get_length()).toBe(0);
    });

    it("should call on_zero callback when zeroed", () => {
      const buffer = SecureBuffer.from_string("secret");
      const callback = vi.fn();

      buffer.on_zero(callback);
      buffer.zero();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should not call callback twice on double zero", () => {
      const buffer = SecureBuffer.from_string("secret");
      const callback = vi.fn();

      buffer.on_zero(callback);
      buffer.zero();
      buffer.zero();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should auto-zero after timeout", () => {
      const buffer = SecureBuffer.from_string("secret", 1000);

      expect(buffer.is_cleared()).toBe(false);

      vi.advanceTimersByTime(1001);

      expect(buffer.is_cleared()).toBe(true);
    });

    it("should not auto-zero if timeout is 0", () => {
      const buffer = SecureBuffer.from_string("secret", 0);

      vi.advanceTimersByTime(DEFAULT_AUTO_ZERO_TIMEOUT_MS + 1000);

      expect(buffer.is_cleared()).toBe(false);
    });
  });

  describe("timeout management", () => {
    it("should extend timeout on access", () => {
      const buffer = SecureBuffer.from_string("secret", 1000);

      vi.advanceTimersByTime(500);
      buffer.get_bytes();
      vi.advanceTimersByTime(500);

      expect(buffer.is_cleared()).toBe(false);
    });

    it("should allow manual timeout extension", () => {
      const buffer = SecureBuffer.from_string("secret", 1000);

      vi.advanceTimersByTime(900);
      buffer.extend_timeout();
      vi.advanceTimersByTime(900);

      expect(buffer.is_cleared()).toBe(false);
    });

    it("should update last access time on get_bytes", () => {
      const buffer = SecureBuffer.from_string("secret");
      const initial_access = buffer.get_last_access();

      vi.advanceTimersByTime(100);
      buffer.get_bytes();

      expect(buffer.get_last_access()).toBeGreaterThan(initial_access);
    });

    it("should allow changing auto-zero timeout", () => {
      const buffer = SecureBuffer.from_string("secret", 10000);

      buffer.set_auto_zero_timeout(100);
      vi.advanceTimersByTime(101);

      expect(buffer.is_cleared()).toBe(true);
    });
  });

  describe("cloning", () => {
    it("should create independent clone", () => {
      const buffer = SecureBuffer.from_string("secret");
      const clone = buffer.clone();

      expect(clone).not.toBeNull();
      expect(clone!.to_string()).toBe("secret");

      buffer.zero();

      expect(buffer.is_cleared()).toBe(true);
      expect(clone!.is_cleared()).toBe(false);
    });

    it("should return null when cloning zeroed buffer", () => {
      const buffer = SecureBuffer.from_string("secret");
      buffer.zero();

      expect(buffer.clone()).toBeNull();
    });

    it("should allow different timeout for clone", () => {
      const buffer = SecureBuffer.from_string("secret", 10000);
      const clone = buffer.clone(100);

      vi.advanceTimersByTime(101);

      expect(clone!.is_cleared()).toBe(true);
      expect(buffer.is_cleared()).toBe(false);
    });
  });
});

describe("zero_uint8_array", () => {
  it("should zero all bytes in array", () => {
    const array = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    zero_uint8_array(array);

    expect(array.every((b) => b === 0)).toBe(true);
  });

  it("should handle empty array", () => {
    const array = new Uint8Array(0);

    expect(() => zero_uint8_array(array)).not.toThrow();
  });

  it("should handle large arrays", () => {
    const array = new Uint8Array(10000);
    for (let i = 0; i < array.length; i++) {
      array[i] = i % 256;
    }

    zero_uint8_array(array);

    expect(array.every((b) => b === 0)).toBe(true);
  });
});

describe("constant_time_compare", () => {
  it("should return true for identical arrays", () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([1, 2, 3, 4, 5]);

    expect(constant_time_compare(a, b)).toBe(true);
  });

  it("should return false for different arrays", () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([1, 2, 3, 4, 6]);

    expect(constant_time_compare(a, b)).toBe(false);
  });

  it("should return false for arrays with different lengths", () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([1, 2, 3, 4]);

    expect(constant_time_compare(a, b)).toBe(false);
  });

  it("should return true for empty arrays", () => {
    const a = new Uint8Array(0);
    const b = new Uint8Array(0);

    expect(constant_time_compare(a, b)).toBe(true);
  });

  it("should compare in constant time (no early exit)", () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([0, 2, 3, 4, 5]);
    const c = new Uint8Array([1, 2, 3, 4, 0]);

    const start1 = performance.now();
    constant_time_compare(a, b);
    const time1 = performance.now() - start1;

    const start2 = performance.now();
    constant_time_compare(a, c);
    const time2 = performance.now() - start2;

    expect(Math.abs(time1 - time2)).toBeLessThan(1);
  });

  it("should handle single byte arrays", () => {
    expect(constant_time_compare(new Uint8Array([0]), new Uint8Array([0]))).toBe(
      true
    );
    expect(constant_time_compare(new Uint8Array([0]), new Uint8Array([1]))).toBe(
      false
    );
  });

  it("should handle all zeros", () => {
    const a = new Uint8Array(100).fill(0);
    const b = new Uint8Array(100).fill(0);

    expect(constant_time_compare(a, b)).toBe(true);
  });

  it("should handle all 255s", () => {
    const a = new Uint8Array(100).fill(255);
    const b = new Uint8Array(100).fill(255);

    expect(constant_time_compare(a, b)).toBe(true);
  });
});
