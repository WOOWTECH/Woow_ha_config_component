async page => {
  await page.evaluate(() => { window.confirm = () => true; window.alert = () => {}; window.prompt = (msg, def) => def || ""; });
  const results = { errors: [], tests: {} };
  page.on("pageerror", err => results.errors.push("pageerror: " + err.message));

  const FEC = `(function() { function find(root) { if (!root) return null; const el = root.querySelector("config-editor-fullpage"); if (el) return el; for (const h of root.querySelectorAll("*")) { if (h.shadowRoot) { const f = find(h.shadowRoot); if (f) return f; } } return null; } return find(document); })()`;

  // Wait for component helper
  async function waitForEditor(pg, timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const found = await pg.evaluate((fec) => {
        const el = eval(fec);
        return el && el.shadowRoot ? true : false;
      }, FEC);
      if (found) return true;
      await pg.waitForTimeout(500);
    }
    return false;
  }

  // Clear the big 4MB data from previous test
  await page.evaluate(() => { localStorage.clear(); });

  // --- 3E: Persistence across navigation ---
  await page.goto("http://localhost:15130/config-editor/0");
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.confirm = () => true; window.alert = () => {}; });
  await waitForEditor(page);

  await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el) return;
    el.localSet("Text", "PERSIST_NAV_TEST_99");
    el.localSet("Open", "nav_test.yaml");
  }, FEC);

  // Navigate away and back
  await page.goto("http://localhost:15130/config-editor/0");
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.confirm = () => true; window.alert = () => {}; });
  const found3E = await waitForEditor(page);

  if (found3E) {
    const afterNav = await page.evaluate((fec) => {
      const el = eval(fec);
      if (!el || !el.shadowRoot) return { error: "not found" };
      return {
        textPersisted: el.localGet("Text") === "PERSIST_NAV_TEST_99",
        openPersisted: el.localGet("Open") === "nav_test.yaml"
      };
    }, FEC);
    results.tests["3E_persist_across_navigation"] = { pass: afterNav.textPersisted === true, detail: afterNav };
  } else {
    results.tests["3E_persist_across_navigation"] = { pass: false, detail: { error: "editor not found after wait" } };
  }

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

  // --- 3G: Special characters in storage ---
  const specialChars = await page.evaluate((fec) => {
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
        if (back !== specialValues[i]) return { error: "mismatch at " + i };
      }
      return { nocrash: true, allMatch: true, tested: specialValues.length };
    } catch (e) {
      return { error: e.message };
    }
  }, FEC);
  results.tests["3G_special_chars_storage"] = { pass: specialChars.nocrash === true && specialChars.allMatch === true, detail: specialChars };

  results.totalErrors = results.errors.length;
  results.summary = Object.entries(results.tests).map(([k, v]) => k + ": " + (v.pass ? "PASS" : "FAIL")).join("\n");
  return JSON.stringify(results, null, 2);
}
