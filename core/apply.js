'use strict';
// 레이어 오케스트레이터: layers/*/index.js 를 동적 로드해 config에 따라 순서대로 실행.
// 새 레이어는 layers/<id>/index.js 를 추가하면 자동 등록(플러그인 구조).
const fs = require('fs');
const path = require('path');
const util = require('./util');
const { log, color, exists, createBackup } = util;
const { resolveLayers } = require('./config');

function loadLayerModules() {
  const dir = path.join(__dirname, '..', 'layers');
  const mods = [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch { /* layers 없음 */ }
  for (const name of names) {
    const idx = path.join(dir, name, 'index.js');
    if (!exists(idx)) continue;
    try {
      const m = require(idx);
      if (m && m.id) mods.push(m);
    } catch (e) {
      log.err(`레이어 로드 실패 [${name}]: ${e.message}`);
    }
  }
  mods.sort((a, b) => (a.order || 0) - (b.order || 0));
  return mods;
}

async function runApply(root, config, { dry = false } = {}) {
  const layers = resolveLayers(config);
  const mods = loadLayerModules();
  const enabled = mods.filter(m => layers[m.id] && layers[m.id].enabled);

  if (!enabled.length) {
    log.warn('적용할 레이어가 없습니다 (구현·활성화된 레이어 0개).');
    return { results: [] };
  }

  const backup = dry ? null : createBackup(root);
  const { detectStack } = require('./detect');
  const ctx = {
    root,
    config,
    layerConfig: layers,
    dry,
    backup,
    util,
    detect: detectStack(root),
  };

  const results = [];
  let funcErrors = 0;
  let layerErrors = 0;
  for (const m of enabled) {
    log.title(`${m.order}. ${m.name}  ${color.dim('[' + m.id + ']')}`);
    if (m.effect) log.plain('  ' + color.dim('효과: ' + m.effect));
    try {
      const r = (await m.apply(ctx)) || {};
      results.push({ id: m.id, name: m.name, ...r });
      for (const note of r.notes || []) log.plain('  ' + note);
      const changedN = (r.changed || []).length;
      log.ok(`  변경 ${changedN}개${dry ? color.yellow(' (dry-run, 미적용)') : ''}`);
      if (r.verify && r.verify.errors) funcErrors += r.verify.errors;
    } catch (e) {
      log.err(`  실패: ${e.message}`);
      results.push({ id: m.id, name: m.name, error: e.message });
      layerErrors++;
    }
  }

  if (backup) {
    const b = backup.finalize();
    if (b.count) {
      log.info(`백업 ${b.count}개 → ${color.dim(path.relative(root, b.dir))}  ${color.dim('(복원: aishield restore)')}`);
    }
  }
  return { results, funcErrors, layerErrors };
}

module.exports = { runApply, loadLayerModules };
