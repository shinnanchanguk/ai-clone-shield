'use strict';
// 레이어 B: 로직 격리 진단
// 가장 근본적인 방어는 "베낄 로직 자체를 클라이언트로 안 보내는 것"이다.
// 자동으로 옮길 수는 없으므로(코드 구조 변경), 이 레이어는 클라 번들에 노출된
// 시크릿/위험 패턴을 스캔해 리포트하고, 서버 이전을 권고한다(변경 없음).
const path = require('path');

const SECRET_PATTERNS = [
  { label: 'AWS Access Key', re: /AKIA[0-9A-Z]{16}/ },
  { label: 'Google API Key', re: /AIza[0-9A-Za-z\-_]{35}/ },
  { label: 'Stripe Live Key', re: /sk_live_[0-9a-zA-Z]{24,}/ },
  { label: 'OpenAI Key', re: /sk-[A-Za-z0-9]{32,}/ },
  { label: 'GitHub Token', re: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { label: 'GitHub PAT', re: /github_pat_[0-9a-zA-Z_]{60,}/ },
  { label: 'Slack Token', re: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  { label: 'Private Key Block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { label: 'JWT', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/ },
  { label: 'DB 연결 문자열(자격증명)', re: /(?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^\s"']*:[^\s"'@]+@/ },
  { label: 'env 전체 노출', re: /JSON\.stringify\(\s*(?:process\.env|import\.meta\.env)\s*\)/ },
  { label: 'secret 직접 할당', re: /(?:api[_-]?key|secret|password|passwd|access[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_\-./+]{16,}["']/i },
];

function redact(s) {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= 12) return t.slice(0, 4) + '…';
  return t.slice(0, 6) + '…' + t.slice(-4);
}

module.exports = {
  id: 'b-logic-isolation',
  name: '로직 격리 진단',
  order: 2,
  effect: '로직 복제: 상 (서버 이전이 근본 방어) — 이 레이어는 노출 스캔·권고만',

  async apply(ctx) {
    const { root, config, util, detect } = ctx;
    const buildDir = path.join(root, config.buildDir || '.');
    const files = util.walk(buildDir, { exts: ['.js', '.mjs', '.html', '.htm'] });
    const seen = new Set();
    const findings = [];

    const showSamples = (ctx.layerConfig && ctx.layerConfig['b-logic-isolation'] || {}).showSamples;
    for (const f of files) {
      const s = util.readTextSafe(f);
      if (s === null) continue;
      for (const { label, re } of SECRET_PATTERNS) {
        const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
        let m;
        while ((m = g.exec(s))) {
          const key = label + '|' + path.relative(root, f) + '|' + m[0].slice(0, 12);
          if (!seen.has(key)) {
            seen.add(key);
            findings.push({ file: path.relative(root, f), label, sample: redact(m[0]) });
          }
          if (findings.length > 300) break;
        }
      }
    }

    const notes = [];
    if (findings.length) {
      notes.push(util.color.red(`클라이언트 번들에 노출 의심 ${findings.length}건 — 서버로 옮기세요:`));
      for (const x of findings.slice(0, 12)) {
        notes.push(`  ${util.color.yellow(x.label)} @ ${x.file}${showSamples ? ': ' + util.color.dim(x.sample) : ''}`);
      }
      if (!showSamples) notes.push(util.color.dim('  (샘플 값은 숨김. 보려면 config의 layers["b-logic-isolation"].showSamples=true)'));
      if (findings.length > 12) notes.push(util.color.dim(`  ...${findings.length - 12}건 더`));
    } else {
      notes.push(util.color.green('클라 번들에서 노출 시크릿/위험 패턴 미발견.'));
    }
    notes.push(util.color.dim('권고: 핵심 로직·키는 서버 액션/엣지 함수/API 뒤로. 클라엔 호출만 남기면 번들에서 추출 불가(가장 근본적 방어).'));
    if (detect && !detect.hasServer) {
      notes.push(util.color.dim('이 스택은 서버가 없습니다 → BFF(별도 API 서버)나 엣지 함수 도입을 검토하세요.'));
    }

    return { changed: [], notes, findings };
  },
};
