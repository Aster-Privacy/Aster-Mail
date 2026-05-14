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
  function fakeKey(alg, ext, usages, raw) {
    var algObj = typeof alg === "string" ? { name: alg } : alg;
    var k = { type: "secret", algorithm: algObj, extractable: ext, usages: usages };
    keyStore.set(k, raw);
    return k;
  }
  function getRaw(key) {
    return key ? keyStore.get(key) : null;
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
      if (key && key.extractable === false) {
        return Promise.reject(
          new DOMException("key is not extractable", "InvalidAccessError"),
        );
      }
      return Promise.resolve(new Uint8Array(raw).buffer);
    }
    return origExport(format, key);
  };
  s.deriveBits = function (algorithm, baseKey, length) {
    var raw = getRaw(baseKey);
    if (raw) {
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
      var bits = derivedKeyType.length || 256;
      return s.deriveBits(algorithm, baseKey, bits).then(function (derived) {
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
    if (raw && algName(algorithm) === "AES-GCM") {
      return invoke("crypto_aes_gcm_encrypt", {
        key: raw,
        iv: toArr(algorithm.iv),
        data: toArr(data),
      }).then(function (r) {
        return new Uint8Array(r).buffer;
      });
    }
    return origEncrypt(algorithm, key, data);
  };
  s.decrypt = function (algorithm, key, data) {
    var raw = getRaw(key);
    if (raw && algName(algorithm) === "AES-GCM") {
      return invoke("crypto_aes_gcm_decrypt", {
        key: raw,
        iv: toArr(algorithm.iv),
        data: toArr(data),
      }).then(function (r) {
        return new Uint8Array(r).buffer;
      });
    }
    return origDecrypt(algorithm, key, data);
  };
  s.sign = function (algorithm, key, data) {
    var raw = getRaw(key);
    if (raw) {
      return invoke("crypto_hmac_sign", { key: raw, data: toArr(data) }).then(
        function (r) {
          return new Uint8Array(r).buffer;
        },
      );
    }
    return origSign(algorithm, key, data);
  };
  s.digest = function (algorithm, data) {
    return origDigest(algorithm, data);
  };
})();
