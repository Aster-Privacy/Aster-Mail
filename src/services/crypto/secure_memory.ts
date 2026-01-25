const DEFAULT_AUTO_ZERO_TIMEOUT_MS = 5 * 60 * 1000;

type ZeroCallback = () => void;

class SecureBuffer {
  private buffer: Uint8Array;
  private is_zeroed: boolean;
  private auto_zero_timer: ReturnType<typeof setTimeout> | null;
  private auto_zero_timeout_ms: number;
  private last_access: number;
  private on_zero_callback: ZeroCallback | null;

  private constructor(
    data: Uint8Array,
    auto_zero_timeout_ms: number = DEFAULT_AUTO_ZERO_TIMEOUT_MS,
  ) {
    this.buffer = new Uint8Array(data.length);
    this.buffer.set(data);
    this.is_zeroed = false;
    this.auto_zero_timeout_ms = auto_zero_timeout_ms;
    this.last_access = Date.now();
    this.on_zero_callback = null;
    this.auto_zero_timer = null;

    if (auto_zero_timeout_ms > 0) {
      this.start_auto_zero_timer();
    }
  }

  static from_uint8_array(
    data: Uint8Array,
    auto_zero_timeout_ms?: number,
  ): SecureBuffer {
    const buffer = new SecureBuffer(data, auto_zero_timeout_ms);

    crypto.getRandomValues(data);
    data.fill(0);

    return buffer;
  }

  static from_string(str: string, auto_zero_timeout_ms?: number): SecureBuffer {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const buffer = new SecureBuffer(data, auto_zero_timeout_ms);

    crypto.getRandomValues(data);
    data.fill(0);

    return buffer;
  }

  static empty(): SecureBuffer {
    return new SecureBuffer(new Uint8Array(0), 0);
  }

  private start_auto_zero_timer(): void {
    this.stop_auto_zero_timer();
    if (this.auto_zero_timeout_ms <= 0 || this.is_zeroed) {
      return;
    }
    this.auto_zero_timer = setTimeout(() => {
      this.zero();
    }, this.auto_zero_timeout_ms);
  }

  private stop_auto_zero_timer(): void {
    if (this.auto_zero_timer !== null) {
      clearTimeout(this.auto_zero_timer);
      this.auto_zero_timer = null;
    }
  }

  private reset_auto_zero_timer(): void {
    this.last_access = Date.now();
    if (this.auto_zero_timeout_ms > 0 && !this.is_zeroed) {
      this.start_auto_zero_timer();
    }
  }

  zero(): void {
    if (this.is_zeroed) {
      return;
    }

    this.stop_auto_zero_timer();

    if (this.buffer.length > 0) {
      crypto.getRandomValues(this.buffer);
      this.buffer.fill(0);
      crypto.getRandomValues(this.buffer);
      this.buffer.fill(0);
    }

    this.is_zeroed = true;

    if (this.on_zero_callback) {
      this.on_zero_callback();
    }
  }

  get_bytes(): Uint8Array | null {
    if (this.is_zeroed) {
      return null;
    }
    this.reset_auto_zero_timer();
    const copy = new Uint8Array(this.buffer.length);

    copy.set(this.buffer);

    return copy;
  }

  get_bytes_view(): Uint8Array | null {
    if (this.is_zeroed) {
      return null;
    }
    this.reset_auto_zero_timer();

    return this.buffer;
  }

  to_string(): string | null {
    if (this.is_zeroed) {
      return null;
    }
    this.reset_auto_zero_timer();
    const decoder = new TextDecoder();

    return decoder.decode(this.buffer);
  }

  get_length(): number {
    return this.is_zeroed ? 0 : this.buffer.length;
  }

  is_cleared(): boolean {
    return this.is_zeroed;
  }

  get_last_access(): number {
    return this.last_access;
  }

  set_auto_zero_timeout(timeout_ms: number): void {
    this.auto_zero_timeout_ms = timeout_ms;
    if (timeout_ms > 0 && !this.is_zeroed) {
      this.reset_auto_zero_timer();
    } else {
      this.stop_auto_zero_timer();
    }
  }

  on_zero(callback: ZeroCallback): void {
    this.on_zero_callback = callback;
  }

  extend_timeout(): void {
    if (!this.is_zeroed) {
      this.reset_auto_zero_timer();
    }
  }

  clone(auto_zero_timeout_ms?: number): SecureBuffer | null {
    if (this.is_zeroed) {
      return null;
    }
    this.reset_auto_zero_timer();
    const copy = new Uint8Array(this.buffer.length);

    copy.set(this.buffer);

    return new SecureBuffer(
      copy,
      auto_zero_timeout_ms ?? this.auto_zero_timeout_ms,
    );
  }
}

function zero_uint8_array(arr: Uint8Array): void {
  if (arr.length === 0) {
    return;
  }
  crypto.getRandomValues(arr);
  arr.fill(0);
  crypto.getRandomValues(arr);
  arr.fill(0);
}

function constant_time_compare(a: Uint8Array, b: Uint8Array): boolean {
  const max_len = Math.max(a.length, b.length);
  const padded_a = new Uint8Array(max_len);
  const padded_b = new Uint8Array(max_len);

  padded_a.set(a);
  padded_b.set(b);

  let result = a.length ^ b.length;

  for (let i = 0; i < max_len; i++) {
    result |= padded_a[i] ^ padded_b[i];
  }

  return result === 0;
}

export {
  SecureBuffer,
  zero_uint8_array,
  constant_time_compare,
  DEFAULT_AUTO_ZERO_TIMEOUT_MS,
};

export type { ZeroCallback };
