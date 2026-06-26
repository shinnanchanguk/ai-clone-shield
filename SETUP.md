# 설치 및 설정

## 요구사항
- Node.js >= 16 (브라우저 검증 `--url` 과 `watermark-check --url` 은 fetch 때문에 Node 18+ 권장)
- 코어는 의존성 0 입니다. 아래 도구는 **선택**이며, 있으면 더 강해집니다.
  - `javascript-obfuscator` : 난독화(`--preset max` 또는 config의 `obfuscate: true`)
  - `puppeteer` 또는 `playwright` : `verify --url` 실제 렌더 검사
  - `ots`(opentimestamps-client) : `evidence-pack` 블록체인 시점증명

## 설치

```bash
# 설치 없이 실행
npx ai-clone-shield detect

# 또는 전역 설치
npm i -g ai-clone-shield
aishield detect

# 또는 저장소 클론 후
git clone <repo> && cd ai-clone-shield
node bin/aishield.js detect
```

### Claude Code 스킬로 쓰기
`SKILL.md` 가 스킬 진입점입니다. 이 폴더를 `~/.claude/skills/ai-clone-shield/` 에 두면(또는 심볼릭 링크), "내 프로젝트 못 베끼게 해줘" 같은 요청에서 Claude가 절차를 따라 적용합니다.

## 설정 파일 (`aishield.config.json`)

`aishield init` 으로 생성됩니다.

```json
{
  "owner": {
    "name": "내 이름 또는 브랜드",
    "domain": "example.com",
    "contact": "me@example.com",
    "year": 2026
  },
  "preset": "balanced",
  "buildDir": "dist",
  "layers": {},
  "aggressiveOptIn": false
}
```

- **owner**: 워터마크·LICENSE·고지문에 박히는 식별 정보. 비우면 추적 식별력이 약해집니다. 시크릿이 아니라 공개 식별자이므로 안심하고 채우세요.
- **preset**: `light`(워터마크·고지·법적만) / `balanced`(기본) / `max`(난독화·공격적 포함).
- **buildDir**: 빌드 산출물 디렉토리. 비우면 자동 감지.
- **layers**: 레이어별 개별 덮어쓰기. 예: 특정 레이어 끄기 `{ "a-code-hardening": false }`, 난독화 강도 `{ "a-code-hardening": { "obfuscate": true, "obfuscateLevel": "high" } }`.
- **aggressiveOptIn**: `true` 여야 G(서버 봇 차단·PoW 가이드)가 켜집니다. SEO·법 위험을 이해하고 켜세요.

## 권장 워크플로우

```bash
aishield init                 # 1회: owner 입력
npm run build                 # 배포할 때마다
aishield apply                # 빌드 산출물에 보호 적용
aishield verify               # 무손상 확인
# 깨지면: aishield restore
# 배포
```

CI에 넣으려면 `build` 다음, `deploy` 전에 `aishield apply && aishield verify` 를 두세요. `verify` 는 error가 있으면 종료 코드 1을 반환합니다.
