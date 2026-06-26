'use strict';
// 설정 로드 + 프리셋 → 레이어 활성화 해석
const path = require('path');
const { exists, readJsonSafe, writeText } = require('./util');

// 프리셋이 레이어 기본 on/off를 정한다. 사용자 config.layers로 개별 덮어쓰기 가능.
// 값이 객체면 레이어별 옵션, false면 비활성, true면 기본 옵션으로 활성.
const PRESETS = {
  light: {
    'a-code-hardening': { sourcemap: true, obfuscate: false, cssMangle: false },
    'b-logic-isolation': false,
    'c-watermark': true,
    'd-ai-notice': true,
    'e-legal': true,
    'f-function-guard': true,
    'g-aggressive': false,
  },
  balanced: {
    'a-code-hardening': { sourcemap: true, obfuscate: false, cssMangle: false },
    'b-logic-isolation': true,
    'c-watermark': true,
    'd-ai-notice': true,
    'e-legal': true,
    'f-function-guard': true,
    'g-aggressive': false,
  },
  max: {
    'a-code-hardening': { sourcemap: true, obfuscate: true, cssMangle: true },
    'b-logic-isolation': true,
    'c-watermark': true,
    'd-ai-notice': true,
    'e-legal': true,
    'f-function-guard': true,
    'g-aggressive': true,
  },
};

function defaultConfig() {
  return {
    owner: { name: '', domain: '', contact: '', year: new Date().getFullYear() },
    preset: 'balanced',
    buildDir: null,
    layers: {},
    // g-aggressive(타핏·PoW 등 SEO/법 위험)는 이 플래그가 true여야만 켜진다.
    aggressiveOptIn: false,
  };
}

function resolveLayers(config) {
  const preset = PRESETS[config.preset] || PRESETS.balanced;
  const layers = {};
  for (const id of Object.keys(preset)) {
    const p = preset[id];
    const base = p === false
      ? { enabled: false }
      : { enabled: true, ...(typeof p === 'object' ? p : {}) };
    const override = config.layers ? config.layers[id] : undefined;
    if (override === false) {
      layers[id] = { ...base, enabled: false };
    } else if (override && typeof override === 'object') {
      layers[id] = { ...base, ...override };
    } else if (override === true) {
      layers[id] = { ...base, enabled: true };
    } else {
      layers[id] = base;
    }
  }
  // 안전장치: 공격적 레이어는 명시 옵트인 없이는 강제 OFF
  if (!config.aggressiveOptIn && layers['g-aggressive']) {
    layers['g-aggressive'].enabled = false;
  }
  return layers;
}

function isValidPreset(name) {
  return Object.prototype.hasOwnProperty.call(PRESETS, name);
}

function loadConfig(root) {
  const p = path.join(root, 'aishield.config.json');
  const fileExists = exists(p);
  const user = fileExists ? readJsonSafe(p) : null;
  const base = defaultConfig();
  const cfg = { ...base, ...(user || {}) };
  cfg.owner = { ...base.owner, ...((user && user.owner) || {}) };
  cfg.layers = (user && user.layers) || {};
  cfg._exists = Boolean(user);
  cfg._parseError = fileExists && user === null; // 파일은 있는데 JSON 파싱 실패(조용히 기본값으로 가지 않도록)
  cfg._path = p;
  return cfg;
}

function writeConfig(root, cfg) {
  const p = path.join(root, 'aishield.config.json');
  const clean = { ...cfg };
  delete clean._exists;
  delete clean._path;
  writeText(p, JSON.stringify(clean, null, 2) + '\n');
  return p;
}

module.exports = { PRESETS, defaultConfig, resolveLayers, loadConfig, writeConfig, isValidPreset };
