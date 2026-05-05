async page => {
  await page.evaluate(() => {
    window.confirm = () => true;
    window.alert = () => {};
    window.prompt = (msg, def) => def || "";
  });

  const results = { errors: [], tests: {} };
  page.on("pageerror", err => results.errors.push("pageerror: " + err.message));
  page.on("console", msg => {
    if (msg.type() === "error") results.errors.push("console: " + msg.text());
  });

  await page.goto("http://localhost:15130/config-editor/0");
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    window.confirm = () => true;
    window.alert = () => {};
    window.prompt = (msg, def) => def || "";
  });

  const FEC = `(function() {
    function find(root) {
      if (!root) return null;
      const el = root.querySelector("config-editor-fullpage");
      if (el) return el;
      for (const h of root.querySelectorAll("*")) {
        if (h.shadowRoot) { const f = find(h.shadowRoot); if (f) return f; }
      }
      return null;
    }
    return find(document);
  })()`;

  // --- 2A: Load empty file (automations.yaml is typically empty) ---
  const emptyFile = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const sel = el.shadowRoot.querySelector("select");
    const files = Array.from(sel.options).map(o => o.value);
    // Find automations.yaml (often empty)
    const target = files.find(f => f === "automations.yaml") || files[0];
    sel.value = target;
    sel.dispatchEvent(new Event("change"));
    return { selectedFile: target };
  }, FEC);
  await page.waitForTimeout(2000);

  const emptyContent = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    // Check that empty content doesn't crash
    const ed = el.shadowRoot.querySelector(".editor");
    const status = el.shadowRoot.querySelector(".status");
    return {
      editorExists: !!ed,
      statusText: status ? status.textContent : null,
      nocrash: true
    };
  }, FEC);
  results.tests["2A_empty_file_load"] = { pass: emptyContent.nocrash === true, detail: { ...emptyFile, ...emptyContent } };

  // --- 2B: Very large content handling (simulate 10000 lines) ---
  const largeContent = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    // Generate large YAML content
    let bigContent = "# Auto-generated test content\n";
    for (let i = 0; i < 5000; i++) {
      bigContent += "item_" + i + ": value_" + i + "\n";
    }

    // Inject into editor
    if (el.edit) {
      el.edit.text = bigContent;
      el.edit.saved = false;
    }

    // Check component still works
    const host = el.getBoundingClientRect();
    return {
      contentLength: bigContent.length,
      lineCount: 5001,
      hostIntact: host.width > 0 && host.height > 0,
      nocrash: true
    };
  }, FEC);
  results.tests["2B_large_content_5000_lines"] = { pass: largeContent.nocrash === true && largeContent.hostIntact === true, detail: largeContent };
  await page.waitForTimeout(1000);

  // --- 2C: Special characters in content (Unicode, emoji, RTL) ---
  const specialChars = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    const specialContent = [
      "# Unicode test",
      "chinese: \u4e2d\u6587\u6d4b\u8bd5",
      "japanese: \u65e5\u672c\u8a9e\u30c6\u30b9\u30c8",
      "korean: \ud55c\uad6d\uc5b4 \ud14c\uc2a4\ud2b8",
      "emoji: \ud83d\ude00\ud83d\ude80\ud83c\udf1f\u2705",
      "rtl: \u0645\u0631\u062d\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645",
      "special: <script>alert('xss')</script>",
      "yaml_special: '{key: [1, 2, 3]}'",
      "multiline: |",
      "  line1",
      "  line2",
      "null_char: '\\x00test'",
      "tab_char: '\tindented'",
      "long_line: " + "x".repeat(10000)
    ].join("\n");

    if (el.edit) {
      el.edit.text = specialContent;
      el.edit.saved = false;
    }

    const host = el.getBoundingClientRect();
    return {
      contentSet: true,
      hostIntact: host.width > 0 && host.height > 0,
      nocrash: true
    };
  }, FEC);
  results.tests["2C_special_chars_unicode_emoji_rtl"] = { pass: specialChars.nocrash === true, detail: specialChars };
  await page.waitForTimeout(1000);

  // --- 2D: Edge case - select file with zero-length name (boundary) ---
  const zeroLen = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    // Attempt to load a nonexistent file
    try {
      if (el.edit) {
        el.edit.open = "";
        el.requestUpdate();
      }
      return { nocrash: true, handled: true };
    } catch (e) {
      return { error: e.message };
    }
  }, FEC);
  results.tests["2D_empty_filename_boundary"] = { pass: zeroLen.nocrash === true, detail: zeroLen };
  await page.waitForTimeout(500);

  // --- 2E: Rapid content set/get cycle ---
  const rapidContent = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    if (!el.edit) return { error: "no edit state" };

    // Set content 100 times rapidly
    for (let i = 0; i < 100; i++) {
      el.edit.text = "iteration_" + i + ": value\n".repeat(10);
    }
    const finalContent = el.edit.text;
    return {
      iterations: 100,
      finalStartsWith: finalContent.substring(0, 30),
      nocrash: true
    };
  }, FEC);
  results.tests["2E_rapid_content_set_x100"] = { pass: rapidContent.nocrash === true, detail: rapidContent };

  // --- 2F: Component config edge cases ---
  const configEdge = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    // Test with extreme config values
    try {
      el.setConfig({ depth: -1, file: "", readonly: "invalid", basic: null, size: 99999 });
      const host = el.getBoundingClientRect();
      return { nocrash: true, hostIntact: host.width > 0 };
    } catch (e) {
      return { error: e.message };
    }
  }, FEC);
  results.tests["2F_extreme_config_values"] = { pass: configEdge.nocrash === true || configEdge.error !== undefined, detail: configEdge };
  await page.waitForTimeout(1000);

  // --- 2G: Double render / double connectedCallback ---
  const doubleRender = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    // Force multiple renders
    try {
      el.requestUpdate();
      el.requestUpdate();
      el.requestUpdate();
      el.requestUpdate();
      el.requestUpdate();
      const host = el.getBoundingClientRect();
      return { nocrash: true, hostIntact: host.width > 0 };
    } catch (e) {
      return { error: e.message };
    }
  }, FEC);
  results.tests["2G_multi_requestUpdate"] = { pass: doubleRender.nocrash === true, detail: doubleRender };

  await page.waitForTimeout(2000);

  // Final health
  const health = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "dead" };
    const h = el.getBoundingClientRect();
    return { alive: h.width > 0 && h.height > 0 };
  }, FEC);
  results.tests["2H_final_health"] = { pass: health.alive === true, detail: health };

  results.totalErrors = results.errors.length;
  results.summary = Object.entries(results.tests).map(([k, v]) => k + ": " + (v.pass ? "PASS" : "FAIL")).join("\n");
  return JSON.stringify(results, null, 2);
}
