#!/usr/bin/env node
'use strict';
// ai-clone-shield 자체검증 (의존성 0). 임시 프로젝트에 핵심 회귀를 돌린다.
//   npm run selftest   또는   node verify/self-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const html = require('../core/html');
const util = require('../core/util');
const { loadConfig, writeConfig, defaultConfig } = require('../core/config');
const { runApply } = require('../core/apply');
const { verifyBuild } = require('../core/verify-static');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.error('  ✗ ' + name + '\n      ' + e.message); fail++; }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aishield-selftest-'));
const dist = path.join(root, 'dist');

function setup() {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.rmSync(path.join(root, '.aishield-backup'), { recursive: true, force: true });
  fs.rmSync(path.join(root, '.aishield'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'),
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>T</title></head>' +
    '<body><h1>안녕 🙂</h1><p>본문 텍스트</p>' +
    '<script src="/assets/app.js"></script></body></html>');
  fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'const mul=(a,b)=>a*b+42;console.log(mul(2,3));');
  const cfg = defaultConfig();
  // owner.name 에 일부러 XSS 페이로드를 넣어 이스케이프 검증
  cfg.owner = { name: 'Evil</script><img src=x>', domain: 'ex.com', contact: 'a@b.c', year: 2026 };
  cfg.buildDir = 'dist';
  writeConfig(root, cfg);
}

(async () => {
  console.log('ai-clone-shield self-test\n');

  check('ZWC 워터마크 라운드트립(한글/이모지 포함)', () => {
    const payload = html.encodeZW('AISHLD:abc123');
    const r = html.injectZeroWidth('<p>한글 🙂 text</p>', payload, 4);
    const dec = html.decodeAllZW(r.html);
    assert(dec.includes('AISHLD:abc123'), 'decode 불일치');
    assert(r.spots > 0, 'spots 0');
  });

  check('escapeForScript 가 </script> 와 < 를 차단', () => {
    const e = html.escapeForScript('x</script><img onerror=alert(1)>');
    assert(e.indexOf('<') === -1, '< 가 남음');
    assert(e.indexOf('</script>') === -1, '</script> 가 남음');
  });

  check('restore 가 경계 밖 경로(../) 를 거부', () => {
    setup();
    const bdir = path.join(root, '.aishield-backup', 'evil');
    fs.mkdirSync(bdir, { recursive: true });
    const outside = path.join(os.tmpdir(), 'aishield-evil-' + process.pid + '.txt');
    fs.writeFileSync(outside, 'SAFE');
    const traversal = path.relative(root, outside); // ../.. 로 시작
    fs.writeFileSync(path.join(bdir, '_manifest.json'),
      JSON.stringify({ files: [], createdFiles: [traversal] }));
    const r = util.restoreBackup(root, bdir);
    assert(fs.existsSync(outside), '경계 밖 파일이 삭제됨(트래버설 취약!)');
    assert(r.skipped > 0, 'skipped 가 0 (경계검사 미작동)');
    fs.unlinkSync(outside);
  });

  setup();
  await runApply(root, loadConfig(root), {});
  const idx = () => fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

  check('apply 후 워터마크/고지 주입됨', () => {
    const s = idx();
    assert(s.includes('ai-clone-shield:wm'), 'wm 마커 없음');
    assert(s.includes('window.__AISHIELD__'), '__AISHIELD__ 없음');
    assert(s.includes('data-aishield-notice'), '고지 노드 없음');
  });

  check('owner XSS 페이로드가 이스케이프되어 script 조기종료 없음', () => {
    const s = idx();
    const after = s.split('window.__AISHIELD__')[1] || '';
    const head = after.slice(0, after.indexOf('</script>') >= 0 ? after.indexOf('</script>') : after.length);
    assert(head.indexOf('<img') === -1, 'raw <img 주입됨(XSS)');
  });

  check('verify 통과(기능 무손상, error 0)', () => {
    const v = verifyBuild(root, dist, util);
    const errs = v.issues.filter(i => i.sev === 'error');
    assert(errs.length === 0, 'verify errors: ' + JSON.stringify(errs));
  });

  check('app.js 무손상(ZWC 미오염 + 원본 로직 유지)', () => {
    const js = fs.readFileSync(path.join(dist, 'assets', 'app.js'), 'utf8');
    assert(/a\*b\+42/.test(js), '원본 로직 손상');
    assert(!/[\u200b\u200c\u2060]/.test(js), 'JS 에 ZWC 오염');
  });

  const res2 = await runApply(root, loadConfig(root), {});
  check('멱등 재적용(워터마크 레이어 변경 0)', () => {
    const c = res2.results.find(r => r.id === 'c-watermark');
    assert(c && (c.changed || []).length === 0, '재적용 시 워터마크가 또 박힘');
  });

  const bk = util.latestBackup(root);
  check('restore 로 원복(마커 제거)', () => {
    assert(bk, '백업 없음');
    util.restoreBackup(root, bk);
    assert(!idx().includes('ai-clone-shield'), '복원 후 마커 잔존');
  });

  // M3 회귀: 사용자가 직접 쓴 llms.txt('ai-clone-shield' 단어 포함)는 덮어쓰지 않는다
  setup();
  fs.writeFileSync(path.join(dist, 'llms.txt'), 'My own llms.txt; mentions ai-clone-shield somewhere.\n');
  await runApply(root, loadConfig(root), {});
  check('사용자 llms.txt 보존(생성 마커 없으면 미덮어씀)', () => {
    assert(fs.readFileSync(path.join(dist, 'llms.txt'), 'utf8').includes('My own llms.txt'),
      'M3 회귀: 사용자 llms.txt 가 덮어써짐');
  });

  fs.rmSync(root, { recursive: true, force: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); try { fs.rmSync(root, { recursive: true, force: true }); } catch {} process.exit(1); });
