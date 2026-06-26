'use strict';
// 스택 자동 감지: 어떤 프로젝트든 받아 적용 경로를 결정한다.
const fs = require('fs');
const path = require('path');
const { exists, readJsonSafe } = require('./util');

function listEntries(root) {
  try { return fs.readdirSync(root); } catch { return []; }
}

function detectStack(root) {
  const pkg = readJsonSafe(path.join(root, 'package.json')) || {};
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const has = n => Object.prototype.hasOwnProperty.call(deps, n);
  const files = listEntries(root);
  const hasFile = re => files.some(f => re.test(f));

  let stack = 'unknown';
  let framework = 'Unknown / 범용';
  let hasServer = false;
  let integration = 'post-build';
  const buildCandidates = [];

  if (has('next') || hasFile(/^next\.config\./)) {
    stack = 'next'; framework = 'Next.js'; hasServer = true; integration = 'next';
    buildCandidates.push('.next', 'out');
  } else if (has('@sveltejs/kit')) {
    stack = 'sveltekit'; framework = 'SvelteKit'; hasServer = true; integration = 'post-build';
    buildCandidates.push('build', '.svelte-kit');
  } else if (has('nuxt') || has('nuxt3')) {
    stack = 'nuxt'; framework = 'Nuxt'; hasServer = true; integration = 'post-build';
    buildCandidates.push('.output', 'dist');
  } else if (has('astro')) {
    stack = 'astro'; framework = 'Astro'; integration = 'post-build';
    buildCandidates.push('dist');
  } else if (has('@remix-run/react') || has('@remix-run/node')) {
    stack = 'remix'; framework = 'Remix'; hasServer = true; integration = 'post-build';
    buildCandidates.push('build', 'public/build');
  } else if (has('vite') || hasFile(/^vite\.config\./)) {
    stack = 'vite'; framework = 'Vite'; integration = 'vite';
    buildCandidates.push('dist');
  } else if (has('react-scripts')) {
    stack = 'cra'; framework = 'Create React App'; integration = 'post-build';
    buildCandidates.push('build');
  } else if (has('@angular/core') || hasFile(/^angular\.json$/)) {
    stack = 'angular'; framework = 'Angular'; integration = 'post-build';
    buildCandidates.push('dist');
  } else if (has('vue')) {
    stack = 'vue'; framework = 'Vue'; integration = 'post-build';
    buildCandidates.push('dist');
  } else if (hasFile(/^index\.html$/)) {
    stack = 'static'; framework = '정적 HTML'; integration = 'post-build';
    buildCandidates.push('.', 'public', '_site', 'dist');
  }

  // 실제 존재하는 빌드 산출물 디렉토리 탐색(없으면 빌드 후 다시 감지)
  const allCandidates = [...buildCandidates, 'dist', 'build', 'out', 'public', '_site'];
  let buildDir = null;
  for (const cand of allCandidates) {
    const full = path.join(root, cand);
    if (exists(full) && exists(path.join(full, 'index.html'))) { buildDir = cand; break; }
  }
  if (!buildDir) {
    for (const cand of allCandidates) {
      if (exists(path.join(root, cand)) && cand !== '.') { buildDir = cand; break; }
    }
  }

  // 후처리만으로 닿는 스택 vs 빌드 통합이 더 강한 스택 구분(정직 고지용)
  const nativeIsolation = stack === 'next' || stack === 'vite';

  return {
    stack, framework, hasServer, integration, buildDir, buildCandidates,
    nativeIsolation,
    hasPackageJson: exists(path.join(root, 'package.json')),
  };
}

module.exports = { detectStack };
