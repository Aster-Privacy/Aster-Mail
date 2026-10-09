(function () {
  if (!window.__TAURI_INTERNALS__) return;
  var ua = navigator.userAgent || "";
  if (!/Macintosh|Mac OS/i.test(ua)) return;
  var s = crypto.subtle;
  var origImport = s.importKey.bind(s);
  var origGenerate = s.generateKey.bind(s);
  var origDeriveBits = s.deriveBits.bind(s);
  var origEncrypt = s.encrypt.bind(s);
  var origDecrypt = s.decrypt.bind(s);
  var origSign = s.sign.bind(s);
  var origVerify = s.verify.bind(s);
  var origDigest = s.digest.bind(s);
  var keyStore = new WeakMap();
  function algName(a) {
    return (typeof a === "string" ? a : (a && a.name) || "").toUpperCase();
  }
  function isKdf(a) {
    var n = algName(a);
    return n === "PBKDF2" || n === "HKDF";
  }
  function isSymmetric(a) {
    var n = algName(a);
    return (
      n === "AES-GCM" ||
      n === "AES-CBC" ||
      n === "AES-CTR" ||
      n === "AES-KW" ||
      n === "HMAC" ||
      isKdf(a)
    );
  }
  function invoke(cmd, args) {
    return window.__TAURI_INTERNALS__.invoke(cmd, args);
  }
  function toArr(d) {
    if (d instanceof ArrayBuffer) return Array.from(new Uint8Array(d));
    if (ArrayBuffer.isView(d))
      return Array.from(new Uint8Array(d.buffer, d.byteOffset, d.byteLength));
    if (Array.isArray(d)) return d;
    if (typeof d === "string") return Array.from(new TextEncoder().encode(d));
    return [];
  }
  function hashName(h) {
    return typeof h === "string" ? h : (h && h.name) || "SHA-256";
  }
  function gcmAad(algorithm) {
    return algorithm.additionalData === undefined
      ? null
      : toArr(algorithm.additionalData);
  }
  function gcmTagOk(algorithm) {
    return algorithm.tagLength === undefined || algorithm.tagLength === 128;
  }
  function denied(message) {
    return Promise.reject(new DOMException(message, "InvalidAccessError"));
  }
  function frozenAlgorithm(alg) {
    var src = typeof alg === "string" ? { name: alg } : alg || {};
    var out = { name: src.name };
    if (src.length !== undefined) out.length = src.length;
    if (src.hash !== undefined)
      out.hash = Object.freeze({ name: hashName(src.hash) });
    return Object.freeze(out);
  }
  function fakeKey(alg, ext, usages, raw) {
    var k = Object.freeze({
      type: "secret",
      algorithm: frozenAlgorithm(alg),
      extractable: ext === true,
      usages: Object.freeze(Array.prototype.slice.call(usages || [])),
    });
    keyStore.set(k, raw);
    return k;
  }
  function getRaw(key) {
    return key ? keyStore.get(key) : null;
  }
  function allows(key, usage, algorithm) {
    if (key.usages.indexOf(usage) === -1) return false;
    return algName(key.algorithm) === algName(algorithm);
  }
  function sameBytes(a, b) {
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  }
  function effectiveExtractable(algorithm, requested) {
    if (isKdf(algorithm)) return false;
    return requested === true;
  }
  s.importKey = function (format, keyData, algorithm, extractable, keyUsages) {
    if (format === "raw" && isSymmetric(algorithm)) {
      return Promise.resolve(
        fakeKey(
          algorithm,
          effectiveExtractable(algorithm, extractable),
          keyUsages,
          toArr(keyData),
        ),
      );
    }
    return origImport(format, keyData, algorithm, extractable, keyUsages);
  };
  s.generateKey = function (algorithm, extractable, keyUsages) {
    if (isSymmetric(algorithm)) {
      var len = algorithm.length || 256;
      var raw = new Uint8Array(len / 8);
      crypto.getRandomValues(raw);
      return Promise.resolve(
        fakeKey(
          algorithm,
          effectiveExtractable(algorithm, extractable),
          keyUsages,
          toArr(raw),
        ),
      );
    }
    return origGenerate(algorithm, extractable, keyUsages);
  };
  var origExport = s.exportKey.bind(s);
  s.exportKey = function (format, key) {
    var raw = getRaw(key);
    if (raw && format === "raw") {
      if (key.extractable !== true) return denied("key is not extractable");
      return Promise.resolve(new Uint8Array(raw).buffer);
    }
    return origExport(format, key);
  };
  function deriveRawBits(algorithm, raw, length) {
    var n = algName(algorithm);
    if (n === "PBKDF2") {
      return invoke("crypto_pbkdf2", {
        password: raw,
        salt: toArr(algorithm.salt),
        iterations: algorithm.iterations,
        hash: hashName(algorithm.hash),
        bits: length,
      }).then(function (r) {
        return new Uint8Array(r).buffer;
      });
    }
    if (n === "HKDF") {
      return invoke("crypto_hkdf", {
        keyMaterial: raw,
        salt: toArr(algorithm.salt),
        info: toArr(algorithm.info),
        hash: hashName(algorithm.hash),
        bits: length,
      }).then(function (r) {
        return new Uint8Array(r).buffer;
      });
    }
    return denied("key does not allow derivation");
  }
  s.deriveBits = function (algorithm, baseKey, length) {
    var raw = getRaw(baseKey);
    if (raw) {
      if (!allows(baseKey, "deriveBits", algorithm))
        return denied("key does not allow deriveBits");
      return deriveRawBits(algorithm, raw, length);
    }
    return origDeriveBits(algorithm, baseKey, length);
  };
  s.deriveKey = function (
    algorithm,
    baseKey,
    derivedKeyType,
    extractable,
    keyUsages,
  ) {
    var raw = getRaw(baseKey);
    if (raw) {
      if (!allows(baseKey, "deriveKey", algorithm))
        return denied("key does not allow deriveKey");
      var bits = derivedKeyType.length || 256;
      return deriveRawBits(algorithm, raw, bits).then(function (derived) {
        return s.importKey(
          "raw",
          derived,
          derivedKeyType,
          effectiveExtractable(derivedKeyType, extractable),
          keyUsages,
        );
      });
    }
    return Promise.reject(new Error("deriveKey: unknown base key"));
  };
  s.encrypt = function (algorithm, key, data) {
    var raw = getRaw(key);
    if (raw) {
      if (!allows(key, "encrypt", algorithm) || algName(algorithm) !== "AES-GCM")
        return denied("key does not allow encrypt");
      if (!gcmTagOk(algorithm))
        return denied("unsupported aes-gcm tag length");
      return invoke("crypto_aes_gcm_encrypt", {
        key: raw,
        iv: toArr(algorithm.iv),
        data: toArr(data),
        aad: gcmAad(algorithm),
      }).then(function (r) {
        return new Uint8Array(r).buffer;
      });
    }
    return origEncrypt(algorithm, key, data);
  };
  s.decrypt = function (algorithm, key, data) {
    var raw = getRaw(key);
    if (raw) {
      if (!allows(key, "decrypt", algorithm) || algName(algorithm) !== "AES-GCM")
        return denied("key does not allow decrypt");
      if (!gcmTagOk(algorithm))
        return denied("unsupported aes-gcm tag length");
      return invoke("crypto_aes_gcm_decrypt", {
        key: raw,
        iv: toArr(algorithm.iv),
        data: toArr(data),
        aad: gcmAad(algorithm),
      }).then(function (r) {
        return new Uint8Array(r).buffer;
      });
    }
    return origDecrypt(algorithm, key, data);
  };
  function hmacSign(raw, data) {
    return invoke("crypto_hmac_sign", { key: raw, data: toArr(data) });
  }
  s.sign = function (algorithm, key, data) {
    var raw = getRaw(key);
    if (raw) {
      if (!allows(key, "sign", algorithm) || algName(algorithm) !== "HMAC")
        return denied("key does not allow sign");
      return hmacSign(raw, data).then(function (r) {
        return new Uint8Array(r).buffer;
      });
    }
    return origSign(algorithm, key, data);
  };
  s.verify = function (algorithm, key, signature, data) {
    var raw = getRaw(key);
    if (raw) {
      if (!allows(key, "verify", algorithm) || algName(algorithm) !== "HMAC")
        return denied("key does not allow verify");
      var expected = toArr(signature);
      return hmacSign(raw, data).then(function (r) {
        return sameBytes(Array.from(r), expected);
      });
    }
    return origVerify(algorithm, key, signature, data);
  };
  s.digest = function (algorithm, data) {
    return origDigest(algorithm, data);
  };
})();
(function () {
  if (!window.__TAURI_INTERNALS__) return;
  if (!navigator.plugins || navigator.plugins.length === 0) {
    try { Object.defineProperty(navigator, "plugins", { value: { length: 0 }, configurable: true }); } catch {}
  }
  if (!navigator.mimeTypes || navigator.mimeTypes.length === 0) {
    try { Object.defineProperty(navigator, "mimeTypes", { value: { length: 0 }, configurable: true }); } catch {}
  }
})();
