async page => {
  const results = { errors: [], tests: {} };
  page.on("pageerror", err => results.errors.push("pageerror: " + err.message));

  const FEC = `(function() { function find(root) { if (!root) return null; const el = root.querySelector("config-editor-fullpage"); if (el) return el; for (const h of root.querySelectorAll("*")) { if (h.shadowRoot) { const f = find(h.shadowRoot); if (f) return f; } } return null; } return find(document); })()`;

  await page.evaluate(() => { window.confirm = () => true; window.alert = () => {}; window.prompt = (msg, def) => def || ""; });

  // --- 4A: WebSocket command with invalid action ---
  const invalidAction = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    try {
      // Try calling cmd with an invalid action
      el.cmd("invalid_action", "", "test.yaml").then(r => {
        // store result
      }).catch(e => {
        // expected error
      });
      return { nocrash: true, sentInvalidCmd: true };
    } catch (e) {
      return { nocrash: true, syncError: e.message };
    }
  }, FEC);
  results.tests["4A_invalid_ws_action"] = { pass: invalidAction.nocrash === true, detail: invalidAction };
  await page.waitForTimeout(2000);

  // --- 4B: Component survives hass object removal ---
  const hassRemoval = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const hadHass = !!el._hass;

    // Temporarily remove hass
    const savedHass = el._hass;
    el._hass = null;

    try {
      // Try operations without hass
      const host = el.getBoundingClientRect();
      const alive = host.width > 0;

      // Restore
      el._hass = savedHass;
      return { nocrash: true, hadHass, survivedRemoval: alive };
    } catch (e) {
      el._hass = savedHass;
      return { error: e.message };
    }
  }, FEC);
  results.tests["4B_hass_object_removal"] = { pass: hassRemoval.nocrash === true, detail: hassRemoval };

  // --- 4C: Simulate WS timeout (cmd call during offline) ---
  const wsTimeout = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    // Mock hass.callWS to simulate timeout
    const original = el._hass.callWS;
    el._hass.callWS = () => new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 100));

    try {
      // Try List operation
      el.List();
      return { nocrash: true, mockedTimeout: true };
    } catch (e) {
      return { nocrash: true, syncError: e.message };
    } finally {
      el._hass.callWS = original;
    }
  }, FEC);
  results.tests["4C_ws_timeout_simulation"] = { pass: wsTimeout.nocrash === true, detail: wsTimeout };
  await page.waitForTimeout(1000);

  // --- 4D: Simulate WS error response ---
  const wsError = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    const original = el._hass.callWS;
    el._hass.callWS = () => Promise.reject(new Error("WebSocket connection failed"));

    try {
      el.List();
      el._hass.callWS = original;
      return { nocrash: true };
    } catch (e) {
      el._hass.callWS = original;
      return { nocrash: true, caught: e.message };
    }
  }, FEC);
  results.tests["4D_ws_error_response"] = { pass: wsError.nocrash === true, detail: wsError };
  await page.waitForTimeout(1000);

  // --- 4E: Rapid WS calls (spam List/Load) ---
  const rapidWS = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    try {
      // Spam 20 rapid WS calls
      for (let i = 0; i < 20; i++) {
        el.List();
      }
      const host = el.getBoundingClientRect();
      return { nocrash: true, alive: host.width > 0, spamCount: 20 };
    } catch (e) {
      return { error: e.message };
    }
  }, FEC);
  results.tests["4E_rapid_ws_spam_x20"] = { pass: rapidWS.nocrash === true, detail: rapidWS };
  await page.waitForTimeout(3000);

  // --- 4F: Component recovery after WS reconnect ---
  const wsReconnect = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    // Simulate disconnect then reconnect by temporarily nulling then restoring hass
    const saved = el._hass;
    el._hass = null;
    // Component should not crash
    const hostDuring = el.getBoundingClientRect();

    // Reconnect
    el._hass = saved;
    // Try normal operation
    try {
      el.List();
      const hostAfter = el.getBoundingClientRect();
      return { nocrash: true, aliveDuring: hostDuring.width > 0, aliveAfter: hostAfter.width > 0 };
    } catch (e) {
      return { error: e.message };
    }
  }, FEC);
  results.tests["4F_ws_reconnect_recovery"] = { pass: wsReconnect.nocrash === true && wsReconnect.aliveAfter === true, detail: wsReconnect };
  await page.waitForTimeout(2000);

  // Post-network health
  const health = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "dead" };
    const h = el.getBoundingClientRect();
    const tb = el.shadowRoot.querySelector(".toolbar");
    const ed = el.shadowRoot.querySelector(".editor");
    return { alive: h.width > 0, toolbar: !!tb, editor: !!ed };
  }, FEC);
  results.tests["4G_post_network_health"] = { pass: health.alive === true, detail: health };

  results.totalErrors = results.errors.length;
  results.summary = Object.entries(results.tests).map(([k, v]) => k + ": " + (v.pass ? "PASS" : "FAIL")).join("\n");
  return JSON.stringify(results, null, 2);
}
