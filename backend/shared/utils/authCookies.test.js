// Run: node shared/utils/authCookies.test.js   (from backend/)
// Guards the cross-site cookie pairing. SameSite=None without Secure is silently
// dropped by browsers, which breaks every cross-origin API call from the Vercel frontend.
import { spawnSync } from "node:child_process";
import assert from "node:assert";

const probe = (env) => {
  const run = spawnSync(
    process.execPath,
    [
      "-e",
      `import('./shared/utils/authCookies.js').then((m) => {
         const captured = {};
         m.setAuthCookies({ cookie: (name, _v, opts) => { captured[name] = opts; } }, 'delivery', { accessToken: 'x' });
         console.log(JSON.stringify(captured.delivery_access_token));
       });`,
    ],
    { env: { ...process.env, ...env }, encoding: "utf8", cwd: process.cwd() },
  );
  if (!run.stdout.trim()) throw new Error(`probe failed: ${run.stderr}`);
  return JSON.parse(run.stdout);
};

const crossSite = probe({ CROSS_SITE_COOKIES: "true" });
assert.strictEqual(crossSite.sameSite, "none", "cross-site auth needs SameSite=None");
assert.strictEqual(crossSite.secure, true, "SameSite=None is rejected without Secure");

const localDev = probe({ CROSS_SITE_COOKIES: "false" });
assert.strictEqual(localDev.sameSite, "lax");
assert.strictEqual(localDev.secure, false, "http://localhost cannot set Secure cookies");

console.log("authCookies: ok");
