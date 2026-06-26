'use strict';
// 공통 유틸 (의존성 0 — Node 내장 모듈만)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const color = {
  dim: s => wrap('2', s),
  bold: s => wrap('1', s),
  red: s => wrap('31', s),
  green: s => wrap('32', s),
  yellow: s => wrap('33', s),
  blue: s => wrap('34', s),
  magenta: s => wrap('35', s),
  cyan: s => wrap('36', s),
};

const log = {
  info: (...a) => console.log(color.cyan('ℹ'), ...a),
  ok: (...a) => console.log(color.green('✓'), ...a),
  warn: (...a) => console.log(color.yellow('⚠'), ...a),
  err: (...a) => console.error(color.red('✗'), ...a),
  step: (...a) => console.log(color.blue('▸'), ...a),
  plain: (...a) => console.log(...a),
  title: s => console.log('\n' + color.bold(s)),
};

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }
function readText(p) { return fs.readFileSync(p, 'utf8'); }
function readTextSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function writeText(p, s) { ensureDir(path.dirname(p)); fs.writeFileSync(p, s); }
function readJsonSafe(p) { try { return JSON.parse(readText(p)); } catch { return null; } }
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

// top-level static import/export 가 있으면 ESM 으로 본다(동적 import() 는 제외 → 일반 구문검사 가능).
function isLikelyESM(code) {
  return /^[ \t]*import[ \t][^\n]*\bfrom\b/m.test(code)
    || /^[ \t]*import[ \t]*['"]/m.test(code)
    || /^[ \t]*import[ \t]*\{/m.test(code)
    || /^[ \t]*export[ \t]/m.test(code)
    || /^[ \t]*export\{/m.test(code);
}

// p 가 root 경계 안에 있는지(경로 트래버설 방지)
function withinRoot(root, rel) {
  if (path.isAbsolute(rel)) return false;
  const rootAbs = path.resolve(root);
  const resolved = path.resolve(rootAbs, rel);
  return resolved === rootAbs || resolved.startsWith(rootAbs + path.sep);
}

const DEFAULT_IGNORE = new Set(['node_modules', '.git', '.aishield-backup', 'cache']);

// 재귀 파일 워크. exts 지정 시 해당 확장자만.
function walk(dir, { exts = null, ignore = DEFAULT_IGNORE, maxFiles = 200000 } = {}) {
  const out = [];
  (function rec(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= maxFiles) return;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (ignore.has(e.name)) continue;
        rec(full);
      } else if (e.isFile()) {
        if (exts) {
          const ext = path.extname(e.name).toLowerCase();
          if (!exts.includes(ext)) continue;
        }
        out.push(full);
      }
    }
  })(dir);
  return out;
}

// 변경 전 원본을 보존하는 백업 세션.
// - 파일 수정 직전 backup(file) 호출 → 원본 보존(restore 시 되돌림)
// - 신규 생성 파일은 markCreated(file) 호출 → restore 시 제거(원래 없던 파일 정리)
function createBackup(root) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(root, '.aishield-backup', ts);
  const manifest = [];
  const createdFiles = [];
  const seen = new Set();
  return {
    dir,
    backup(file) {
      if (!exists(file)) return;
      const rel = path.relative(root, file);
      if (seen.has(rel)) return; // 같은 파일 첫 변경분만 백업(멱등)
      seen.add(rel);
      const dest = path.join(dir, rel);
      ensureDir(path.dirname(dest));
      fs.copyFileSync(file, dest);
      manifest.push(rel);
    },
    markCreated(file) {
      const rel = path.relative(root, file);
      if (!createdFiles.includes(rel)) createdFiles.push(rel);
    },
    finalize() {
      if (manifest.length || createdFiles.length) {
        ensureDir(dir);
        writeText(
          path.join(dir, '_manifest.json'),
          JSON.stringify({ at: new Date().toISOString(), files: manifest, createdFiles }, null, 2)
        );
      }
      return { dir, count: manifest.length, created: createdFiles.length };
    },
  };
}
function latestBackup(root) {
  const base = path.join(root, '.aishield-backup');
  if (!exists(base)) return null;
  const dirs = fs.readdirSync(base)
    .filter(d => exists(path.join(base, d, '_manifest.json')))
    .sort();
  return dirs.length ? path.join(base, dirs[dirs.length - 1]) : null;
}
// 삭제 후 비게 된 부모 디렉토리를 root 경계까지만 정리
function cleanupEmptyDirs(dir, rootAbs) {
  let cur = path.resolve(dir);
  while (cur.startsWith(rootAbs + path.sep) && cur !== rootAbs) {
    try {
      if (fs.readdirSync(cur).length === 0) { fs.rmdirSync(cur); cur = path.dirname(cur); }
      else break;
    } catch { break; }
  }
}

function restoreBackup(root, backupDir) {
  const man = readJsonSafe(path.join(backupDir, '_manifest.json'));
  if (!man) return { restored: 0, removed: 0, noManifest: true };
  const rootAbs = path.resolve(root);
  let n = 0, removed = 0, skipped = 0;
  for (const rel of man.files || []) {
    // 경로 트래버설 방어: 매니페스트의 상대경로가 root(및 backupDir) 경계를 벗어나면 건너뜀
    if (!withinRoot(root, rel) || !withinRoot(backupDir, rel)) { skipped++; continue; }
    const src = path.join(backupDir, rel);
    const dest = path.resolve(rootAbs, rel);
    if (exists(src)) { ensureDir(path.dirname(dest)); fs.copyFileSync(src, dest); n++; }
  }
  for (const rel of man.createdFiles || []) {
    if (!withinRoot(root, rel)) { skipped++; continue; }
    const p = path.resolve(rootAbs, rel);
    if (exists(p)) {
      try { fs.unlinkSync(p); removed++; cleanupEmptyDirs(path.dirname(p), rootAbs); } catch { /* ignore */ }
    }
  }
  return { restored: n, removed, skipped };
}

module.exports = {
  color, log, exists, ensureDir, readText, readTextSafe, writeText, readJsonSafe, sha256,
  isLikelyESM, withinRoot, walk, createBackup, latestBackup, restoreBackup, DEFAULT_IGNORE,
};
