async page => {
  const result = await page.evaluate(() => {
    function find(root) {
      if (!root) return null;
      const el = root.querySelector("config-editor-fullpage");
      if (el) return el;
      for (const h of root.querySelectorAll("*")) {
        if (h.shadowRoot) { const f = find(h.shadowRoot); if (f) return f; }
      }
      return null;
    }
    const el = find(document);
    if (!el || !el.shadowRoot) return "not found";
    const btns = el.shadowRoot.querySelectorAll("button");
    return Array.from(btns).map(b => b.textContent.trim());
  });
  return JSON.stringify(result);
}
