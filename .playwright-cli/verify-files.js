async (page) => {
  // First navigate to HA to get login page
  await page.goto('http://localhost:15130/', { waitUntil: 'load', timeout: 10000 });
  await page.waitForTimeout(2000);

  // Check if we need to login
  const needsLogin = await page.evaluate(() => {
    return !localStorage.getItem('hassTokens') || window.location.href.includes('auth');
  });

  if (needsLogin) {
    // Login via the form
    await page.waitForSelector('ha-authorize', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Fill login form in shadow DOM
    const loggedIn = await page.evaluate(async () => {
      let root = document.querySelector('ha-authorize');
      if (!root?.shadowRoot) return false;
      let form = root.shadowRoot.querySelector('ha-auth-flow');
      if (!form?.shadowRoot) return false;
      let step = form.shadowRoot.querySelector('ha-local-auth-flow');
      if (!step?.shadowRoot) return false;
      let inputs = step.shadowRoot.querySelectorAll('ha-textfield');
      if (inputs.length < 2) {
        inputs = step.shadowRoot.querySelectorAll('input');
      }
      return { found: inputs.length, html: step.shadowRoot.innerHTML.substring(0, 500) };
    });
    console.log('Login form:', JSON.stringify(loggedIn));
  }

  // Try navigate to config editor
  await page.goto('http://localhost:15130/config-editor/0', { waitUntil: 'load', timeout: 15000 });
  await page.waitForTimeout(10000);

  // Check if component loaded
  const result = await page.evaluate(() => {
    let el = document.querySelector('home-assistant');
    if (!el?.shadowRoot) return { step: 'home-assistant', error: true };
    el = el.shadowRoot.querySelector('home-assistant-main');
    if (!el?.shadowRoot) return { step: 'main', error: true };
    el = el.shadowRoot.querySelector('ha-panel-lovelace');
    if (!el?.shadowRoot) return { step: 'lovelace', error: true, url: window.location.href };
    el = el.shadowRoot.querySelector('hui-root');
    if (!el?.shadowRoot) return { step: 'hui-root', error: true };
    el = el.shadowRoot.querySelector('hui-panel-view');
    if (!el?.shadowRoot) return { step: 'panel-view', error: true };
    el = el.shadowRoot.querySelector('config-editor-fullpage');
    if (!el?.shadowRoot) return { step: 'config-editor', error: true };

    const select = el.shadowRoot.querySelector('.file-select');
    const options = select ? Array.from(select.options).map(o => o.value).filter(v => v) : [];

    return {
      ok: true,
      depth: el.edit?.depth,
      fileCount: options.length,
      files: options.sort(),
      hasSave: typeof el.Save === 'function',
      hasPrompt: el.Save.toString().includes('prompt('),
      readonly: el.edit?.readonly
    };
  });

  if (result.error) {
    console.log('Component not loaded. Stuck at: ' + result.step + ', URL: ' + (result.url || page.url()));
  } else {
    console.log('=== depth=' + result.depth + ' | files=' + result.fileCount + ' ===');
    if (result.files) result.files.forEach((f,i) => console.log((i+1) + '. ' + f));
    console.log('Save=' + result.hasSave + ' Prompt=' + result.hasPrompt + ' Readonly=' + result.readonly);
  }

  await page.screenshot({ path: '.playwright-cli/verify-filelist.png', fullPage: true });
  console.log('Screenshot saved');
}
