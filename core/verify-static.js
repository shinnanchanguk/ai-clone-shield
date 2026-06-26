'use strict';
// 기능 무손상 정적 검증 (의존성 0) + 선택적 브라우저 검사(puppeteer/playwright 설치 시)
// 목적: 보호 레이어 적용이 산출물을 깨뜨리지 않았는지 확인한다.
const path = require('path');
const vm = require('vm');
const { isLikelyESM } = require('./util');

// HTML에서 로컬(상대/루트) 자산 참조만 추출
function localRefs(htmlSrc) {
  const refs = [];
  const re = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(htmlSrc))) {
    const u = m[1];
    if (/^(https?:|data:|mailto:|tel:|javascript:|#|\/\/)/i.test(u)) continue;
    refs.push(u.split('?')[0].split('#')[0]);
  }
  return refs;
}

// JS 구문 유효성. top-level static import/export(ESM)만 스킵(오탐 방지). 동적 import()는 검사한다.
function jsSyntaxCheck(js) {
  if (isLikelyESM(js)) return { skip: true };
  try { new vm.Script(js, { displayErrors: false }); return { ok: true }; }
  catch (e) { return { ok: false, err: e.message.split('\n')[0] }; }
}

function verifyBuild(root, buildDir, util) {
  const htmls = util.walk(buildDir, { exts: ['.html', '.htm'] });
  const jss = util.walk(buildDir, { exts: ['.js', '.mjs'] });
  const issues = [];

  for (const f of htmls) {
    const rel = path.relative(root, f);
    const src = util.readTextSafe(f);
    if (src === null) { issues.push({ sev: 'warn', file: rel, msg: '파일을 읽을 수 없음(권한/인코딩)' }); continue; }

    // 우리가 주입한 요소가 정상적으로 닫혔는지
    if (src.includes('data-aishield-notice') && !/<aside\b[^>]*data-aishield-notice[\s\S]*?<\/aside>/i.test(src)) {
      issues.push({ sev: 'error', file: rel, msg: 'AI 고지 <aside>가 닫히지 않음(주입 손상)' });
    }
    if (src.includes('ai-clone-shield:wm') && !/window\.__AISHIELD__/.test(src)) {
      issues.push({ sev: 'error', file: rel, msg: '워터마크 스크립트가 손상됨' });
    }
    if (/<body/i.test(src) && !/<\/body>/i.test(src)) {
      issues.push({ sev: 'warn', file: rel, msg: '<body>가 닫히지 않음' });
    }

    // 인라인 <script>(외부 src 아님, ESM module 아님)의 구문이 유효한지 — 주입이 깨뜨렸는지 검출
    const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let sm;
    while ((sm = scriptRe.exec(src))) {
      const attrs = sm[1] || '';
      const code = sm[2] || '';
      if (/\bsrc\s*=/.test(attrs)) continue;
      if (/type\s*=\s*["']?module/i.test(attrs)) continue;
      if (!code.trim()) continue;
      const r = jsSyntaxCheck(code);
      if (r.ok === false) issues.push({ sev: 'error', file: rel, msg: `인라인 script 구문 오류: ${r.err}` });
    }

    // 로컬 자산 참조가 실제 파일로 존재하는지(깨진 링크)
    for (const ref of localRefs(src)) {
      const abs = ref.startsWith('/') ? path.join(buildDir, ref) : path.join(path.dirname(f), ref);
      if (!util.exists(abs)) {
        issues.push({ sev: 'warn', file: rel, msg: `참조 파일을 찾지 못함: ${ref} (SPA 라우트면 정상일 수 있음)` });
      }
    }
  }

  for (const f of jss) {
    const code = util.readTextSafe(f);
    if (code === null) { issues.push({ sev: 'warn', file: path.relative(root, f), msg: '파일을 읽을 수 없음' }); continue; }
    const r = jsSyntaxCheck(code);
    if (r.ok === false) {
      issues.push({ sev: 'error', file: path.relative(root, f), msg: `JS 구문 오류: ${r.err}` });
    }
  }

  return { checkedHtml: htmls.length, checkedJs: jss.length, issues };
}

// 선택적 브라우저 검사: puppeteer 또는 playwright 가 설치돼 있고 --url 이 주어졌을 때만.
function browserEngine() {
  try { require.resolve('puppeteer'); return 'puppeteer'; } catch { /* */ }
  try { require.resolve('playwright'); return 'playwright'; } catch { /* */ }
  return null;
}

async function browserCheck(url, timeoutMs = 20000) {
  const engine = browserEngine();
  if (!engine) return { available: false };
  const errors = [];
  let browser;
  try {
    if (engine === 'puppeteer') {
      const pup = require('puppeteer');
      browser = await pup.launch({ headless: 'new' });
      const page = await browser.newPage();
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(url, { waitUntil: 'networkidle0', timeout: timeoutMs });
    } else {
      const { chromium } = require('playwright');
      browser = await chromium.launch();
      const page = await browser.newPage();
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
    }
    return { available: true, engine, errors };
  } catch (e) {
    return { available: true, engine, errors, loadError: e.message };
  } finally {
    if (browser) { try { await browser.close(); } catch { /* */ } }
  }
}

module.exports = { verifyBuild, browserCheck, browserEngine, localRefs, jsSyntaxCheck };
