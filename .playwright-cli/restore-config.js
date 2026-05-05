async page => {
  const FEC = `(function() { function find(root) { if (!root) return null; const el = root.querySelector("config-editor-fullpage"); if (el) return el; for (const h of root.querySelectorAll("*")) { if (h.shadowRoot) { const f = find(h.shadowRoot); if (f) return f; } } return null; } return find(document); })()`;
  await page.evaluate(() => { window.confirm = () => true; });
  const result = await page.evaluate(async (fec) => {
    const el = eval(fec);
    if (!el) return { error: "not found" };
    const content = "# Loads default set of integrations. Do not remove.\ndefault_config:\n\nconfig_editor:\n\nlovelace:\n  mode: storage\n";
    const r = await el.cmd("save", content, "configuration.yaml");
    return { saved: true, msg: r ? r.msg : null };
  }, FEC);
  return JSON.stringify(result);
}
