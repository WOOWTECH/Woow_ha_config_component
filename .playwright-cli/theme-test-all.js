const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.resolve(__dirname, '../test-ha/theme-screenshots');
const REPORT_FILE = path.join(SCREENSHOT_DIR, 'report.json');

// All themes (excluding "Common Base" internal themes)
const THEMES = [
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
  'Metro Red', 'Fluent Red',
  'Metro Blue', 'Fluent Blue',
  'Metro Green', 'Fluent Green',
  'Metro Orange', 'Fluent Orange',
  'Metro Purple', 'Fluent Purple',
  'Metro Slate', 'Fluent Slate',
  'visionos', 'Woow', 'Woow Dual Blue'
];

const CSS_VARS = [
  '--primary-background-color',
  '--primary-text-color',
  '--secondary-background-color',
  '--divider-color',
  '--card-background-color',
  '--primary-color',
  '--text-primary-color',
  '--secondary-text-color',
  '--app-header-background-color',
  '--app-header-text-color',
  '--error-color',
  '--header-height'
];

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function runPwcli(cmd, timeout = 15000) {
  try {
    return execSync(`npx playwright-cli ${cmd}`, {
      timeout,
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (e) {
    return e.stdout || e.message;
  }
}

function runEval(jsCode, timeout = 15000) {
  // Escape for shell - use a temp file approach for reliability
  const tmpFile = path.join(__dirname, '_eval_tmp.js');
  fs.writeFileSync(tmpFile, jsCode);
  const result = runPwcli(`run-code --filename=${tmpFile}`, timeout);
  try { fs.unlinkSync(tmpFile); } catch(e) {}
  return result;
}

function captureCSS() {
  const js = `async page => {
    const vars = ${JSON.stringify(CSS_VARS)};
    const result = {};

    // Read from the HA element where theme vars are set
    const haEl = document.querySelector('home-assistant');
    const rootStyle = haEl ? getComputedStyle(haEl) : getComputedStyle(document.documentElement);

    for (const v of vars) {
      result[v] = rootStyle.getPropertyValue(v).trim();
    }

    // Also try to read computed colors from config editor elements
    function findConfigEditor(root) {
      if (!root) return null;
      const el = root.querySelector('config-editor-fullpage');
      if (el) return el;
      for (const h of root.querySelectorAll('*')) {
        if (h.shadowRoot) {
          const f = findConfigEditor(h.shadowRoot);
          if (f) return f;
        }
      }
      return null;
    }

    const ce = findConfigEditor(document);
    if (ce && ce.shadowRoot) {
      const toolbar = ce.shadowRoot.querySelector('.toolbar');
      const status = ce.shadowRoot.querySelector('.status');
      if (toolbar) result['_toolbar_bg'] = getComputedStyle(toolbar).backgroundColor;
      if (status) result['_status_bg'] = getComputedStyle(status).backgroundColor;
      result['_host_bg'] = getComputedStyle(ce).backgroundColor;
      result['_host_color'] = getComputedStyle(ce).color;
    }

    return JSON.stringify(result);
  }`;
  const output = runEval(js);
  // Extract JSON from the output
  const match = output.match(/\{[^{}]*("[^"]*":\s*"[^"]*"[,\s]*)*[^{}]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch(e) {}
  }
  // Try to find JSON between result markers
  const jsonMatch = output.match(/"result":\s*"({.*?})"/s);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1].replace(/\\"/g, '"')); } catch(e) {}
  }
  console.error('  Failed to parse CSS output');
  return {};
}

function setTheme(themeName, mode) {
  const modeArg = mode ? `, mode: '${mode}'` : '';
  const js = `async page => {
    const haEl = document.querySelector('home-assistant');
    if (haEl && haEl.hass) {
      await haEl.hass.callService('frontend', 'set_theme', { name: '${themeName.replace(/'/g, "\\'")}'${modeArg} });
      return 'theme_set';
    }
    return 'no_hass';
  }`;
  return runEval(js);
}

function takeScreenshot(filename) {
  const filepath = path.join(SCREENSHOT_DIR, filename);
  runPwcli(`screenshot --filename="${filepath}"`, 10000);
  return filepath;
}

// Main execution
console.log('=== Woow_ha_theme Visual Test ===');
console.log(`Testing ${THEMES.length} themes`);
console.log(`Screenshots dir: ${SCREENSHOT_DIR}\n`);

// Step 1: Baseline
console.log('Capturing baseline (default theme)...');
setTheme('default');
const delay = ms => { const end = Date.now() + ms; while (Date.now() < end) {} };
delay(2000);
const baseline = captureCSS();
console.log('Baseline CSS:', JSON.stringify(baseline, null, 2));

const results = [];
const lightDarkResults = [];

// Step 2: Test each theme
for (let i = 0; i < THEMES.length; i++) {
  const theme = THEMES[i];
  const idx = String(i + 1).padStart(2, '0');
  const safe = safeName(theme);

  console.log(`\n[${idx}/${THEMES.length}] Testing: ${theme}`);

  // Apply theme
  const setResult = setTheme(theme);
  delay(2000);

  // Capture CSS
  const cssValues = captureCSS();

  // Screenshot
  const screenshotFile = `${idx}-${safe}.png`;
  takeScreenshot(screenshotFile);

  // Compare with baseline
  const changed = CSS_VARS.filter(k => cssValues[k] && baseline[k] && cssValues[k] !== baseline[k]);

  results.push({
    index: i + 1,
    theme,
    screenshot: screenshotFile,
    cssValues,
    changedFromDefault: changed.length,
    changedVars: changed
  });

  console.log(`  Changed CSS vars: ${changed.length}/${CSS_VARS.length}`);
  console.log(`  Primary BG: ${cssValues['--primary-background-color'] || 'N/A'}`);
  console.log(`  Screenshot: ${screenshotFile}`);
}

// Step 3: Light/Dark mode test for themes with modes support
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

console.log(`\n\n=== Light/Dark Mode Tests (${THEMES_WITH_MODES.length} themes) ===\n`);

for (let i = 0; i < THEMES_WITH_MODES.length; i++) {
  const theme = THEMES_WITH_MODES[i];
  const safe = safeName(theme);
  console.log(`[${i + 1}/${THEMES_WITH_MODES.length}] L/D: ${theme}`);

  // Dark mode
  setTheme(theme, 'dark');
  delay(2000);
  const darkCSS = captureCSS();
  takeScreenshot(`dark-${safe}.png`);

  // Light mode
  setTheme(theme, 'light');
  delay(2000);
  const lightCSS = captureCSS();
  takeScreenshot(`light-${safe}.png`);

  const modeChanges = CSS_VARS.filter(k => darkCSS[k] && lightCSS[k] && darkCSS[k] !== lightCSS[k]);

  lightDarkResults.push({
    theme,
    darkBg: darkCSS['--primary-background-color'] || 'N/A',
    lightBg: lightCSS['--primary-background-color'] || 'N/A',
    darkCSS,
    lightCSS,
    varsChangedBetweenModes: modeChanges.length,
    changedVars: modeChanges,
    modeSupported: modeChanges.length > 0
  });

  console.log(`  Dark BG: ${darkCSS['--primary-background-color'] || 'N/A'}`);
  console.log(`  Light BG: ${lightCSS['--primary-background-color'] || 'N/A'}`);
  console.log(`  Mode diff: ${modeChanges.length} vars changed`);
}

// Step 4: Reset to default
console.log('\nResetting to default theme...');
setTheme('default');
delay(1000);

// Step 5: Save report
const report = {
  timestamp: new Date().toISOString(),
  totalThemes: THEMES.length,
  themesWithModes: THEMES_WITH_MODES.length,
  baseline,
  results,
  lightDarkResults
};

fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
console.log(`\nReport saved to: ${REPORT_FILE}`);

// Summary
const passed = results.filter(r => r.changedFromDefault >= 3);
const modeSupported = lightDarkResults.filter(r => r.modeSupported);
console.log(`\n=== SUMMARY ===`);
console.log(`Themes tested: ${THEMES.length}`);
console.log(`Themes with ≥3 CSS vars changed: ${passed.length}/${THEMES.length}`);
console.log(`Themes with L/D mode support: ${modeSupported.length}/${THEMES_WITH_MODES.length}`);
console.log(`Total screenshots: ${THEMES.length + THEMES_WITH_MODES.length * 2 + 1}`);
