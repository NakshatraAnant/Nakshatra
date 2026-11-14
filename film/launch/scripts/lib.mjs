// Shared helpers for the launch-film scripts. Everything here talks to a LOCAL Nakshatra app only.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const { chromium, request } = require('playwright');

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const APP = process.env.NAKSHATRA_APP ?? 'http://localhost:4500';
export const SHOOT = resolve(ROOT, '.shoot'); // local, git-ignored: accounts, plates, frames

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(APP)) {
  throw new Error(`Refusing to run against ${APP}: the film scripts create sample accounts and only ever target a local app.`);
}

/** Headless Chromium with software WebGL, so the product's 3D scenes render without a GPU. */
export async function launchBrowser() {
  const system = '/opt/pw-browsers/chromium';
  const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(system) ? system : undefined);
  return chromium.launch({
    executablePath,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'],
  });
}

/** JSON API call carrying the CSRF double-submit header, on a Playwright APIRequestContext. */
export async function api(ctx, method, path, data) {
  const csrfOf = async () => (await ctx.storageState()).cookies.find((c) => c.name === 'nk_csrf')?.value;
  let csrf = await csrfOf();
  if (!csrf) { await ctx.get(`${APP}/api/v1/auth/csrf`); csrf = await csrfOf(); }
  const res = await ctx.fetch(`${APP}/api/v1/${path}`, { method, data, headers: { 'x-csrf-token': csrf ?? '' } });
  const text = await res.text();
  if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
