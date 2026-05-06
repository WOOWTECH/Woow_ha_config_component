async page => {
  const result = await page.evaluate(async () => {
    const haEl = document.querySelector('home-assistant');
    if (!haEl || !haEl.hass) return { error: 'no hass object' };

    // Set theme
    await haEl.hass.callService('frontend', 'set_theme', { name: 'Woow' });

    // Wait for CSS to propagate
    await new Promise(r => setTimeout(r, 2000));

    // Capture CSS vars
    const vars = [
      '--primary-background-color',
      '--primary-text-color',
      '--secondary-background-color',
      '--primary-color',
      '--app-header-background-color'
    ];

    const style = getComputedStyle(haEl);
    const res = {};
    for (const v of vars) {
      res[v] = style.getPropertyValue(v).trim();
    }
    return res;
  });
  return result;
}
