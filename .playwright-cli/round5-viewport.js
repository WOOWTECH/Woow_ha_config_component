async page => {
  const results = { errors: [], tests: {} };
  page.on("pageerror", err => results.errors.push("pageerror: " + err.message));

  const FEC = `(function() { function find(root) { if (!root) return null; const el = root.querySelector("config-editor-fullpage"); if (el) return el; for (const h of root.querySelectorAll("*")) { if (h.shadowRoot) { const f = find(h.shadowRoot); if (f) return f; } } return null; } return find(document); })()`;

  await page.evaluate(() => { window.confirm = () => true; window.alert = () => {}; });

  // --- 5A: Ultra-narrow viewport (320px — smallest common mobile) ---
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(1000);
  const narrow = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const h = el.getBoundingClientRect();
    const tb = el.shadowRoot.querySelector(".toolbar");
    const ed = el.shadowRoot.querySelector(".editor");
    return {
      hostW: Math.round(h.width), hostH: Math.round(h.height),
      toolbarH: tb ? Math.round(tb.getBoundingClientRect().height) : 0,
      editorH: ed ? Math.round(ed.getBoundingClientRect().height) : 0,
      noHorizontalOverflow: h.width <= 320,
      visible: h.width > 0 && h.height > 0
    };
  }, FEC);
  results.tests["5A_320px_ultra_narrow"] = { pass: narrow.visible === true && narrow.noHorizontalOverflow === true, detail: narrow };

  // --- 5B: Ultra-wide 4K viewport (3840px) ---
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.waitForTimeout(1000);
  const wide = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const h = el.getBoundingClientRect();
    const tb = el.shadowRoot.querySelector(".toolbar");
    const ed = el.shadowRoot.querySelector(".editor");
    return {
      hostW: Math.round(h.width), hostH: Math.round(h.height),
      toolbarH: tb ? Math.round(tb.getBoundingClientRect().height) : 0,
      editorH: ed ? Math.round(ed.getBoundingClientRect().height) : 0,
      fillsWidth: h.width > 1000,
      visible: h.width > 0 && h.height > 0
    };
  }, FEC);
  results.tests["5B_4K_3840px"] = { pass: wide.visible === true, detail: wide };

  // --- 5C: Ultra-short viewport (height 300px) ---
  await page.setViewportSize({ width: 1280, height: 300 });
  await page.waitForTimeout(1000);
  const short = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const h = el.getBoundingClientRect();
    const tb = el.shadowRoot.querySelector(".toolbar");
    const ed = el.shadowRoot.querySelector(".editor");
    const overflow = document.documentElement.scrollHeight > document.documentElement.clientHeight;
    return {
      hostH: Math.round(h.height),
      toolbarH: tb ? Math.round(tb.getBoundingClientRect().height) : 0,
      editorH: ed ? Math.round(ed.getBoundingClientRect().height) : 0,
      pageOverflow: overflow,
      visible: h.width > 0
    };
  }, FEC);
  results.tests["5C_300px_height"] = { pass: short.visible === true, detail: short };

  // --- 5D: Square viewport ---
  await page.setViewportSize({ width: 600, height: 600 });
  await page.waitForTimeout(1000);
  const square = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const h = el.getBoundingClientRect();
    return { hostW: Math.round(h.width), hostH: Math.round(h.height), visible: h.width > 0 };
  }, FEC);
  results.tests["5D_square_600x600"] = { pass: square.visible === true, detail: square };

  // --- 5E: Portrait ultra-tall (phone-like 390x844) ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  const portrait = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const h = el.getBoundingClientRect();
    const tb = el.shadowRoot.querySelector(".toolbar");
    return {
      hostW: Math.round(h.width), hostH: Math.round(h.height),
      toolbarWraps: tb ? tb.getBoundingClientRect().height > 50 : false,
      noHOverflow: h.width <= 390,
      visible: h.width > 0
    };
  }, FEC);
  results.tests["5E_portrait_390x844"] = { pass: portrait.visible === true && portrait.noHOverflow === true, detail: portrait };

  // --- 5F: Landscape ultra-wide (phone landscape 844x390) ---
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(1000);
  const landscape = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const h = el.getBoundingClientRect();
    const ed = el.shadowRoot.querySelector(".editor");
    return {
      hostW: Math.round(h.width), hostH: Math.round(h.height),
      editorH: ed ? Math.round(ed.getBoundingClientRect().height) : 0,
      editorUsable: ed ? ed.getBoundingClientRect().height > 100 : false,
      visible: h.width > 0
    };
  }, FEC);
  results.tests["5F_landscape_844x390"] = { pass: landscape.visible === true && landscape.editorUsable === true, detail: landscape };

  // --- 5G: Zoom simulation (font-size scaling on root) ---
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(500);
  const zoom = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    // Simulate 150% zoom by scaling root font size
    document.documentElement.style.fontSize = "24px"; // 150% of 16px
    const h150 = el.getBoundingClientRect();

    // Simulate 50% zoom
    document.documentElement.style.fontSize = "8px";
    const h50 = el.getBoundingClientRect();

    // Reset
    document.documentElement.style.fontSize = "";
    const hNormal = el.getBoundingClientRect();

    return {
      at150: { w: Math.round(h150.width), h: Math.round(h150.height), visible: h150.width > 0 },
      at50: { w: Math.round(h50.width), h: Math.round(h50.height), visible: h50.width > 0 },
      normal: { w: Math.round(hNormal.width), h: Math.round(hNormal.height), visible: hNormal.width > 0 },
      allVisible: h150.width > 0 && h50.width > 0 && hNormal.width > 0
    };
  }, FEC);
  results.tests["5G_zoom_simulation"] = { pass: zoom.allVisible === true, detail: zoom };

  // --- 5H: Rapid viewport cycling (simulate orientation change) ---
  for (let i = 0; i < 10; i++) {
    await page.setViewportSize({ width: 375, height: 812 }); // portrait
    await page.waitForTimeout(100);
    await page.setViewportSize({ width: 812, height: 375 }); // landscape
    await page.waitForTimeout(100);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(1000);

  const afterCycling = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };
    const h = el.getBoundingClientRect();
    return { alive: h.width > 0 && h.height > 0, w: Math.round(h.width), h: Math.round(h.height) };
  }, FEC);
  results.tests["5H_orientation_cycle_x10"] = { pass: afterCycling.alive === true, detail: afterCycling };

  results.totalErrors = results.errors.length;
  results.summary = Object.entries(results.tests).map(([k, v]) => k + ": " + (v.pass ? "PASS" : "FAIL")).join("\n");
  return JSON.stringify(results, null, 2);
}
