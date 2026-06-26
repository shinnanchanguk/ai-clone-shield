'use strict';
// 레이어 F: 기능 무손상 게이트
// 보호 레이어 적용 직후, 산출물이 깨지지 않았는지 정적 검증한다(주입 태그 닫힘·자산 참조·JS 구문).
// 이 레이어는 산출물을 변경하지 않는다(검증만). 더 깊은 검증은 `aishield verify`(브라우저 옵션).
//
// 완결성 점검 1순위 보완: 사용자 요구 "모든 기능 정상 작동" 보증 게이트.
const path = require('path');
const { verifyBuild } = require('../../core/verify-static');

module.exports = {
  id: 'f-function-guard',
  name: '기능 무손상 게이트',
  order: 6,
  effect: '적용 후 산출물 손상 여부 정적 검증 (변경 없음)',

  async apply(ctx) {
    const { root, config, util } = ctx;
    const buildDir = path.join(root, config.buildDir || '.');
    const r = verifyBuild(root, buildDir, util);
    const errs = r.issues.filter(i => i.sev === 'error');
    const warns = r.issues.filter(i => i.sev === 'warn');

    const notes = [util.color.dim(`HTML ${r.checkedHtml}개 · JS ${r.checkedJs}개 검사`)];
    for (const i of errs) notes.push(util.color.red('  손상: ') + `${i.file} — ${i.msg}`);
    for (const i of warns.slice(0, 5)) notes.push(util.color.yellow('  주의: ') + `${i.file} — ${i.msg}`);
    if (warns.length > 5) notes.push(util.color.dim(`  ...주의 ${warns.length - 5}개 더`));

    if (errs.length) {
      notes.push(util.color.red(`기능 손상 ${errs.length}건 감지 — 'aishield restore' 로 즉시 되돌릴 수 있습니다.`));
    } else {
      notes.push(util.color.green('산출물 정적 검증 통과') + (warns.length ? util.color.dim(` (주의 ${warns.length}건)`) : ''));
    }
    notes.push(util.color.dim('더 깊은 검증(실제 렌더·콘솔 에러): aishield verify --url <배포미리보기 URL>'));

    return { changed: [], notes, verify: { errors: errs.length, warnings: warns.length } };
  },
};
