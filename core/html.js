'use strict';
// HTML 후처리 + 제로폭(ZWC) 워터마크 인코딩 (의존성 0)
// 어떤 스택이든 빌드 산출물 HTML에 안전하게 주입하기 위한 공통 헬퍼.
// 비가시 문자는 모두 \uXXXX 이스케이프로 표기한다(소스에 보이지 않는 문자를 두지 않는다).

const ZW0 = '\u200b';   // ZERO WIDTH SPACE       -> bit 0
const ZW1 = '\u200c';   // ZERO WIDTH NON-JOINER  -> bit 1
const ZWSEP = '\u2060'; // WORD JOINER            -> 경계 마커

// 문자열 -> UTF-8 bits -> 제로폭 문자열 (경계 마커 포함)
function encodeZW(str) {
  const buf = Buffer.from(str, 'utf8');
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let zw = '';
  for (const ch of bits) zw += ch === '0' ? ZW0 : ZW1;
  return ZWSEP + zw + ZWSEP;
}

// 텍스트에 박힌 모든 ZWC 페이로드 블록을 디코드해 배열로 반환
function decodeAllZW(text) {
  const results = [];
  const re = new RegExp(ZWSEP + '([\\u200b\\u200c]+)' + ZWSEP, 'g');
  let m;
  while ((m = re.exec(text))) {
    let bits = '';
    for (const ch of m[1]) bits += ch === ZW0 ? '0' : '1';
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    try {
      const s = Buffer.from(bytes).toString('utf8');
      if (s) results.push(s);
    } catch { /* skip malformed */ }
  }
  return results;
}

// 텍스트 노드(태그 밖)에만 ZWC 페이로드를 분산 삽입. <script>/<style> 내용은 건드리지 않는다(JS/CSS 무손상).
// { html, spots } 반환.
function injectZeroWidth(html, payloadZW, maxSpots) {
  let inSkip = false;
  let count = 0;
  const re = /(<script\b[^>]*>)|(<\/script\s*>)|(<style\b[^>]*>)|(<\/style\s*>)|(<[^>]+>)|([^<]+)/gi;
  const out = html.replace(re, (m, sOpen, sClose, stOpen, stClose, otherTag, text) => {
    if (sOpen || stOpen) { inSkip = true; return m; }
    if (sClose || stClose) { inSkip = false; return m; }
    if (otherTag) return m;
    if (text !== undefined) {
      if (inSkip) return text;
      if (count >= maxSpots) return text;
      if (/\S/.test(text)) { count++; return text + payloadZW; }
      return text;
    }
    return m;
  });
  return { html: out, spots: count };
}

// 주의: replace 의 2번째 인자를 "문자열"로 주면 snippet 안의 $&, $$, $`, $1 등이
// 치환 특수패턴으로 해석돼 주입 HTML 이 깨진다. 반드시 콜백(함수)으로 넘긴다.
function insertInHead(html, snippet) {
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, () => snippet + '\n</head>');
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, m => m + '\n' + snippet);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, m => m + '\n<head>\n' + snippet + '\n</head>');
  return snippet + '\n' + html;
}

function insertBeforeBodyClose(html, snippet) {
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, () => snippet + '\n</body>');
  if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, () => snippet + '\n</html>');
  return html + '\n' + snippet;
}

function hasMarker(html, marker) { return html.indexOf(marker) !== -1; }

// <script> 안에 안전하게 넣기 위해 < 와 줄구분자를 이스케이프(</script> 탈출·U+2028/9 방지)
function escapeForScript(s) {
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c === 0x3c) out += '\\u003c';
    else if (c === 0x2028) out += '\\u2028';
    else if (c === 0x2029) out += '\\u2029';
    else out += s[i];
  }
  return out;
}

// HTML 주석 안에 안전하게 넣기 위해 주석 종료 시퀀스를 무력화
function escapeForComment(s) {
  return String(s).replace(/--+/g, '-').replace(/>/g, ')');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));
}

module.exports = {
  ZW0, ZW1, ZWSEP,
  encodeZW, decodeAllZW, injectZeroWidth,
  insertInHead, insertBeforeBodyClose, hasMarker,
  escapeForScript, escapeForComment, escapeHtml, fill,
};
