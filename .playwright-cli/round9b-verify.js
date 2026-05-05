async page => {
  const FEC = `(function() { function find(root) { if (!root) return null; const el = root.querySelector("config-editor-fullpage"); if (el) return el; for (const h of root.querySelectorAll("*")) { if (h.shadowRoot) { const f = find(h.shadowRoot); if (f) return f; } } return null; } return find(document); })()`;

  await page.evaluate(() => { window.confirm = () => true; window.alert = () => {}; });

  // Check what ext is set to
  const state = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    return { ext: el.edit ? el.edit.ext : null, depth: el.edit ? el.edit.depth : null };
  }, FEC);

  // Reset ext to yaml and try list/load
  const result = await page.evaluate(async (fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    // Reset to yaml
    el.edit.ext = "yaml";
    el.edit.depth = 3;

    const listData = await el.cmd("list", "", "");
    const loadData = await el.cmd("load", "", "configuration.yaml");

    return {
      ext: el.edit.ext,
      listCount: Array.isArray(listData) ? listData.length : 0,
      listData: Array.isArray(listData) ? listData.slice(0, 5) : listData,
      loadLen: loadData ? loadData.length : 0,
      loadPreview: loadData ? loadData.substring(0, 80) : null
    };
  }, FEC);

  return JSON.stringify({ state, result }, null, 2);
}
