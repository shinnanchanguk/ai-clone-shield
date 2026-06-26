#!/usr/bin/env node
'use strict';
// ai-clone-shield CLI 진입점.
const path = require('path');
const { log, color, latestBackup, restoreBackup } = require('../core/util');
const { detectStack } = require('../core/detect');
const { loadConfig, writeConfig, defaultConfig, isValidPreset } = require('../core/config');
const { runApply } = require('../core/apply');

const root = process.cwd();
const [, , cmd, ...args] = process.argv;
const flag = n => args.includes('--' + n);
const opt = (n, d) => {
  const i = args.indexOf('--' + n);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};

function printStack() {
  const s = detectStack(root);
  log.title('스택 감지');
  log.plain(`  프레임워크 : ${color.bold(s.framework)} ${color.dim('(' + s.stack + ')')}`);
  log.plain(`  빌드 산출물: ${s.buildDir ? color.bold(s.buildDir) : color.yellow('미발견 (먼저 빌드 후 다시 감지)')}`);
  log.plain(`  서버 존재  : ${s.hasServer ? color.green('예') + ' — 로직 격리(레이어 B)가 강하게 적용됨' : '아니오 — 후처리 위주'}`);
  if (!s.nativeIsolation) {
    log.plain('  ' + color.yellow('주의: 이 스택은 로직 격리(가장 강한 방어)가 제한적입니다. 후처리 레이어 위주로 적용됩니다.'));
  }
  return s;
}

function printHelp() {
  log.title('ai-clone-shield  ' + color.dim('— 공개 배포 코드 복제 방지 스킬팩'));
  log.plain(`
  ${color.bold('aishield detect')}     프로젝트 스택·빌드 산출물 감지
  ${color.bold('aishield init')}       설정 파일 생성 (owner 정보 입력)
  ${color.bold('aishield apply')}      보호 레이어 적용
                     ${color.dim('--dry  미리보기(미적용)   --preset light|balanced|max')}
  ${color.bold('aishield verify')}     적용 후 기능 무손상 검증 ${color.dim('(--url <URL> 시 실제 렌더 검사)')}
  ${color.bold('aishield watermark-check')} <파일> ${color.dim('의심 사이트에서 내 워터마크 추출·대조 (--url <URL>)')}
  ${color.bold('aishield evidence-pack')}  ${color.dim('복제 분쟁용 증거 번들 생성(워터마크·해시·git·DMCA 초안)')}
  ${color.bold('aishield restore')}    마지막 백업으로 복원 ${color.dim('(--from <백업경로>)')}
  ${color.bold('aishield help')}       도움말

  ${color.yellow('정직한 한 줄:')} 복제를 ${color.bold('불가능하게')} 만들지 않습니다.
  복제 비용을 높이고, 그대로 베끼면 워터마크로 추적되게 하고, 법적 증거를 남깁니다.
  보증이 아니라 억지력과 기록입니다.
`);
}

