# AI에게 복붙 한 번으로 / Use with AI (copy-paste)

자기 프로젝트 폴더에서 AI 코딩 도구(Claude Code, Cursor, Copilot 등)에게 아래 프롬프트를 복붙하면, AI가 알아서 ai-clone-shield를 설치하고 점검하고 적용합니다. 깃헙을 찾아가거나 명령어를 외울 필요가 없어요.

Paste the prompt below to your AI coding tool from your project folder. It will install, check, and apply ai-clone-shield for you. No need to visit GitHub or memorize commands.

- GitHub: https://github.com/shinnanchanguk/ai-clone-shield
- npm: `ai-clone-shield`

---

## 한국어 프롬프트

```
내 프로젝트를 AI 무단 복제로부터 보호하고 싶어. ai-clone-shield 라는 오픈소스 도구(https://github.com/shinnanchanguk/ai-clone-shield)를 써서 적용해줘.

순서대로 해줘:
1. 먼저 내 프로젝트를 빌드해(빌드 산출물이 있어야 적용돼).
2. 프로젝트 폴더에서 `npx -y ai-clone-shield@latest detect` 로 스택과 빌드 산출물을 감지해.
3. `npx -y ai-clone-shield@latest init` 한 다음, 생성된 aishield.config.json 의 owner(이름/도메인/연락처)를 나에게 물어서 채워줘(워터마크와 법적 고지에 들어가).
4. `npx -y ai-clone-shield@latest apply` 로 보호를 적용해(워터마크·AI 고지·법적 헤더·소스맵 제거 등).
5. `npx -y ai-clone-shield@latest verify` 로 기능이 안 깨졌는지 확인해. 문제가 있으면 `npx -y ai-clone-shield@latest restore` 로 되돌리고 원인을 알려줘.
6. 마지막으로 무엇을 적용했는지, 그리고 이 도구의 정직한 한계(복제를 100% 막진 못하고, 비용을 높이고 워터마크로 추적·증거를 남긴다)를 요약해줘.

배포 후 누가 베낀 게 의심되면 `npx -y ai-clone-shield@latest watermark-check --url <의심URL>` 로 내 워터마크를 확인할 수 있다는 것도 알려줘.
```

---

## English prompt

```
I want to protect my project from being cloned by AI. Use the open-source tool ai-clone-shield (https://github.com/shinnanchanguk/ai-clone-shield) to apply protection.

Please do this in order:
1. Build my project first (a build output is required).
2. In the project folder, run `npx -y ai-clone-shield@latest detect` to detect the stack and build output.
3. Run `npx -y ai-clone-shield@latest init`, then ask me for owner (name/domain/contact) and fill them into the generated aishield.config.json (they go into the watermark and legal notice).
4. Run `npx -y ai-clone-shield@latest apply` to apply protection (watermark, AI notice, legal headers, source map removal, etc.).
5. Run `npx -y ai-clone-shield@latest verify` to confirm nothing broke. If something is off, run `npx -y ai-clone-shield@latest restore` and tell me the cause.
6. Finally, summarize what was applied and the tool's honest limits (it cannot make copying 100% impossible; it raises the cost and leaves traceable watermarks and evidence).

If I later suspect someone copied my site, tell me I can run `npx -y ai-clone-shield@latest watermark-check --url <suspect-URL>` to verify my watermark.
```

---

정직한 한 줄: 이 도구는 복제를 불가능하게 만들지 않습니다. 복제 비용을 높이고, 그대로 베끼면 워터마크로 추적되게 하고, 법적 증거를 남깁니다.

Honest note: this tool does not make copying impossible. It raises the cost, makes verbatim copies traceable, and leaves a legal trail.
