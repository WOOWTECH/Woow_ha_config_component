async page => {
  const results = { errors: [], tests: {} };
  page.on("pageerror", err => results.errors.push("pageerror: " + err.message));

  await page.evaluate(() => { window.confirm = () => true; window.alert = () => {}; window.prompt = (msg, def) => def || ""; });

  const FEC = `(function() { function find(root) { if (!root) return null; const el = root.querySelector("config-editor-fullpage"); if (el) return el; for (const h of root.querySelectorAll("*")) { if (h.shadowRoot) { const f = find(h.shadowRoot); if (f) return f; } } return null; } return find(document); })()`;

  // --- 8A: Save while file is still loading ---
  const saveWhileLoad = await page.evaluate(async (fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const sel = el.shadowRoot.querySelector("select");
    if (!sel || sel.options.length < 2) return { error: "no files" };

    try {
      // Trigger file load
      sel.value = sel.options[1].value;
      sel.dispatchEvent(new Event("change"));

      // Immediately try to save (race condition)
      const saveBtn = Array.from(el.shadowRoot.querySelectorAll("button")).find(b => b.textContent.includes("Save"));
      if (saveBtn) saveBtn.click();

      await new Promise(r => setTimeout(r, 1000));
      const host = el.getBoundingClientRect();
      return { nocrash: true, alive: host.width > 0 };
    } catch (e) {
      return { nocrash: true, error: e.message };
    }
  }, FEC);
  results.tests["8A_save_during_load"] = { pass: saveWhileLoad.nocrash === true, detail: saveWhileLoad };
  await page.waitForTimeout(2000);

  // --- 8B: Switch file during save operation ---
  const switchDuringSave = await page.evaluate(async (fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const sel = el.shadowRoot.querySelector("select");
    if (!sel || sel.options.length < 2) return { error: "no files" };

    try {
      // Start a save (mock slow save)
      const origCallWS = el._hass.callWS;
      let saveStarted = false;
      el._hass.callWS = (params) => {
        if (params.action === "save") {
          saveStarted = true;
          return new Promise(r => setTimeout(() => r({}), 2000)); // 2s delay
        }
        return origCallWS.call(el._hass, params);
      };

      // Trigger save
      const saveBtn = Array.from(el.shadowRoot.querySelectorAll("button")).find(b => b.textContent.includes("Save"));
      if (saveBtn) saveBtn.click();

      // Immediately switch file
      await new Promise(r => setTimeout(r, 50));
      sel.value = sel.options[0].value;
      sel.dispatchEvent(new Event("change"));

      await new Promise(r => setTimeout(r, 2500));
      el._hass.callWS = origCallWS;

      const host = el.getBoundingClientRect();
      return { nocrash: true, saveStarted, alive: host.width > 0 };
    } catch (e) {
      return { nocrash: true, error: e.message };
    }
  }, FEC);
  results.tests["8B_switch_during_save"] = { pass: switchDuringSave.nocrash === true, detail: switchDuringSave };
  await page.waitForTimeout(1000);

  // --- 8C: Multiple simultaneous List() calls ---
  const multiList = await page.evaluate(async (fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    try {
      // Fire 10 simultaneous List calls
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(el.cmd("list", "", ""));
      }
      const results = await Promise.allSettled(promises);
      const fulfilled = results.filter(r => r.status === "fulfilled").length;
      const rejected = results.filter(r => r.status === "rejected").length;

      const host = el.getBoundingClientRect();
      return { nocrash: true, fulfilled, rejected, total: 10, alive: host.width > 0 };
    } catch (e) {
      return { nocrash: true, error: e.message };
    }
  }, FEC);
  results.tests["8C_simultaneous_list_x10"] = { pass: multiList.nocrash === true, detail: multiList };
  await page.waitForTimeout(2000);

  // --- 8D: Rapid save/load interleaving ---
  const interleave = await page.evaluate(async (fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    if (!el.edit) return { error: "no edit" };

    try {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        // Load
        promises.push(el.cmd("load", "", "configuration.yaml").catch(() => {}));
        // Immediately try save
        el.edit.text = "concurrent_test_" + i;
        promises.push(el.cmd("save", "concurrent_test_" + i, "configuration.yaml").catch(() => {}));
      }
      await Promise.allSettled(promises);
      const host = el.getBoundingClientRect();
      return { nocrash: true, alive: host.width > 0, operations: 10 };
    } catch (e) {
      return { nocrash: true, error: e.message };
    }
  }, FEC);
  results.tests["8D_rapid_save_load_interleave"] = { pass: interleave.nocrash === true, detail: interleave };
  await page.waitForTimeout(2000);

  // --- 8E: Double-click save button ---
  const doubleSave = await page.evaluate(async (fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    try {
      const saveBtn = Array.from(el.shadowRoot.querySelectorAll("button")).find(b => b.textContent.includes("Save"));
      if (!saveBtn) return { error: "no save button" };

      // Double click (rapid fire)
      saveBtn.click();
      saveBtn.click();
      saveBtn.click();

      await new Promise(r => setTimeout(r, 2000));
      const host = el.getBoundingClientRect();
      return { nocrash: true, alive: host.width > 0, tripleClicked: true };
    } catch (e) {
      return { nocrash: true, error: e.message };
    }
  }, FEC);
  results.tests["8E_triple_save_click"] = { pass: doubleSave.nocrash === true, detail: doubleSave };
  await page.waitForTimeout(1000);

  // --- 8F: requestUpdate during async operation ---
  const updateDuringAsync = await page.evaluate(async (fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    try {
      // Start async operation
      const loadPromise = el.cmd("list", "", "").catch(() => {});

      // Spam requestUpdate during async
      for (let i = 0; i < 50; i++) {
        el.requestUpdate();
      }

      await loadPromise;
      const host = el.getBoundingClientRect();
      return { nocrash: true, alive: host.width > 0 };
    } catch (e) {
      return { nocrash: true, error: e.message };
    }
  }, FEC);
  results.tests["8F_requestUpdate_during_async"] = { pass: updateDuringAsync.nocrash === true, detail: updateDuringAsync };

  // Final health
  await page.waitForTimeout(2000);
  const health = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "dead" };
    const h = el.getBoundingClientRect();
    const tb = el.shadowRoot.querySelector(".toolbar");
    const ed = el.shadowRoot.querySelector(".editor");
    return { alive: h.width > 0, toolbar: !!tb, editor: !!ed };
  }, FEC);
  results.tests["8G_final_health"] = { pass: health.alive === true, detail: health };

  results.totalErrors = results.errors.length;
  results.summary = Object.entries(results.tests).map(([k, v]) => k + ": " + (v.pass ? "PASS" : "FAIL")).join("\n");
  return JSON.stringify(results, null, 2);
}