async function main() {
  switch (cmd) {
    case 'detect':
      printStack();
      break;

    case 'init': {
      const cfg = loadConfig(root);
      if (cfg._exists && !flag('force')) {
        log.warn('aishield.config.json 이미 존재. 덮어쓰려면 --force');
        break;
      }
      const base = defaultConfig();
      if (opt('preset')) {
        if (!isValidPreset(opt('preset'))) { log.err(`알 수 없는 preset: ${opt('preset')} (light|balanced|max)`); process.exitCode = 1; break; }
        base.preset = opt('preset');
      }
      const s = detectStack(root);
      base.buildDir = s.buildDir || null;
      const p = writeConfig(root, base);
      log.ok(`설정 생성: ${color.bold(path.relative(root, p) || 'aishield.config.json')}`);
      log.plain('  ' + color.yellow('owner.name / domain / contact 를 채워주세요 (워터마크·법적 고지에 박힙니다).'));
      log.plain('  ' + color.dim('preset: light | balanced | max  (기본 balanced)'));
      break;
    }

    case 'apply': {
      const cfg = loadConfig(root);
      if (cfg._parseError) {
        log.err('aishield.config.json 파싱 실패(잘못된 JSON). 고치거나 삭제 후 다시 시도하세요. 기본값으로 조용히 진행하지 않습니다.');
        process.exitCode = 1;
        break;
      }
      if (!cfg._exists) {
        log.warn('aishield.config.json 없음 → 기본값(balanced)으로 진행. `aishield init` 권장.');
      }
      if (opt('preset')) {
        if (!isValidPreset(opt('preset'))) { log.err(`알 수 없는 preset: ${opt('preset')} (light|balanced|max)`); process.exitCode = 1; break; }
        cfg.preset = opt('preset');
      }
      if (!isValidPreset(cfg.preset)) {
        log.warn(`config의 preset "${cfg.preset}" 가 유효하지 않아 balanced 로 진행합니다.`);
        cfg.preset = 'balanced';
      }
      if (!cfg.buildDir) {
        const s = detectStack(root);
        cfg.buildDir = s.buildDir;
      }
      if (!cfg.buildDir) {
        log.err('빌드 산출물 디렉토리를 찾지 못했습니다. 먼저 프로젝트를 빌드하거나 aishield.config.json 의 buildDir 를 지정하세요.');
        process.exitCode = 1;
        break;
      }
      if (cfg.buildDir === '.') {
        log.warn('buildDir 이 프로젝트 루트(.)입니다. 산출물과 소스가 같은 위치면 소스가 변형될 수 있어요(특히 난독화). 별도 산출물 디렉토리를 권장합니다.');
      }
      if (!cfg.owner.name) {
        log.warn('owner.name 이 비어있어 워터마크·고지의 식별자가 약합니다. aishield.config.json 을 채우길 권장.');
      }
      log.title(`보호 적용  ${color.dim('preset=' + cfg.preset + ' · buildDir=' + cfg.buildDir)}${flag('dry') ? color.yellow('  (dry-run)') : ''}`);
      const res = await runApply(root, cfg, { dry: flag('dry') });
      if (res.layerErrors) { log.err(`레이어 실패 ${res.layerErrors}건.`); process.exitCode = 1; }
      if (res.funcErrors) { log.err(`기능 손상 ${res.funcErrors}건 감지 — aishield restore 로 되돌리고 원인을 확인하세요.`); process.exitCode = 1; }
      break;
    }

    case 'verify': {
      const { verifyBuild, browserCheck, browserEngine } = require('../core/verify-static');
      const util = require('../core/util');
      const cfg = loadConfig(root);
      let bd = cfg.buildDir || detectStack(root).buildDir;
      if (!bd) { log.err('빌드 산출물 디렉토리를 찾지 못했습니다. 먼저 빌드하세요.'); process.exitCode = 1; break; }
      const buildDir = path.join(root, bd);
      log.title(`기능 무손상 검증  ${color.dim('buildDir=' + bd)}`);
      const r = verifyBuild(root, buildDir, util);
      log.plain(`  HTML ${r.checkedHtml}개 · JS ${r.checkedJs}개 검사`);
      const errs = r.issues.filter(i => i.sev === 'error');
      const warns = r.issues.filter(i => i.sev === 'warn');
      for (const i of errs) log.err(`  ${i.file}: ${i.msg}`);
      for (const i of warns) log.warn(`  ${i.file}: ${i.msg}`);

      const url = opt('url');
      if (url) {
        const b = await browserCheck(url);
        if (!b.available) {
          log.warn('  브라우저 미설치(puppeteer/playwright) → 실제 렌더 검사 생략. `npm i -D puppeteer` 후 재시도.');
        } else if (b.loadError) {
          log.err(`  브라우저 로드 실패(${b.engine}): ${b.loadError}`);
          errs.push({ sev: 'error', file: url, msg: 'browser load error' });
        } else {
          if (b.errors.length) { for (const e of b.errors) log.err(`  [console] ${e}`); }
          log.plain(`  ${color.dim('브라우저(' + b.engine + ') 렌더: 콘솔 에러 ' + b.errors.length + '건')}`);
          if (b.errors.length) errs.push({ sev: 'error', file: url, msg: 'console error' });
        }
      } else if (browserEngine()) {
        log.plain('  ' + color.dim('브라우저 설치됨 — 실제 렌더까지 보려면: aishield verify --url <URL>'));
      }

      if (errs.length) {
        log.err(`검증 실패: error ${errs.length}건. aishield restore 로 되돌릴 수 있습니다.`);
        process.exitCode = 1;
      } else {
        log.ok(`정적 검증 통과${warns.length ? color.dim(` (주의 ${warns.length}건)`) : ''}.`);
      }
      break;
    }

    case 'evidence-pack': {
      const util = require('../core/util');
      const { execFileSync } = require('child_process');
      const htmlMod = require('../core/html');
      const cfg = loadConfig(root);
      const wm = util.readJsonSafe(path.join(root, '.aishield', 'watermarks.json'));
      const integ = util.readJsonSafe(path.join(root, '.aishield', 'integrity.json'));
      if (!wm && !integ) { log.err('증거 자료가 없습니다(.aishield/). 먼저 aishield apply 를 실행하세요.'); process.exitCode = 1; break; }

      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const outDir = path.join(root, `aishield-evidence-${ts}`);
      util.ensureDir(outDir);
      if (wm) util.writeText(path.join(outDir, 'watermarks.json'), JSON.stringify(wm, null, 2));
      if (integ) util.writeText(path.join(outDir, 'integrity.json'), JSON.stringify(integ, null, 2));

      let gitInfo = '(git 저장소가 아니거나 git 미설치)';
      try {
        const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        const lg = execFileSync('git', ['log', '-10', '--pretty=format:%h %ad %s', '--date=iso'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        gitInfo = `HEAD: ${head}\n\n${lg}`;
      } catch { /* not a git repo */ }
      util.writeText(path.join(outDir, 'git.txt'), gitInfo);

      // 산출물 단일 지문(integrity 해시들을 정렬·결합해 sha256)
      let fp = null;
      if (integ && integ.files) {
        const joined = Object.keys(integ.files).sort().map(k => k + ':' + integ.files[k]).join('\n');
        fp = util.sha256(joined);
      }
      const lastId = wm && wm.watermarks && wm.watermarks.length ? wm.watermarks[wm.watermarks.length - 1].id : '';
      const manifest = {
        generatedAt: new Date().toISOString(),
        owner: cfg.owner,
        watermarkIds: (wm && wm.watermarks || []).map(w => w.id),
        bundleFingerprintSha256: fp,
        fileCount: integ && integ.files ? Object.keys(integ.files).length : 0,
      };
      const manPath = path.join(outDir, 'MANIFEST.json');
      util.writeText(manPath, JSON.stringify(manifest, null, 2));

      let otsNote;
      try {
        execFileSync('ots', ['stamp', manPath], { stdio: 'ignore' });
        otsNote = require('fs').existsSync(manPath + '.ots')
          ? 'OpenTimestamps: MANIFEST.json.ots 생성(비트코인 블록체인 시점증명). 검증: ots verify MANIFEST.json.ots'
          : 'OpenTimestamps 호출됐으나 .ots 미생성 → ISO 타임스탬프·git 시각이 증거.';
      } catch {
        otsNote = 'OpenTimestamps(ots) 미설치 → 블록체인 시점증명 생략. `pip install opentimestamps-client` 후 `ots stamp MANIFEST.json` 권장. 현재는 MANIFEST의 ISO 타임스탬프 + git 시각이 증거.';
      }

      const dmca = htmlMod.fill(util.readText(path.join(__dirname, '..', 'templates', 'dmca-notice.md')), {
        owner: cfg.owner.name || '', domain: cfg.owner.domain || '', contact: cfg.owner.contact || '',
        date: new Date().toISOString().slice(0, 10), id: lastId,
      });
      util.writeText(path.join(outDir, 'dmca-notice.md'), dmca);

      util.writeText(path.join(outDir, 'README.md'), [
        '# 복제 분쟁 증거팩',
        '', `생성: ${manifest.generatedAt}`, `소유자: ${cfg.owner.name || '(미입력)'} (${cfg.owner.domain || '-'})`,
        `워터마크 ID: ${manifest.watermarkIds.join(', ') || '(없음)'}`,
        `산출물 지문(sha256): ${fp || '(없음)'}`,
        '',
        '## 포함 파일',
        '- `watermarks.json` 내 워터마크 레지스트리(어떤 ID를 언제 박았는지)',
        '- `integrity.json` 배포 산출물 파일별 sha256(원본 상태 증명)',
        '- `MANIFEST.json` 위 정보 요약 + 단일 지문 (+ `.ots` 있으면 블록체인 시점증명)',
        '- `git.txt` 저작 이력(커밋 해시·시각)',
        '- `dmca-notice.md` DMCA 통지서 초안(침해 URL만 채우면 됨)',
        '',
        '## 복제 의심본 대조',
        '```', 'aishield watermark-check --url <의심-URL>', '```',
        '발견 ID가 위 워터마크 ID와 일치하면, 그 페이지는 내 원본에서 그대로 복제된 것입니다.',
        '',
        '## 정직한 고지',
        '이 팩은 소송의 보조 증거입니다. 미국은 저작권청 등록, EU는 TDM opt-out 등 관할권별 절차가 별도이며, 법률 자문을 대체하지 않습니다.',
        '',
      ].join('\n'));

      log.title('증거팩 생성 완료');
      log.ok(`  ${path.relative(root, outDir)}/`);
      log.plain(`  포함: watermarks.json · integrity.json · git.txt · MANIFEST.json · dmca-notice.md · README.md`);
      log.plain('  ' + color.dim(otsNote));
      log.plain('  ' + color.yellow('정직: 소송의 보조 자료입니다(관할권별 절차 별도, 법률 자문 아님).'));
      break;
    }

    case 'watermark-check': {
      const htmlMod = require('../core/html');
      const util = require('../core/util');
      const target = args.find(a => !a.startsWith('--'));
      let src = null;
      let label = target;
      if (opt('url')) {
        if (typeof fetch !== 'function') { log.err('이 Node 버전에는 fetch가 없습니다(>=18 필요). 파일 경로로 검사하세요.'); process.exitCode = 1; break; }
        const u = opt('url');
        if (!/^https?:\/\//i.test(u)) { log.err('http(s) URL만 지원합니다.'); process.exitCode = 1; break; }
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        try { const res = await fetch(u, { signal: ctrl.signal, redirect: 'follow' }); src = await res.text(); label = u; }
        catch (e) { log.err(`URL 가져오기 실패: ${e.message}`); process.exitCode = 1; break; }
        finally { clearTimeout(timer); }
      } else if (target && util.exists(target)) {
        src = util.readTextSafe(target);
        if (src === null) { log.err(`파일을 읽을 수 없습니다: ${target}`); process.exitCode = 1; break; }
      } else {
        log.err('사용법: aishield watermark-check <파일경로>   또는   aishield watermark-check --url <URL>');
        process.exitCode = 1;
        break;
      }

      const zw = htmlMod.decodeAllZW(src).filter(s => s.indexOf('AISHLD:') === 0).map(s => s.slice(7));
      const metaIds = [...src.matchAll(/ai-clone-shield:wm[\s\S]*?id=([0-9a-f]{6,})/g)].map(m => m[1]);
      const jsMatch = src.match(/__AISHIELD__[\s\S]*?"id"\s*:\s*"([0-9a-f]{6,})"/);
      const jsId = jsMatch ? jsMatch[1] : null;
      const ids = [...new Set([...zw, ...metaIds, jsId].filter(Boolean))];

      log.title(`워터마크 검사  ${color.dim(label)}`);
      if (!ids.length) {
        log.warn('워터마크를 찾지 못했습니다 (보호 안 된 페이지이거나, 재작성된 복제본일 수 있음).');
        break;
      }
      log.plain(`  발견 ID: ${color.bold(ids.join(', '))}`);
      log.plain(`  비가시 ZWC: ${zw.length ? color.green('있음 (' + zw.length + '곳)') : color.dim('없음')}  ·  가시 메타: ${(metaIds.length || jsId) ? color.green('있음') : color.dim('없음')}`);

      const reg = util.readJsonSafe(path.join(root, '.aishield', 'watermarks.json'));
      if (reg && reg.watermarks) {
        const mine = reg.watermarks.filter(w => ids.includes(w.id));
        if (mine.length) {
          log.ok('내 레지스트리와 일치 — 이 콘텐츠에는 내 워터마크가 박혀 있습니다(원본 또는 그대로 복제된 사본).');
          for (const w of mine) {
            log.plain(`    id=${w.id}  owner=${(w.payload && w.payload.owner) || '-'}  domain=${(w.payload && w.payload.domain) || '-'}  ts=${w.ts}`);
          }
          log.plain('  ' + color.dim('증거 보존: aishield evidence-pack 로 타임스탬프·해시·매니페스트를 묶을 수 있습니다.'));
        } else {
          log.plain('  ' + color.dim('현재 레지스트리에는 없는 ID입니다(다른 프로젝트/머신에서 생성됐을 수 있음).'));
        }
      }
      break;
    }

    case 'restore': {
      const b = opt('from') ? path.resolve(root, opt('from')) : latestBackup(root);
      if (!b) { log.err('복원할 백업이 없습니다.'); process.exitCode = 1; break; }
      const r = restoreBackup(root, b);
      if (r.noManifest) { log.err(`백업 매니페스트를 찾을 수 없습니다: ${path.relative(root, b)}`); process.exitCode = 1; break; }
      log.ok(`복원 ${r.restored}개${r.removed ? `, 생성파일 ${r.removed}개 제거` : ''}${r.skipped ? color.yellow(`, 경계 밖 ${r.skipped}개 건너뜀`) : ''} ← ${color.dim(path.relative(root, b))}`);
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;

    default:
      log.err(`알 수 없는 명령: ${cmd}`);
      printHelp();
      process.exit(1);
  }
}

main().catch(e => { log.err(e.stack || e.message); process.exit(1); });
