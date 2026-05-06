const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(ROOT, 'test-ha/theme-screenshots');
const REPORT_FILE = path.join(SCREENSHOT_DIR, 'report.json');
const TMP_SCRIPT = path.join(__dirname, '_theme_tmp.js');

const ALL_THEMES = [
  'Frosted Glass Dark Lite', 'Frosted Glass Dark',
  'Frosted Glass Light Lite', 'Frosted Glass Light',
  'Frosted Glass Lite', 'Frosted Glass',
  'Liquid Glass', 'apporo', 'Google Theme',
  'ios-light-mode-blue-red-alternative', 'ios-light-mode-blue-red',
  'ios-dark-mode-blue-red-alternative', 'ios-dark-mode-blue-red',
  'ios-light-mode-dark-blue-alternative', 'ios-light-mode-dark-blue',
  'ios-dark-mode-dark-blue-alternative', 'ios-dark-mode-dark-blue',
  'ios-light-mode-dark-green-alternative', 'ios-light-mode-dark-green',
  'ios-dark-mode-dark-green-alternative', 'ios-dark-mode-dark-green',
  'ios-light-mode-light-blue-alternative', 'ios-light-mode-light-blue',
  'ios-dark-mode-light-blue-alternative', 'ios-dark-mode-light-blue',
  'ios-light-mode-light-green-alternative', 'ios-light-mode-light-green',
  'ios-dark-mode-light-green-alternative', 'ios-dark-mode-light-green',
  'ios-light-mode-orange-alternative', 'ios-light-mode-orange',
  'ios-dark-mode-orange-alternative', 'ios-dark-mode-orange',
  'ios-light-mode-red-alternative', 'ios-light-mode-red',
  'ios-dark-mode-red-alternative', 'ios-dark-mode-red',
  'Metro Red', 'Fluent Red', 'Metro Blue', 'Fluent Blue',
  'Metro Green', 'Fluent Green', 'Metro Orange', 'Fluent Orange',
  'Metro Purple', 'Fluent Purple', 'Metro Slate', 'Fluent Slate',
  'visionos', 'Woow', 'Woow Dual Blue'
];

const THEMES_WITH_MODES = [
  'Frosted Glass Dark Lite', 'Frosted Glass Dark',
  'Frosted Glass Light Lite', 'Frosted Glass Light',
  'Frosted Glass Lite', 'Frosted Glass',
  'Liquid Glass', 'apporo', 'Google Theme',
  'Metro Red', 'Fluent Red', 'Metro Blue', 'Fluent Blue',
  'Metro Green', 'Fluent Green', 'Metro Orange', 'Fluent Orange',
  'Metro Purple', 'Fluent Purple', 'Metro Slate', 'Fluent Slate',
  'visionos', 'Woow', 'Woow Dual Blue'
];

const CSS_VARS = [
  '--primary-background-color', '--primary-text-color',
  '--secondary-background-color', '--divider-color',
  '--card-background-color', '--primary-color',
  '--text-primary-color', '--secondary-text-color',
  '--app-header-background-color', '--app-header-text-color',
  '--error-color', '--header-height'
];

function safeName(n) { return n.replace(/[^a-zA-Z0-9_-]/g, '_'); }

