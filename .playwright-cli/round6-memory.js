async page => {
  const results = { errors: [], tests: {} };
  page.on("pageerror", err => results.errors.push("pageerror: " + err.message));

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => { window.confirm = () => true; window.alert = () => {}; window.prompt = (msg, def) => def || ""; });

  const FEC = `(function() { function find(root) { if (!root) return null; const el = root.querySelector("config-editor-fullpage"); if (el) return el; for (const h of root.querySelectorAll("*")) { if (h.shadowRoot) { const f = find(h.shadowRoot); if (f) return f; } } return null; } return find(document); })()`;

  // --- 6A: DOM node count stability (check for leaks during operations) ---
  const domBefore = await page.evaluate(() => document.querySelectorAll("*").length);

  // Perform 50 heavy operations
  await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return;
    const btns = el.shadowRoot.querySelectorAll("button");
    const sel = el.shadowRoot.querySelector("select");
    const cb = el.shadowRoot.querySelector("input[type=checkbox]");
    let plusBtn, minusBtn;
    for (const b of btns) {
      if (b.textContent.trim() === "+") plusBtn = b;
      if (b.textContent.trim() === "\u2212") minusBtn = b;
    }

    for (let i = 0; i < 50; i++) {
      if (plusBtn) plusBtn.click();
      if (minusBtn) minusBtn.click();
      if (cb) { cb.click(); cb.click(); }
      if (sel && sel.options.length > 0) {
        sel.value = sel.options[i % sel.options.length].value;
        sel.dispatchEvent(new Event("change"));
      }
      el.requestUpdate();
    }
  }, FEC);
  await page.waitForTimeout(3000);

  const domAfter = await page.evaluate(() => document.querySelectorAll("*").length);
  const domGrowth = domAfter - domBefore;
  results.tests["6A_dom_node_leak_check"] = {
    pass: domGrowth < 100, // Allow small growth, but not unbounded
    detail: { before: domBefore, after: domAfter, growth: domGrowth, maxAllowed: 100 }
  };

  // --- 6B: Shadow DOM node count stability ---
  const shadowBefore = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return -1;
    return el.shadowRoot.querySelectorAll("*").length;
  }, FEC);

  // More operations
  for (let round = 0; round < 5; round++) {
    await page.evaluate((fec) => {
      const el = eval(fec);
      if (!el || !el.shadowRoot) return;
      for (let i = 0; i < 20; i++) el.requestUpdate();
    }, FEC);
    await page.waitForTimeout(500);
  }

  const shadowAfter = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return -1;
    return el.shadowRoot.querySelectorAll("*").length;
  }, FEC);
  results.tests["6B_shadow_dom_leak_check"] = {
    pass: Math.abs(shadowAfter - shadowBefore) < 50,
    detail: { before: shadowBefore, after: shadowAfter, diff: shadowAfter - shadowBefore }
  };

  // --- 6C: Event listener accumulation check ---
  const listenerCheck = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    // Check for common listener leak: multiple keydown handlers
    let keydownCount = 0;
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    const tracked = [];

    EventTarget.prototype.addEventListener = function(type, fn, opts) {
      if (type === "keydown") keydownCount++;
      tracked.push({ type, target: this.tagName || "window" });
      return originalAdd.call(this, type, fn, opts);
    };

    // Trigger re-renders
    for (let i = 0; i < 10; i++) el.requestUpdate();

    EventTarget.prototype.addEventListener = originalAdd;
    EventTarget.prototype.removeEventListener = originalRemove;

    return { keydownAdds: keydownCount, totalAdds: tracked.length, noExcessiveListeners: keydownCount < 20 };
  }, FEC);
  results.tests["6C_event_listener_accumulation"] = { pass: listenerCheck.noExcessiveListeners === true, detail: listenerCheck };

  // --- 6D: Long session simulation (100 file load cycles) ---
  const longSession = await page.evaluate(async (fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const sel = el.shadowRoot.querySelector("select");
    if (!sel || sel.options.length < 2) return { error: "no files" };
    const files = Array.from(sel.options).map(o => o.value).filter(v => v);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      sel.value = files[i % files.length];
      sel.dispatchEvent(new Event("change"));
      // Tiny delay to allow async processing
      await new Promise(r => setTimeout(r, 10));
    }
    const elapsed = performance.now() - start;

    const host = el.getBoundingClientRect();
    return { nocrash: true, cycles: 100, elapsed: Math.round(elapsed), alive: host.width > 0 };
  }, FEC);
  results.tests["6D_long_session_100_cycles"] = { pass: longSession.nocrash === true && longSession.alive === true, detail: longSession };

  // --- 6E: Memory usage estimation via performance API ---
  const memCheck = await page.evaluate(() => {
    if (performance.memory) {
      return {
        usedJSHeap: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
        totalJSHeap: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
        healthy: performance.memory.usedJSHeapSize < performance.memory.jsHeapSizeLimit * 0.5
      };
    }
    return { noMemoryAPI: true, healthy: true };
  });
  results.tests["6E_memory_usage"] = { pass: memCheck.healthy === true, detail: memCheck };

  // --- 6F: Render performance (time 100 requestUpdate calls) ---
  const renderPerf = await page.evaluate(async (fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      el.requestUpdate();
      await el.updateComplete;
    }
    const elapsed = performance.now() - start;
    return { renders: 100, totalMs: Math.round(elapsed), avgMs: Math.round(elapsed / 100), acceptable: elapsed < 5000 };
  }, FEC);
  results.tests["6F_render_performance_100x"] = { pass: renderPerf.acceptable === true, detail: renderPerf };

  results.totalErrors = results.errors.length;
  results.summary = Object.entries(results.tests).map(([k, v]) => k + ": " + (v.pass ? "PASS" : "FAIL")).join("\n");
  return JSON.stringify(results, null, 2);
}
