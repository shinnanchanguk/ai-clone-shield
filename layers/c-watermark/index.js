'use strict';
// 레이어 C: 워터마크 + 무결성
// - 비가시: 제로폭(ZWC) 워터마크를 텍스트 노드에 다중 분산 삽입(그대로 복사하면 따라온다)
// - 가시(보조): HTML 주석 + window.__AISHIELD__ 빌드메타 + 콘솔 경고 배너
// - 무결성: 페이로드 해시 + 레지스트리(.aishield/watermarks.json) 기록(복제 의심본 식별 근거)
//
// 정직한 한계: "AI가 워터마크를 수정 못하게/아예 못하게"는 클라이언트 코드만으론 불가능하다.
// 누구나 텍스트를 편집할 수 있고, AI에게 "완전히 새로 작성"을 시키면 어떤 워터마크도 증발한다.
// 이 레이어는 "그대로 긁어 붙이는 복제"를 잡는 추적/증거이지, 재작성 복제까지 막지 못한다.
const path = require('path');
const crypto = require('crypto');
const html = require('../../core/html');

const MARKER = 'ai-clone-shield:wm';

module.exports = {
  id: 'c-watermark',
  name: '워터마크 + 무결성',
  order: 3,
  effect: '추적·증거 상 / 변조차단 중 (재작성 복제는 못 막음)',

  async apply(ctx) {
    const { root, config, dry, backup, util } = ctx;
    const buildDir = path.join(root, config.buildDir || '.');
    const files = util.walk(buildDir, { exts: ['.html', '.htm'] });
    const owner = config.owner || {};
    const year = new Date().getFullYear();

    if (!files.length) {
      return { changed: [], notes: [util.color.yellow('HTML 파일이 없어 워터마크를 건너뜁니다(빌드 후 재실행).')] };
    }

    const ts = new Date().toISOString();
    const id = crypto
      .createHash('sha256')
      .update((owner.name || '') + '|' + (owner.domain || '') + '|' + ts + '|' + crypto.randomBytes(8).toString('hex'))
      .digest('hex')
      .slice(0, 12);
    const payload = { v: 1, id, owner: owner.name || null, domain: owner.domain || null, ts };
    const payloadHash = util.sha256(JSON.stringify(payload));
    const zwPayload = html.encodeZW('AISHLD:' + id);

    // owner 값은 사용자 제어 입력 → 주석/스크립트에 넣을 때 반드시 이스케이프(주석 탈출·</script> XSS 차단)
    const metaComment =
      `<!-- ${MARKER} (c) ${html.escapeForComment(owner.name || 'owner')} ${year}` +
      `${owner.domain ? ' ' + html.escapeForComment(owner.domain) : ''}. ` +
      `proprietary, watermarked content. unauthorized copying prohibited. id=${id} -->`;
    const bannerText = '%c⚠ ' + (owner.name || 'This site') +
      ': 워터마크된 저작물입니다. 무단 복제 금지 (ai-clone-shield)';
    const buildMeta = {
      owner: owner.name || null,
      domain: owner.domain || null,
      id,
      ts,
      hash: payloadHash,
      notice: 'Proprietary, watermarked content. Unauthorized copying is prohibited.',
    };
    const script =
      `<script>/*${MARKER}*/` +
      `window.__AISHIELD__=Object.freeze(${html.escapeForScript(JSON.stringify(buildMeta))});` +
      `try{console.info(${html.escapeForScript(JSON.stringify(bannerText))},"color:#b00020;font-weight:bold")}catch(e){}` +
      `</script>`;

    const changed = [];
    let skipped = 0;
    const noZw = [];
    const unreadable = [];
    for (const f of files) {
      const src = util.readTextSafe(f);
      if (src === null) { unreadable.push(path.relative(root, f)); continue; }
      if (html.hasMarker(src, MARKER)) { skipped++; continue; } // 멱등: 이미 워터마킹됨
      const inj = html.injectZeroWidth(src, zwPayload, 8);
      let out = html.insertInHead(inj.html, metaComment);
      out = html.insertBeforeBodyClose(out, script);
      if (!dry) { backup && backup.backup(f); util.writeText(f, out); }
      if (inj.spots === 0) noZw.push(path.relative(root, f));
      changed.push(path.relative(root, f));
    }

    // 레지스트리 기록(복제 의심본 식별 근거). dry에서는 기록하지 않는다.
    if (!dry && changed.length) {
      const regPath = path.join(root, '.aishield', 'watermarks.json');
      const reg = util.readJsonSafe(regPath) ||
        { site: { owner: owner.name || null, domain: owner.domain || null }, watermarks: [] };
      reg.watermarks.push({ id, ts, hash: payloadHash, payload, files: changed });
      util.writeText(regPath, JSON.stringify(reg, null, 2) + '\n');
    }

    const notes = [
      `워터마크 id=${util.color.bold(id)}  (HTML ${changed.length}개: 비가시 ZWC×최대8 + 메타 주석 + 콘솔 배너 + 무결성 해시)`,
      util.color.dim('레지스트리: .aishield/watermarks.json  ·  의심본 검사: aishield watermark-check <파일/URL저장본>'),
    ];
    if (skipped) notes.push(util.color.dim(`이미 워터마킹된 ${skipped}개는 건너뜀(멱등).`));
    if (noZw.length) notes.push(util.color.yellow(`텍스트 노드가 없어 비가시 ZWC 미삽입(메타·배너만): ${noZw.length}개`));
    if (unreadable.length) notes.push(util.color.yellow(`읽지 못한 파일 ${unreadable.length}개 건너뜀.`));
    if (!owner.name) notes.push(util.color.yellow('owner.name 비어있음 → 식별력 약함. aishield.config.json 을 채우면 강해집니다.'));
    notes.push(util.color.yellow('한계: 재작성("새로 만들어줘") 복제에는 워터마크가 전달되지 않습니다. 그대로 베끼는 복제 추적용입니다.'));

    return { changed, notes };
  },
};
