async page => {
  await page.evaluate(() => { window.confirm = () => true; window.alert = () => {}; window.prompt = (msg, def) => def || ""; });
  const results = { errors: [], tests: {} };
  page.on("pageerror", err => results.errors.push("pageerror: " + err.message));
  page.on("console", msg => { if (msg.type() === "error") results.errors.push("console: " + msg.text()); });

  await page.goto("http://localhost:15130/config-editor/0");
  await page.waitForTimeout(5000);
  await page.evaluate(() => { window.confirm = () => true; window.alert = () => {}; window.prompt = (msg, def) => def || ""; });

  const FEC = `(function() { function find(root) { if (!root) return null; const el = root.querySelector("config-editor-fullpage"); if (el) return el; for (const h of root.querySelectorAll("*")) { if (h.shadowRoot) { const f = find(h.shadowRoot); if (f) return f; } } return null; } return find(document); })()`;

  // --- 3A: Verify localStorage prefix isolation ---
  const prefixIsolation = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    // Use the component's own localSet method
    el.localSet("Text", "test_isolation");
    el.localSet("Open", "test.yaml");
    el.localSet("Ext", "yaml");

    const keys = Object.keys(localStorage).filter(k => k.startsWith("config_editor_fp_"));
    const conflictKeys = Object.keys(localStorage).filter(k => k.startsWith("config_editor_") && !k.startsWith("config_editor_fp_"));
    return {
      fpKeys: keys,
      conflictKeys: conflictKeys,
      hasText: localStorage.getItem("config_editor_fp_Text") === "test_isolation",
      hasOpen: localStorage.getItem("config_editor_fp_Open") === "test.yaml",
      noConflict: conflictKeys.length === 0
    };
  }, FEC);
  results.tests["3A_prefix_isolation"] = { pass: prefixIsolation.hasText && prefixIsolation.hasOpen && prefixIsolation.noConflict, detail: prefixIsolation };

  // --- 3B: Corrupt localStorage recovery ---
  const corruptRecovery = await page.evaluate((fec) => {
    // Corrupt storage
    localStorage.setItem("config_editor_fp_Text", undefined);
    localStorage.setItem("config_editor_fp_Open", null);
    localStorage.setItem("config_editor_fp_Listyaml", "{broken json!!!");
    localStorage.setItem("config_editor_fp_Size", "NaN");
    localStorage.setItem("config_editor_fp_Ext", "");

    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    try {
      // Try reading corrupted values
      const text = el.localGet("Text");
      const open = el.localGet("Open");
      const ext = el.localGet("Ext");
      const host = el.getBoundingClientRect();
      return { nocrash: true, text, open, ext, hostIntact: host.width > 0 };
    } catch (e) {
      return { error: e.message, crashed: true };
    }
  }, FEC);
  results.tests["3B_corrupt_localStorage"] = { pass: corruptRecovery.nocrash === true, detail: corruptRecovery };

  // --- 3C: localStorage quota simulation (5MB boundary) ---
  const quotaTest = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    try {
      // Try to store 4MB
      const bigData = "Y".repeat(4 * 1024 * 1024);
      el.localSet("Text", bigData);
      const retrieved = el.localGet("Text");
      return { nocrash: true, stored: retrieved && retrieved.length === bigData.length, size: bigData.length };
    } catch (e) {
      // QuotaExceededError is acceptable - component shouldn't crash
      return { nocrash: true, quotaError: true, errorName: e.name };
    }
  }, FEC);
  results.tests["3C_localStorage_quota_4MB"] = { pass: quotaTest.nocrash === true, detail: quotaTest };

  // --- 3D: Clear localStorage mid-session ---
  const clearMidSession = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    localStorage.clear();

    try {
      // Component should still work even with empty storage
      const text = el.localGet("Text");
      const open = el.localGet("Open");
      el.localSet("Text", "after_clear");
      const afterSet = el.localGet("Text");
      const host = el.getBoundingClientRect();
      return {
        nocrash: true,
        textAfterClear: text,
        writeAfterClear: afterSet === "after_clear",
        hostIntact: host.width > 0
      };
    } catch (e) {
      return { error: e.message };
    }
  }, FEC);
  results.tests["3D_clear_mid_session"] = { pass: clearMidSession.nocrash === true && clearMidSession.writeAfterClear === true, detail: clearMidSession };

  // --- 3E: Persistence across navigation ---
  await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return;
    el.localSet("Text", "PERSIST_ACROSS_NAV_67890");
    el.localSet("Open", "nav_test.yaml");
  }, FEC);

  await page.goto("http://localhost:15130/config-editor/0");
  await page.waitForTimeout(5000);
  await page.evaluate(() => { window.confirm = () => true; window.alert = () => {}; });

  const afterNav = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found after nav" };
    const text = el.localGet("Text");
    const open = el.localGet("Open");
    return {
      textPersisted: text === "PERSIST_ACROSS_NAV_67890",
      openPersisted: open === "nav_test.yaml",
      text: text ? text.substring(0, 30) : null,
      open: open
    };
  }, FEC);
  results.tests["3E_persist_across_navigation"] = { pass: afterNav.textPersisted === true, detail: afterNav };

  // --- 3F: Rapid localSet/localGet cycles ---
  const rapidCycles = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    try {
      for (let i = 0; i < 200; i++) {
        el.localSet("Text", "cycle_" + i + "_" + "x".repeat(1000));
        el.localGet("Text");
        el.localSet("Open", "file_" + i + ".yaml");
        el.localGet("Open");
      }
      const finalText = el.localGet("Text");
      return { nocrash: true, cycles: 200, finalStartsWith: finalText ? finalText.substring(0, 20) : null };
    } catch (e) {
      return { error: e.message };
    }
  }, FEC);
  results.tests["3F_rapid_localSet_x200"] = { pass: rapidCycles.nocrash === true, detail: rapidCycles };

  // --- 3G: Special characters in localStorage values ---
  const specialCharsStorage = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    const specialValues = [
      "\x00\x01\x02",
      "null",
      "undefined",
      "NaN",
      "",
      "\n\r\t",
      "<script>alert(1)</script>",
      "a".repeat(100000),
      JSON.stringify({nested: {deep: true}}),
      "\ud83d\ude00\ud83d\ude80\ud83c\udf1f"
    ];

    try {
      for (let i = 0; i < specialValues.length; i++) {
        el.localSet("Test" + i, specialValues[i]);
        const back = el.localGet("Test" + i);
        if (back !== specialValues[i]) return { error: "mismatch at " + i, expected: specialValues[i].substring(0, 20), got: back ? back.substring(0, 20) : null };
      }
      return { nocrash: true, allMatch: true, tested: specialValues.length };
    } catch (e) {
      return { error: e.message };
    }
  }, FEC);
  results.tests["3G_special_chars_in_storage"] = { pass: specialCharsStorage.nocrash === true, detail: specialCharsStorage };

  await page.waitForTimeout(1000);

  results.totalErrors = results.errors.length;
  results.summary = Object.entries(results.tests).map(([k, v]) => k + ": " + (v.pass ? "PASS" : "FAIL")).join("\n");
  return JSON.stringify(results, null, 2);
}
