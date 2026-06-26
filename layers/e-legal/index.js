'use strict';
// 레이어 E: 법적 증거팩
// - robots.txt: AI/복제 크롤러 차단(일반 크롤러는 허용해 SEO 유지)
// - .well-known/tdmrep.json: W3C TDM Reservation Protocol(EU 텍스트·데이터 마이닝 opt-out)
// - LICENSE: 독점(All Rights Reserved) 라이선스 — 소스 루트에 없을 때만 생성
// - .aishield/integrity.json: 산출물 해시 매니페스트(복제 분쟁 시 "내 원본" 증거)
//
// 정직한 한계: 저작권은 창작 즉시 발생하나 소송 구제는 관할권별로 다르다(미국은 등록 전제).
// TDM opt-out은 EU 내 효력이 명확하고, "AI 학습 금지" 조항의 집행력은 아직 판례로 확립되지 않았다.
const path = require('path');
const html = require('../../core/html');

const MARK = '# ai-clone-shield';

module.exports = {
  id: 'e-legal',
  name: '법적 증거팩',
  order: 5,
  effect: '소송 기반 상 (관할권별 효력 차이는 정직 고지)',

  async apply(ctx) {
    const { root, config, dry, backup, util } = ctx;
    const buildDir = path.join(root, config.buildDir || '.');
    const owner = config.owner || {};
    const year = new Date().getFullYear();
    const changed = [];
    const notes = [];

    // 1) robots.txt — AI/복제 크롤러 차단 블록 추가(멱등)
    const bots = util.readJsonSafe(path.join(__dirname, 'ai-bots.json')) || [];
    const robotsPath = path.join(buildDir, 'robots.txt');
    let robots = util.exists(robotsPath) ? util.readText(robotsPath) : '';
    if (!robots.includes(MARK)) {
      const lines = [`${MARK} block AI / scraping crawlers (begin)`];
      for (const b of bots) { lines.push(`User-agent: ${b}`, 'Disallow: /'); }
      lines.push('');
      lines.push('# general crawlers stay allowed (SEO preserved); see /llms.txt for policy');
      if (owner.domain) lines.push(`# Owner: ${owner.domain}`);
      lines.push(`${MARK} (end)`, '');
      const block = lines.join('\n');
      robots = robots.trim() ? robots.trim() + '\n\n' + block : 'User-agent: *\nAllow: /\n\n' + block;
      if (!dry) {
        if (util.exists(robotsPath)) backup && backup.backup(robotsPath);
        else backup && backup.markCreated(robotsPath);
        util.writeText(robotsPath, robots);
      }
      changed.push(path.relative(root, robotsPath));
    }

    // 2) .well-known/tdmrep.json — EU TDM opt-out
    const tdmPath = path.join(buildDir, '.well-known', 'tdmrep.json');
    if (!util.exists(tdmPath)) {
      const tdm = [{
        location: '/',
        'tdm-reservation': 1,
        'tdm-policy': owner.domain ? `https://${owner.domain}/llms.txt` : '/llms.txt',
      }];
      if (!dry) { backup && backup.markCreated(tdmPath); util.writeText(tdmPath, JSON.stringify(tdm, null, 2) + '\n'); }
      changed.push(path.relative(root, tdmPath));
    }

    // 3) LICENSE — 소스 루트에 없을 때만 독점 라이선스 생성(기존 LICENSE는 건드리지 않음)
    const licPath = path.join(root, 'LICENSE');
    if (!util.exists(licPath)) {
      const tplPath = path.join(__dirname, '..', '..', 'templates', 'proprietary-license.txt');
      const lic = html.fill(util.readText(tplPath), {
        owner: owner.name || 'the owner',
        domain: owner.domain || '',
        contact: owner.contact || '(see site)',
        year,
      });
      if (!dry) { backup && backup.markCreated(licPath); util.writeText(licPath, lic); }
      changed.push(path.relative(root, licPath));
    } else {
      notes.push(util.color.dim('LICENSE 이미 존재 → 건드리지 않음.'));
    }

    // 4) 무결성 매니페스트(증거) — restore 대상 아님(.aishield, 보존)
    const files = util.walk(buildDir, { exts: ['.html', '.htm', '.js', '.mjs', '.css'] });
    const integ = { at: new Date().toISOString(), owner: owner.name || null, domain: owner.domain || null, files: {} };
    for (const f of files) {
      const c = util.readTextSafe(f);
      if (c === null) continue;
      integ.files[path.relative(buildDir, f)] = util.sha256(c);
    }
    if (!dry) util.writeText(path.join(root, '.aishield', 'integrity.json'), JSON.stringify(integ, null, 2) + '\n');

    notes.unshift(util.color.dim(
      `robots.txt(AI봇 ${bots.length}종 차단·일반 크롤러 허용) + .well-known/tdmrep.json(EU TDM opt-out) + 무결성 매니페스트(${files.length}파일)`
    ));
    notes.push(util.color.yellow('정직: 저작권은 창작 즉시 발생하나 미국 소송엔 등록 필요, TDM opt-out은 EU 내 효력, AI학습금지 조항은 판례 미확립.'));
    notes.push(util.color.dim('봇 목록은 시점 의존 — 주기적으로 ai-robots-txt/ai.robots.txt 기준 갱신 권장.'));

    return { changed, notes };
  },
};
