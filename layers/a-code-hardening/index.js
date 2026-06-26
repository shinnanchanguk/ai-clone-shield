'use strict';
// 레이어 A: 코드 경화
// - 소스맵 제거(기본, ROI 최고): .map 파일 삭제 + sourceMappingURL 주석 제거 → 원본 구조 복원 차단
// - 난독화(옵션, max 프리셋): javascript-obfuscator 설치 시 JS 난독화
//
// 정직한 한계: 난독화는 2025년 LLM 기반 디오퍼스케이터(예: CASCADE)로 상당 부분 우회된다.
// "구조 복제를 늦추는 시간 벌기"이지 근본 방어가 아니다. 소스맵 제거가 더 확실하고 안전하다.
const path = require('path');
const fs = require('fs');

function loadObfuscator(root) {
  const tries = [path.join(root, 'node_modules', 'javascript-obfuscator'), 'javascript-obfuscator'];
  for (const t of tries) { try { return require(t); } catch { /* */ } }
  return null;
}

function obfPreset(level) {
  const base = { compact: true, simplify: true, target: 'browser', debugProtection: false };
  if (level === 'low') {
    return { ...base, identifierNamesGenerator: 'mangled', stringArray: true, stringArrayThreshold: 0.5 };
  }
  if (level === 'high') {
    return {
      ...base, identifierNamesGenerator: 'mangled-shuffled',
      controlFlowFlattening: true, controlFlowFlatteningThreshold: 0.75,
      deadCodeInjection: true, deadCodeInjectionThreshold: 0.3,
      stringArray: true, stringArrayEncoding: ['rc4'], stringArrayThreshold: 1,
      selfDefending: true,
    };
  }
  // medium (기본)
  return {
    ...base, identifierNamesGenerator: 'mangled',
    stringArray: true, stringArrayEncoding: ['base64'], stringArrayThreshold: 0.75,
    controlFlowFlattening: false, deadCodeInjection: false,
  };
}

module.exports = {
  id: 'a-code-hardening',
  name: '코드 경화',
  order: 1,
  effect: '구조 복제: 중 (소스맵 제거는 확실 / 난독화는 LLM 디오퍼로 우회 가능)',

  async apply(ctx) {
    const { root, config, layerConfig, dry, backup, util } = ctx;
    const opts = layerConfig['a-code-hardening'] || {};
    const buildDir = path.join(root, config.buildDir || '.');
    const changed = [];
    const notes = [];

    // 1) 소스맵 제거(기본)
    if (opts.sourcemap !== false) {
      const maps = util.walk(buildDir, { exts: ['.map'] });
      for (const m of maps) {
        if (!dry) { backup && backup.backup(m); fs.unlinkSync(m); }
        changed.push(path.relative(root, m));
      }
      const code = util.walk(buildDir, { exts: ['.js', '.mjs', '.css'] });
      let stripped = 0;
      for (const f of code) {
        const s = util.readTextSafe(f);
        if (s === null) continue;
        const out = s
          .replace(/\n?\/\/[#@]\s*sourceMappingURL=[^\n]*/g, '')
          .replace(/\/\*[#@]\s*sourceMappingURL=[\s\S]*?\*\//g, '');
        if (out !== s) {
          if (!dry) { backup && backup.backup(f); util.writeText(f, out); }
          stripped++;
          changed.push(path.relative(root, f));
        }
      }
      notes.push(util.color.dim(`소스맵 제거: .map ${maps.length}개 삭제 + sourceMappingURL 주석 ${stripped}개 제거`));
    }

    // 2) 난독화(옵션)
    if (opts.obfuscate) {
      const JO = loadObfuscator(root);
      if (!JO) {
        notes.push(util.color.yellow('javascript-obfuscator 미설치 → 난독화 스킵. `npm i -D javascript-obfuscator` 후 재실행.'));
      } else {
        const guardPath = path.join(root, '.aishield', 'obfuscated.json');
        const guard = util.readJsonSafe(guardPath) || { files: [] };
        const seen = new Set(guard.files);
        const level = opts.obfuscateLevel || 'medium';
        const preset = obfPreset(level);
        const code = util.walk(buildDir, { exts: ['.js'] });
        let n = 0;
        for (const f of code) {
          const rel = path.relative(root, f);
          if (seen.has(rel)) continue; // 1회만(재난독화 방지)
          const s = util.readTextSafe(f);
          if (s === null || !s.trim() || util.isLikelyESM(s)) continue; // ESM 모듈은 스킵(import 손상 방지)
          let out;
          try { out = JO.obfuscate(s, preset).getObfuscatedCode(); }
          catch (e) { notes.push(util.color.yellow(`난독화 실패(${rel}): ${e.message}`)); continue; }
          if (!dry) { backup && backup.backup(f); util.writeText(f, out); guard.files.push(rel); }
          n++;
          changed.push(rel);
        }
        if (!dry && n) util.writeText(guardPath, JSON.stringify(guard, null, 2) + '\n');
        notes.push(util.color.dim(`난독화: JS ${n}개 (${level})`));
        notes.push(util.color.yellow('정직: 난독화는 2025 LLM 디오퍼스케이터로 상당 부분 우회됩니다. 시간 벌기입니다.'));
      }
    }

    if (!changed.length && !notes.length) notes.push(util.color.dim('제거할 소스맵/주석 없음.'));
    return { changed, notes };
  },
};
