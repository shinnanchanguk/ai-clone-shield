# ai-clone-shield

**English** | [한국어](./README.ko.md)

> Make your deployed web project harder for AI (and people) to clone wholesale, while every feature keeps working.

Run it once in your project folder and it hardens your build output: distributed watermarks, AI-readable notices, and legal headers, then verifies nothing broke. If a copy shows up later, you can extract your watermark from the suspect site to prove it is yours, and assemble an evidence pack.

Works across stacks: Next.js, Vite, CRA, static HTML, or any build output.

---

## Why this exists

"Vibe coding" made it trivial to point an AI at a live URL and say "build me one like this." Public sites must ship their HTML, CSS, and JS to the browser, so anyone, or any agent, can read and replicate them. Creators have little recourse.

ai-clone-shield does not pretend to make copying impossible. It can't, and the "Honest limits" section says so plainly. What it does is raise the cost of copying, embed tamper-evident watermarks so blatant copies are traceable, and leave a legal evidence trail. Deterrence and provenance, not a guarantee. The whole tool is built around being honest about that.

---

## Honest first (this is the tool's identity)

**Copying cannot be made impossible.** To render a page, the browser must receive the HTML, CSS, and JS, so "make it uncopyable" is physically out of reach.

What this tool actually does, in three parts:

1. **Raises the cost of copying.** Source map removal, a logic-isolation audit, optional obfuscation.
2. **Makes blatant copies traceable.** Hard-to-strip, redundantly distributed watermarks with a tracking ID.
3. **Leaves a legal trail.** Proprietary license, TDM opt-out, integrity hashes, timestamps, a DMCA draft.

Deterrence and a record, not a warranty. Every layer below is labeled with a blunt effectiveness rating.

---

## Quick start

```bash
# install (either one)
npx ai-clone-shield <command>     # no install
npm i -g ai-clone-shield          # then: aishield <command>

# in your project folder
aishield detect                   # detect stack + build output
aishield init                     # create aishield.config.json, then fill owner
npm run build                     # build (output is required)
aishield apply                    # apply protection (default: balanced)
aishield verify                   # confirm nothing broke (if broken: aishield restore)
# then deploy
```

Fill `owner.name / domain / contact` in `aishield.config.json`. These identify your watermark and legal notice (leaving them blank weakens traceability). They are public identifiers, not secrets.

---

## Commands

| Command | What it does |
|---|---|
| `aishield detect` | Detect stack and build output directory |
| `aishield init` | Create config (`--preset light\|balanced\|max`) |
| `aishield apply` | Apply protection layers (`--dry` preview, `--preset`) |
| `aishield verify` | Verify functionality is intact (`--url <URL>` for real render check) |
| `aishield watermark-check <file>` | Extract and match your watermark from a suspect copy (`--url <URL>`) |
| `aishield evidence-pack` | Build a dispute evidence bundle |
| `aishield restore` | Roll back to the last backup (`--from <path>`) |

---

## Protection layers

Toggled by preset (`light` / `balanced` / `max`). Effectiveness is rated bluntly.

| | Layer | What | Effect | Limit |
|---|---|---|---|---|
| **A** | Code hardening | Strip source maps + `sourceMappingURL` + optional obfuscation | structure copy: **medium** | obfuscation is beaten by 2025 LLM deobfuscators; source map removal is the reliable part |
| **B** | Logic isolation audit | Scan client bundle for exposed secrets and risky patterns, recommend server moves | logic copy: **high** | cannot move code for you; audit and advice only |
| **C** | Watermark + integrity | Distributed zero-width watermark + meta + console banner + integrity hash + registry | tracking: **high** / tamper-block: **medium** | gone under rewrite ("rebuild it") copies; tracks verbatim copies |
| **D** | AI notice | HTML comment + meta (ai-policy/robots) + visually-hidden sr-only notice + `llms.txt` | **uncertain** | model-dependent, useless against human copying, a supporting layer |
| **E** | Legal evidence | robots (block AI crawlers, keep general ones) + `.well-known/tdmrep.json` + proprietary LICENSE + integrity manifest | litigation base: **high** | US needs registration, TDM opt-out holds within the EU, "no AI training" clause is untested |
| **F** | Function guard | Static check of injected tag closure, asset references, JS syntax after apply | regression guard | static only; deeper check via `verify --url` |
| **G** | Aggressive deterrents | Generate server bot-block / PoW (Anubis) config **guides** | **OFF by default** | hurts SEO (blocks search crawlers too), UA spoofing bypasses it; opt-in (`aggressiveOptIn`) only |

---

## When you find a copy

```bash
# extract and match your watermark from the suspect site
aishield watermark-check --url https://copycat.example/

# if it matches: build the evidence bundle (watermark, hashes, git, DMCA draft)
aishield evidence-pack
```

If `watermark-check` finds your watermark ID and it matches your registry, that page was copied verbatim from your original. `evidence-pack` bundles the proof (which ID was embedded and when, output hashes, git authorship history, OpenTimestamps proof, a DMCA draft).

---

## Safety

- **Backup and restore.** `apply` preserves originals in `.aishield-backup/` and tracks newly created files. `aishield restore` rolls back precisely (the evidence registry is kept). Backup paths are boundary-checked against path traversal.
- **Idempotent.** Applying twice does not stack duplicate watermarks or notices.
- **Function guard (F).** Detects whether apply broke the build and tells you to `restore`.
- **Aggressive layer off by default.** SEO and legally gray layers (G) require `aggressiveOptIn: true`.

---

## Honest limits (please read)

- **100% blocking is impossible.** Code exists in plaintext at runtime to render.
- **Obfuscation is reversible.** 2025 LLM-based deobfuscators recover much of it. It buys time.
- **Server-side logic is still open to black-box inference** with enough input/output samples.
- **Bots can ignore robots.txt.** Only compliant crawlers are filtered.
- **Watermarks do not survive a rewrite.** If an AI understands the feature and rebuilds it from scratch, nothing carries over.
- **AI notices are of uncertain effect**, dependent on the model and the AI vendor's policy.
- **Legal force varies by jurisdiction.** This tool is not legal advice.

You use it anyway to sharply reduce opportunistic copy-paste cloning, and to have the means to trace, prove, and respond when copying happens.

---

## FAQ

**Will AI be unable to copy my site?**
No. See "Honest limits." It raises the cost, makes verbatim copies traceable, and leaves evidence.

**Will my site break?**
The watermark, notice, and legal layers only touch HTML text nodes and meta, not JS logic. Only obfuscation (optional) changes JS. Run `aishield verify` after applying, and `aishield restore` if anything is off.

**Which stacks are supported?**
Any stack with a build output. The strongest defense (logic isolation) is most effective on server-capable stacks like Next.js.

**Do I need my own server or notification channel?**
No. There is no external server or infrastructure. Everything runs on build-output post-processing and local files.

---

## License

This skill pack itself is MIT. The LICENSE it generates **in your project** is proprietary (All Rights Reserved).

The bot list is based on [ai-robots-txt/ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt) and needs periodic updates.
