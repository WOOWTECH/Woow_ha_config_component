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

  // --- 1A: Font size spam ---
  const fontSpam = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const btns = el.shadowRoot.querySelectorAll("button");
    let plusBtn, minusBtn, resetBtn;
    for (const b of btns) {
      const t = b.textContent.trim();
      if (t === "+") plusBtn = b;
      if (t === "\u2212") minusBtn = b;  // Unicode minus
      if (t === "A") resetBtn = b;
    }
    if (!plusBtn || !minusBtn) return { error: "buttons not found", btnTexts: Array.from(btns).map(b=>b.textContent.trim()) };

    for (let i = 0; i < 50; i++) plusBtn.click();
    const afterPlus = el.edit ? el.edit.size : null;

    for (let i = 0; i < 100; i++) minusBtn.click();
    const afterMinus = el.edit ? el.edit.size : null;

    if (resetBtn) resetBtn.click();
    const afterReset = el.edit ? el.edit.size : null;

    return { afterPlus, afterMinus, afterReset };
  }, FEC);
  results.tests["1A_font_spam_50plus_100minus"] = {
    pass: fontSpam.afterPlus === 300 && fontSpam.afterMinus === 30 && fontSpam.afterReset === 100,
    detail: fontSpam
  };

  // --- 1B: Rapid file switching x20 ---
  const fileSwitch = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const sel = el.shadowRoot.querySelector("select");
    if (!sel || sel.options.length < 2) return { error: "no files" };
    const files = Array.from(sel.options).map(o => o.value);
    for (let i = 0; i < 20; i++) {
      sel.value = files[i % files.length];
      sel.dispatchEvent(new Event("change"));
    }
    return { switchCount: 20, finalFile: sel.value, fileCount: files.length };
  }, FEC);
  results.tests["1B_rapid_file_switch_x20"] = { pass: !fileSwitch.error, detail: fileSwitch };
  await page.waitForTimeout(3000);

  // --- 1C: Mode toggle x30 ---
  const modeToggle = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const cb = el.shadowRoot.querySelector("input[type=checkbox]");
    if (!cb) return { error: "no checkbox" };
    const initial = cb.checked;
    for (let i = 0; i < 30; i++) cb.click();
    return { initial, final: cb.checked, backToOriginal: cb.checked === initial };
  }, FEC);
  results.tests["1C_mode_toggle_x30"] = { pass: modeToggle.backToOriginal === true, detail: modeToggle };
  await page.waitForTimeout(1000);

  // --- 1D: Extension filter spam x30 ---
  const extSpam = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const selects = el.shadowRoot.querySelectorAll("select");
    if (selects.length < 2) return { error: "no ext select" };
    const extSel = selects[1];
    const opts = Array.from(extSel.options).map(o => o.value);
    for (let i = 0; i < 30; i++) {
      extSel.value = opts[i % opts.length];
      extSel.dispatchEvent(new Event("change"));
    }
    return { switchCount: 30, finalExt: extSel.value, optionCount: opts.length };
  }, FEC);
  results.tests["1D_ext_filter_spam_x30"] = { pass: !extSpam.error, detail: extSpam };
  await page.waitForTimeout(2000);

  // --- 1E: Resize thrash x20 ---
  for (let i = 0; i < 20; i++) {
    await page.setViewportSize({ width: 320 + Math.floor(Math.random() * 960), height: 480 + Math.floor(Math.random() * 600) });
    await page.waitForTimeout(50);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(1000);
  const afterResize = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const h = el.getBoundingClientRect();
    return { w: Math.round(h.width), h: Math.round(h.height), intact: h.width > 0 && h.height > 0 };
  }, FEC);
  results.tests["1E_resize_thrash_x20"] = { pass: afterResize.intact === true, detail: afterResize };

  // --- 1F: Combined interleaved x10 ---
  const combined = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const btns = el.shadowRoot.querySelectorAll("button");
    const sel = el.shadowRoot.querySelector("select");
    const cb = el.shadowRoot.querySelector("input[type=checkbox]");
    let plusBtn, minusBtn;
    for (const b of btns) {
      if (b.textContent.trim() === "+") plusBtn = b;
      if (b.textContent.trim() === "\u2212") minusBtn = b;
    }
    for (let i = 0; i < 10; i++) {
      if (plusBtn) plusBtn.click();
      if (cb) cb.click();
      if (sel && sel.options.length > 1) { sel.value = sel.options[i % sel.options.length].value; sel.dispatchEvent(new Event("change")); }
      if (minusBtn) minusBtn.click();
      if (cb) cb.click();
    }
    const h = el.getBoundingClientRect();
    return { alive: h.width > 0 && h.height > 0 };
  }, FEC);
  results.tests["1F_combined_rapid_ops"] = { pass: combined.alive === true, detail: combined };
  await page.waitForTimeout(2000);

  // --- 1G: Post-stress health ---
  const health = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "dead" };
    const tb = el.shadowRoot.querySelector(".toolbar");
    const ed = el.shadowRoot.querySelector(".editor");
    const st = el.shadowRoot.querySelector(".status");
    return { toolbar: !!tb, editor: !!ed, status: !!st, alive: true };
  }, FEC);
  results.tests["1G_post_stress_health"] = { pass: health.alive === true, detail: health };

  results.totalErrors = results.errors.length;
  results.summary = Object.entries(results.tests).map(([k, v]) => k + ": " + (v.pass ? "PASS" : "FAIL")).join("\n");
  return JSON.stringify(results, null, 2);
}