function pwcli(cmd, timeout = 20000) {
  try {
    return execSync(`npx playwright-cli ${cmd}`, { timeout, cwd: ROOT, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
  } catch(e) { return e.stdout || e.stderr || e.message; }
}

function setThemeAndCapture(themeName, mode) {
  const escapedName = themeName.replace(/'/g, "\\'");
  const modeStr = mode ? `, mode: '${mode}'` : '';
  const script = `async page => {
  const r = await page.evaluate(async () => {
    const ha = document.querySelector('home-assistant');
    if (!ha || !ha.hass) return {error:'no_hass'};
    await ha.hass.callService('frontend', 'set_theme', { name: '${escapedName}'${modeStr} });
    await new Promise(r => setTimeout(r, 2000));
    const vars = ${JSON.stringify(CSS_VARS)};
    const s = getComputedStyle(ha);
    const res = {};
    for (const v of vars) res[v] = s.getPropertyValue(v).trim();
    // Also capture actual rendered element colors
    function findCE(root) {
      if (!root) return null;
      const el = root.querySelector('config-editor-fullpage');
      if (el) return el;
      for (const h of root.querySelectorAll('*')) {
        if (h.shadowRoot) { const f = findCE(h.shadowRoot); if (f) return f; }
      }
      return null;
    }
    const ce = findCE(document);
    if (ce && ce.shadowRoot) {
      const tb = ce.shadowRoot.querySelector('.toolbar');
      const st = ce.shadowRoot.querySelector('.status');
      if (tb) res['_toolbar_bg'] = getComputedStyle(tb).backgroundColor;
      if (st) res['_status_bg'] = getComputedStyle(st).backgroundColor;
      res['_host_bg'] = getComputedStyle(ce).backgroundColor;
      res['_host_color'] = getComputedStyle(ce).color;
    }
    return res;
  });
  return r;
}`;
  fs.writeFileSync(TMP_SCRIPT, script);
  const out = pwcli(`run-code --filename=${TMP_SCRIPT}`, 25000);
  // Parse JSON result
  const match = out.match(/### Result\n([\s\S]*?)(?:\n###|$)/);
  if (match) {
    try { return JSON.parse(match[1].trim()); } catch(e) {}
  }
  // Fallback: find JSON object
  const jsonMatch = out.match(/\{[^{}]*"--primary[^{}]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch(e) {}
  }
  console.error('  ⚠ Parse failed for output:', out.substring(0, 200));
  return { error: 'parse_failed' };
}

function screenshot(filename) {
  const fp = path.join(SCREENSHOT_DIR, filename);
  pwcli(`screenshot --filename="${fp}"`, 10000);
  return fs.existsSync(fp);
}

// ============ MAIN ============
console.log('╔══════════════════════════════════════════╗');
console.log('║  Woow_ha_theme Visual Test Suite         ║');
console.log('║  Testing ' + ALL_THEMES.length + ' themes + light/dark modes     ║');
console.log('╚══════════════════════════════════════════╝\n');

// Baseline
console.log('📌 Capturing baseline (default theme)...');
const baseline = setThemeAndCapture('default');
screenshot('00-default-theme.png');
console.log('  Baseline:', JSON.stringify(baseline, null, 2).substring(0, 200), '\n');

const results = [];

// Phase 1: All themes
console.log('═══ Phase 1: All Themes ═══\n');
for (let i = 0; i < ALL_THEMES.length; i++) {
  const theme = ALL_THEMES[i];
  const idx = String(i + 1).padStart(2, '0');
  const safe = safeName(theme);
  const file = `${idx}-${safe}.png`;

  process.stdout.write(`[${idx}/${ALL_THEMES.length}] ${theme.padEnd(45)}`);

  const css = setThemeAndCapture(theme);
  const ok = screenshot(file);

  const changed = CSS_VARS.filter(k => css[k] && baseline[k] && css[k] !== baseline[k]);
  const pass = changed.length >= 1;

  results.push({
    index: i + 1, theme, screenshot: file, cssValues: css,
    changedFromDefault: changed.length, changedVars: changed,
    pass, screenshotOk: ok
  });

  console.log(` ${pass ? '✅' : '⚠️'}  ${changed.length} vars | BG=${css['--primary-background-color'] || '?'}`);
}

// Phase 2: Light/Dark
console.log('\n═══ Phase 2: Light/Dark Mode Tests ═══\n');
const lightDarkResults = [];

for (let i = 0; i < THEMES_WITH_MODES.length; i++) {
  const theme = THEMES_WITH_MODES[i];
  const safe = safeName(theme);

  process.stdout.write(`[${i+1}/${THEMES_WITH_MODES.length}] ${theme.padEnd(35)}`);

  // Dark
  const darkCSS = setThemeAndCapture(theme, 'dark');
  screenshot(`dark-${safe}.png`);

  // Light
  const lightCSS = setThemeAndCapture(theme, 'light');
  screenshot(`light-${safe}.png`);

  const modeChanges = CSS_VARS.filter(k => darkCSS[k] && lightCSS[k] && darkCSS[k] !== lightCSS[k]);
  const supported = modeChanges.length > 0;

  lightDarkResults.push({
    theme,
    darkBg: darkCSS['--primary-background-color'] || 'N/A',
    lightBg: lightCSS['--primary-background-color'] || 'N/A',
    darkCSS, lightCSS,
    varsChangedBetweenModes: modeChanges.length,
    changedVars: modeChanges,
    modeSupported: supported
  });

  console.log(` ${supported ? '🌗' : '⚪'} D:${darkCSS['--primary-background-color']||'?'} L:${lightCSS['--primary-background-color']||'?'} (${modeChanges.length} diff)`);
}

// Reset
setThemeAndCapture('default');

// Save report
const report = {
  timestamp: new Date().toISOString(),
  totalThemes: ALL_THEMES.length,
  themesWithModes: THEMES_WITH_MODES.length,
  baseline,
  results,
  lightDarkResults
};
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

// Summary
const passed = results.filter(r => r.pass);
const modeSupported = lightDarkResults.filter(r => r.modeSupported);
const totalScreenshots = ALL_THEMES.length + THEMES_WITH_MODES.length * 2 + 1;

console.log('\n╔══════════════════════════════════════════╗');
console.log('║           TEST SUMMARY                   ║');
console.log('╠══════════════════════════════════════════╣');
console.log(`║ Themes tested:       ${String(ALL_THEMES.length).padStart(3)} / ${ALL_THEMES.length}              ║`);
console.log(`║ Themes PASS (≥1):    ${String(passed.length).padStart(3)} / ${ALL_THEMES.length}              ║`);
console.log(`║ L/D mode supported:  ${String(modeSupported.length).padStart(3)} / ${THEMES_WITH_MODES.length}              ║`);
console.log(`║ Screenshots taken:   ${String(totalScreenshots).padStart(3)}                    ║`);
console.log('╚══════════════════════════════════════════╝');

// Cleanup
try { fs.unlinkSync(TMP_SCRIPT); } catch(e) {}
try { fs.unlinkSync(path.join(SCREENSHOT_DIR, 'test-woow.png')); } catch(e) {}

console.log(`\nReport: ${REPORT_FILE}`);
