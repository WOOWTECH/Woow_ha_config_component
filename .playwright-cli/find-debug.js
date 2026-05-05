async page => {
  // Wait for full load
  await page.waitForTimeout(8000);

  const result = await page.evaluate(() => {
    function find(root, depth) {
      if (!root || depth > 10) return null;
      const el = root.querySelector("config-editor-fullpage");
      if (el) return { found: true, depth };
      for (const h of root.querySelectorAll("*")) {
        if (h.shadowRoot) {
          const f = find(h.shadowRoot, depth + 1);
          if (f) return f;
        }
      }
      return null;
    }
    const r = find(document, 0);
    if (r) return r;

    // Debug: list all custom elements with shadow roots
    const customs = [];
    function scan(root, d) {
      if (!root || d > 5) return;
      for (const h of root.querySelectorAll("*")) {
        if (h.shadowRoot) {
          customs.push({ tag: h.tagName.toLowerCase(), depth: d });
          scan(h.shadowRoot, d + 1);
        }
      }
    }
    scan(document, 0);
    return { found: false, customElements: customs.slice(0, 30) };
  });
  return JSON.stringify(result, null, 2);
}
