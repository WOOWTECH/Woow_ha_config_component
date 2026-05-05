async page => {
  const results = { errors: [], tests: {} };
  page.on("pageerror", err => results.errors.push("pageerror: " + err.message));

  const FEC = `(function() { function find(root) { if (!root) return null; const el = root.querySelector("config-editor-fullpage"); if (el) return el; for (const h of root.querySelectorAll("*")) { if (h.shadowRoot) { const f = find(h.shadowRoot); if (f) return f; } } return null; } return find(document); })()`;

  // --- 3E: Persistence across navigation ---
  // First set data
  await page.evaluate(() => { window.confirm = () => true; window.alert = () => {}; });
  await page.waitForTimeout(2000);

  await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el) return;
    el.localSet("Text", "PERSIST_NAV_TEST_ABC");
    el.localSet("Open", "persist_check.yaml");
  }, FEC);

  // Navigate (reload)
  await page.goto("http://localhost:15130/config-editor/0");
  await page.waitForTimeout(10000);
  await page.evaluate(() => { window.confirm = () => true; window.alert = () => {}; });

  const afterNav = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    return {
      textPersisted: el.localGet("Text") === "PERSIST_NAV_TEST_ABC",
      openPersisted: el.localGet("Open") === "persist_check.yaml",
      actualText: el.localGet("Text"),
      actualOpen: el.localGet("Open")
    };
  }, FEC);
  results.tests["3E_persist_across_navigation"] = { pass: afterNav.textPersisted === true, detail: afterNav };

  // --- 3F: Rapid localSet/localGet x200 ---
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
      return { nocrash: true, cycles: 200, finalStartsWith: finalText ? finalText.substring(0, 15) : null };
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
      "\ud83d\ude00\ud83d\ude80"
    ];
    try {
      for (let i = 0; i < specialValues.length; i++) {
        el.localSet("TestSp" + i, specialValues[i]);
        const back = el.localGet("TestSp" + i);
        if (back !== specialValues[i]) return { error: "mismatch at index " + i, len_expected: specialValues[i].length, len_got: back ? back.length : -1 };
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
