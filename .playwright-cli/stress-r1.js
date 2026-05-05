async page => {
  // Override window.confirm to always return true (auto-accept)
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

  const findEditorCode = `(function() {
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

  // --- TEST 1A: Font size spam (+ 50 times, - 100 times) ---
  const fontSpam = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const btns = el.shadowRoot.querySelectorAll("button");
    let plusBtn, minusBtn, resetBtn;
    for (const b of btns) {
      if (b.textContent === "+") plusBtn = b;
      if (b.textContent === "-") minusBtn = b;
      if (b.textContent === "A") resetBtn = b;
    }
    if (!plusBtn || !minusBtn) return { error: "buttons not found" };

    for (let i = 0; i < 50; i++) plusBtn.click();
    const afterPlus = el.edit ? el.edit.size : null;

    for (let i = 0; i < 100; i++) minusBtn.click();
    const afterMinus = el.edit ? el.edit.size : null;

    if (resetBtn) resetBtn.click();
    const afterReset = el.edit ? el.edit.size : null;

    return { afterPlus, afterMinus, afterReset };
  }, findEditorCode);
  results.tests["1A_font_spam"] = {
    pass: fontSpam.afterPlus === 300 && fontSpam.afterMinus === 30 && fontSpam.afterReset === 100,
    detail: fontSpam
  };

  // --- TEST 1B: Rapid file switching x20 ---
  const fileSwitch = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const sel = el.shadowRoot.querySelector("select");
    if (!sel || sel.options.length < 2) return { error: "no files", len: sel ? sel.options.length : 0 };

    const files = [];
    for (let i = 0; i < sel.options.length; i++) files.push(sel.options[i].value);

    for (let i = 0; i < 20; i++) {
      sel.value = files[i % files.length];
      sel.dispatchEvent(new Event("change"));
    }
    return { switchCount: 20, finalFile: sel.value, fileCount: files.length };
  }, findEditorCode);
  results.tests["1B_rapid_file_switch_x20"] = { pass: !fileSwitch.error, detail: fileSwitch };

  await page.waitForTimeout(3000);

  // --- TEST 1C: Mode toggle spam x30 ---
  const modeToggle = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const cb = el.shadowRoot.querySelector("input[type=checkbox]");
    if (!cb) return { error: "checkbox not found" };
    const initial = cb.checked;
    for (let i = 0; i < 30; i++) cb.click();
    return { toggleCount: 30, initialState: initial, finalState: cb.checked, backToOriginal: cb.checked === initial };
  }, findEditorCode);
  results.tests["1C_mode_toggle_x30"] = { pass: modeToggle.backToOriginal === true, detail: modeToggle };

  await page.waitForTimeout(1000);

  // --- TEST 1D: Extension filter spam x30 ---
  const extSwitch = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const selects = el.shadowRoot.querySelectorAll("select");
    if (selects.length < 2) return { error: "ext select not found" };
    const extSel = selects[1];
    const options = [];
    for (let i = 0; i < extSel.options.length; i++) options.push(extSel.options[i].value);

    for (let i = 0; i < 30; i++) {
      extSel.value = options[i % options.length];
      extSel.dispatchEvent(new Event("change"));
    }
    return { switchCount: 30, finalExt: extSel.value, optionCount: options.length };
  }, findEditorCode);
  results.tests["1D_ext_filter_spam_x30"] = { pass: !extSwitch.error, detail: extSwitch };

  await page.waitForTimeout(2000);

  // --- TEST 1E: Viewport resize thrash x20 ---
  for (let i = 0; i < 20; i++) {
    await page.setViewportSize({ width: 320 + Math.floor(Math.random() * 960), height: 480 + Math.floor(Math.random() * 600) });
    await page.waitForTimeout(50);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(1000);

  const afterResize = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const host = el.getBoundingClientRect();
    return { hostW: Math.round(host.width), hostH: Math.round(host.height), intact: host.width > 0 && host.height > 0 };
  }, findEditorCode);
  results.tests["1E_resize_thrash_x20"] = { pass: afterResize.intact === true, detail: afterResize };

  // --- TEST 1F: Combined interleaved ops x10 ---
  const combined = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const btns = el.shadowRoot.querySelectorAll("button");
    const sel = el.shadowRoot.querySelector("select");
    const cb = el.shadowRoot.querySelector("input[type=checkbox]");
    let plusBtn, minusBtn;
    for (const b of btns) {
      if (b.textContent === "+") plusBtn = b;
      if (b.textContent === "-") minusBtn = b;
    }

    for (let i = 0; i < 10; i++) {
      if (plusBtn) plusBtn.click();
      if (cb) cb.click();
      if (sel && sel.options.length > 1) {
        sel.value = sel.options[i % sel.options.length].value;
        sel.dispatchEvent(new Event("change"));
      }
      if (minusBtn) minusBtn.click();
      if (cb) cb.click();
    }

    const host = el.getBoundingClientRect();
    return { alive: host.width > 0 && host.height > 0, w: Math.round(host.width), h: Math.round(host.height) };
  }, findEditorCode);
  results.tests["1F_combined_rapid_ops"] = { pass: combined.alive === true, detail: combined };

  await page.waitForTimeout(2000);

  // Final health check
  const health = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "component destroyed" };
    const tb = el.shadowRoot.querySelector(".toolbar");
    const ed = el.shadowRoot.querySelector(".editor");
    const st = el.shadowRoot.querySelector(".status");
    return {
      hasToolbar: !!tb,
      hasEditor: !!ed,
      hasStatus: !!st,
      componentAlive: true
    };
  }, findEditorCode);
  results.tests["1G_post_stress_health"] = { pass: health.componentAlive === true, detail: health };

  results.totalErrors = results.errors.length;
  results.summary = Object.entries(results.tests).map(([k, v]) => k + ": " + (v.pass ? "PASS" : "FAIL")).join("\n");
  return JSON.stringify(results, null, 2);
}
