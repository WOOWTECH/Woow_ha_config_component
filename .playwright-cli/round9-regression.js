async page => {
  const results = { errors: [], tests: {} };
  page.on("pageerror", err => results.errors.push("pageerror: " + err.message));
  page.on("console", msg => { if (msg.type() === "error") results.errors.push("console: " + msg.text()); });

  await page.goto("http://localhost:15130/config-editor/0");
  await page.waitForTimeout(8000);
  await page.evaluate(() => { window.confirm = () => true; window.alert = () => {}; window.prompt = (msg, def) => def || ""; });

  const FEC = `(function() { function find(root) { if (!root) return null; const el = root.querySelector("config-editor-fullpage"); if (el) return el; for (const h of root.querySelectorAll("*")) { if (h.shadowRoot) { const f = find(h.shadowRoot); if (f) return f; } } return null; } return find(document); })()`;

  // --- R1: Full layout check ---
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(1000);
  const layout = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const host = el.getBoundingClientRect();
    const tb = el.shadowRoot.querySelector(".toolbar");
    const ed = el.shadowRoot.querySelector(".editor");
    const st = el.shadowRoot.querySelector(".status");
    return {
      hostH: Math.round(host.height),
      expected: window.innerHeight - 56,
      match: Math.round(host.height) === (window.innerHeight - 56),
      parts: {
        toolbar: tb ? Math.round(tb.getBoundingClientRect().height) : 0,
        editor: ed ? Math.round(ed.getBoundingClientRect().height) : 0,
        status: st ? Math.round(st.getBoundingClientRect().height) : 0
      }
    };
  }, FEC);
  results.tests["R1_layout_intact"] = { pass: layout.match === true, detail: layout };

  // --- R2: File load still works ---
  const fileLoad = await page.evaluate(async (fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    try {
      const data = await el.cmd("load", "", "configuration.yaml");
      return { loaded: true, hasContent: data && data.length > 0, contentLen: data ? data.length : 0 };
    } catch (e) {
      return { error: e.message };
    }
  }, FEC);
  results.tests["R2_file_load_works"] = { pass: fileLoad.loaded === true && fileLoad.hasContent === true, detail: fileLoad };

  // --- R3: File list still works ---
  const fileList = await page.evaluate(async (fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    try {
      const data = await el.cmd("list", "", "");
      return { listed: true, fileCount: Array.isArray(data) ? data.length : 0 };
    } catch (e) {
      return { error: e.message };
    }
  }, FEC);
  results.tests["R3_file_list_works"] = { pass: fileList.listed === true && fileList.fileCount > 0, detail: fileList };

  // --- R4: Font size controls work ---
  const fontCtrl = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const btns = el.shadowRoot.querySelectorAll("button");
    let plus, minus, reset;
    for (const b of btns) {
      if (b.textContent.trim() === "+") plus = b;
      if (b.textContent.trim() === "\u2212") minus = b;
      if (b.textContent.trim() === "A") reset = b;
    }
    if (!plus || !minus || !reset) return { error: "buttons missing" };

    reset.click(); // start at 100
    plus.click(); plus.click(); // 110
    const after2plus = el.edit.size;
    minus.click(); // 105
    const afterMinus = el.edit.size;
    reset.click(); // 100
    const afterReset = el.edit.size;

    return { after2plus, afterMinus, afterReset, correct: after2plus === 110 && afterMinus === 105 && afterReset === 100 };
  }, FEC);
  results.tests["R4_font_controls"] = { pass: fontCtrl.correct === true, detail: fontCtrl };

  // --- R5: Basic mode toggle works ---
  const basicToggle = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const cb = el.shadowRoot.querySelector("input[type=checkbox]");
    if (!cb) return { error: "no checkbox" };

    const before = el.edit.basic;
    cb.click();
    const after = el.edit.basic;
    cb.click(); // toggle back
    const restored = el.edit.basic;
    return { toggled: before !== after, restored: before === restored };
  }, FEC);
  results.tests["R5_basic_toggle"] = { pass: basicToggle.toggled === true && basicToggle.restored === true, detail: basicToggle };

  // --- R6: Extension filter works ---
  const extFilter = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const selects = el.shadowRoot.querySelectorAll("select");
    if (selects.length < 2) return { error: "no ext select" };
    const extSel = selects[1];
    const options = Array.from(extSel.options).map(o => o.value);
    return { optionCount: options.length, hasYaml: options.includes("yaml"), hasAll: options.includes("all") };
  }, FEC);
  results.tests["R6_ext_filter_intact"] = { pass: extFilter.optionCount >= 9, detail: extFilter };

  // --- R7: localStorage works ---
  const ls = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    el.localSet("RegressionTest", "12345");
    const val = el.localGet("RegressionTest");
    return { setGet: val === "12345" };
  }, FEC);
  results.tests["R7_localStorage_works"] = { pass: ls.setGet === true, detail: ls };

  // --- R8: RWD mobile still works ---
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(500);
  const mobile = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const host = el.getBoundingClientRect();
    const tb = el.shadowRoot.querySelector(".toolbar");
    return {
      hostW: Math.round(host.width),
      toolbarWraps: tb ? tb.getBoundingClientRect().height > 50 : false,
      noOverflow: host.width <= 375
    };
  }, FEC);
  results.tests["R8_mobile_rwd"] = { pass: mobile.noOverflow === true, detail: mobile };

  // Reset viewport
  await page.setViewportSize({ width: 1280, height: 720 });

  results.totalErrors = results.errors.length;
  results.allPass = Object.values(results.tests).every(t => t.pass);
  results.summary = Object.entries(results.tests).map(([k, v]) => k + ": " + (v.pass ? "PASS" : "FAIL")).join("\n");
  return JSON.stringify(results, null, 2);
}
