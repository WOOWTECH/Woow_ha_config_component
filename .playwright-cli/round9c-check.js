async page => {
  const FEC = `(function() { function find(root) { if (!root) return null; const el = root.querySelector("config-editor-fullpage"); if (el) return el; for (const h of root.querySelectorAll("*")) { if (h.shadowRoot) { const f = find(h.shadowRoot); if (f) return f; } } return null; } return find(document); })()`;

  await page.evaluate(() => { window.confirm = () => true; });

  const result = await page.evaluate(async (fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    el.edit.ext = "yaml";
    el.edit.depth = 3;

    try {
      const listData = await el.cmd("list", "", "");
      const loadData = await el.cmd("load", "", "configuration.yaml");
      return {
        listType: typeof listData,
        listIsArray: Array.isArray(listData),
        listLen: Array.isArray(listData) ? listData.length : JSON.stringify(listData).length,
        listSample: Array.isArray(listData) ? listData.slice(0, 3) : JSON.stringify(listData).substring(0, 100),
        loadType: typeof loadData,
        loadSample: typeof loadData === "string" ? loadData.substring(0, 50) : JSON.stringify(loadData).substring(0, 100)
      };
    } catch (e) {
      return { error: e.message };
    }
  }, FEC);
  return JSON.stringify(result, null, 2);
}
