'use strict';
// 레이어 G: 공격적 억제 (기본 OFF — aggressiveOptIn=true 일 때만 동작)
// 서버 레벨 봇 차단·PoW 게이트는 헤드리스 봇을 막지만 검색엔진 크롤러도 막아 SEO에 타격을 준다.
// 그래서 자동 주입하지 않고, 서버 설정 가이드를 생성하고 강한 SEO 경고를 동봉한다.
// 타핏/데이터 포이즌은 법적 회색지대라 코드로 만들지 않고 외부 참고만 안내한다.
const path = require('path');

function reEscape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = {
  id: 'g-aggressive',
  name: '공격적 억제 (가이드)',
  order: 7,
  effect: '헤드리스 봇 차단 강함 / SEO 타격·법 회색지대 — 기본 OFF, 가이드만 생성',

  async apply(ctx) {
    const { root, dry, backup, util } = ctx;
    const bots = util.readJsonSafe(path.join(__dirname, '..', 'e-legal', 'ai-bots.json')) || [];
    const gdir = path.join(root, 'aishield-aggressive');
    const changed = [];

    const files = {
      'nginx-ai-block.conf': [
        '# ai-clone-shield aggressive — nginx: AI/스크래퍼 봇 UA 차단(robots보다 강제)',
        '# http{} 에 map 을 두고, server{} 에서 차단. 경고: 검색 크롤러도 막힐 수 있음(SEO-WARNING.md 참고).',
        'map $http_user_agent $aishield_block {',
        '  default 0;',
        ...bots.map(b => `  "~*${reEscape(b)}" 1;`),
        '}',
        '',
        '# server { ... }  안에 추가:',
        '#   if ($aishield_block) { return 403; }',
        '',
      ].join('\n'),

      '.htaccess-ai-block': [
        '# ai-clone-shield aggressive — Apache .htaccess: AI 봇 UA 차단',
        '<IfModule mod_setenvif.c>',
        ...bots.map(b => `  BrowserMatchNoCase "${b}" aishield_bad`),
        '  <RequireAll>',
        '    Require all granted',
        '    Require not env aishield_bad',
        '  </RequireAll>',
        '</IfModule>',
        '',
      ].join('\n'),

      'anubis-docker-compose.yml': [
        '# ai-clone-shield aggressive — Anubis(Proof-of-Work) 게이트 예시',
        '# https://github.com/TecharoHQ/anubis  (MIT)',
        '# 주의: 헤드리스 봇을 막지만 검색엔진 크롤러도 막아 SEO에 타격. 신중히 적용.',
        'services:',
        '  anubis:',
        '    image: ghcr.io/techarohq/anubis:latest',
        '    environment:',
        '      BIND: ":8923"',
        '      TARGET: "http://your-app:3000"',
        '      DIFFICULTY: "4"',
        '    ports:',
        '      - "8923:8923"',
        '',
      ].join('\n'),

      'SEO-WARNING.md': [
        '# 경고: 공격적 레이어는 SEO와 호환성에 타격을 줄 수 있습니다',
        '',
        '- 서버 레벨 UA 차단·PoW 게이트(Anubis)는 GPTBot뿐 아니라 **Googlebot 등 검색 크롤러도 막을 수 있어** 검색 노출이 떨어질 수 있습니다.',
        '- User-Agent는 위조가 가능해, 작정한 스크래퍼는 이 차단을 우회합니다(정직한 한계).',
        '- 타핏(Nepenthes 등)·데이터 포이즌은 **법적 회색지대**이며, 일부 관할권에서 시스템 방해로 역고소 소지가 있어 이 도구는 자동 생성하지 않습니다(외부 참고만).',
        '- 적용 전 검색 크롤러(Googlebot/Bingbot)는 allowlist 하는 것을 강력 권장합니다.',
        '',
        '이 가이드는 **자동 적용되지 않습니다.** 내용을 검토하고 직접 서버에 반영하세요.',
        '',
      ].join('\n'),
    };

    for (const [name, content] of Object.entries(files)) {
      const fp = path.join(gdir, name);
      if (!dry) {
        if (util.exists(fp)) backup && backup.backup(fp);
        else backup && backup.markCreated(fp);
        util.writeText(fp, content);
      }
      changed.push(path.relative(root, fp));
    }

    return {
      changed,
      notes: [
        util.color.dim(`서버 봇 차단 가이드 생성: aishield-aggressive/ (nginx·htaccess·Anubis·SEO-WARNING)`),
        util.color.yellow('자동 적용 안 됨 — 내용 검토 후 직접 서버에 반영하세요. 검색 크롤러는 allowlist 권장.'),
        util.color.yellow('정직: UA 차단은 위조로 우회 가능, PoW는 SEO 타격. 타핏/포이즌은 법 회색지대라 미생성.'),
      ],
    };
  },
};
