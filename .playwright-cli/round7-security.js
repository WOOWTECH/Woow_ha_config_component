async page => {
  const results = { errors: [], tests: {} };
  page.on("pageerror", err => results.errors.push("pageerror: " + err.message));

  await page.evaluate(() => { window.confirm = () => true; window.alert = () => {}; window.prompt = (msg, def) => def || ""; });

  const FEC = `(function() { function find(root) { if (!root) return null; const el = root.querySelector("config-editor-fullpage"); if (el) return el; for (const h of root.querySelectorAll("*")) { if (h.shadowRoot) { const f = find(h.shadowRoot); if (f) return f; } } return null; } return find(document); })()`;

  // --- 7A: XSS via file content (script tags in YAML) ---
  const xssContent = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    const xssPayloads = [
      "<script>window.__xss_test=true</script>",
      "<img src=x onerror='window.__xss_img=true'>",
      "<svg onload='window.__xss_svg=true'>",
      "{{constructor.constructor('window.__xss_template=true')()}}",
      "${alert('xss')}",
      "javascript:alert(1)",
      "<iframe src='javascript:parent.__xss_iframe=true'>",
      "' onmouseover='window.__xss_attr=true'",
      "<div style='background:url(javascript:window.__xss_css=true)'>",
      "<%- window.__xss_ejs=true %>"
    ];

    // Set content with XSS payloads
    if (el.edit) {
      el.edit.text = xssPayloads.join("\n");
    }
    el.requestUpdate();

    return { payloadsSet: xssPayloads.length };
  }, FEC);
  await page.waitForTimeout(2000);

  // Check if any XSS executed
  const xssExecuted = await page.evaluate(() => {
    return {
      scriptExec: window.__xss_test || false,
      imgExec: window.__xss_img || false,
      svgExec: window.__xss_svg || false,
      templateExec: window.__xss_template || false,
      iframeExec: window.__xss_iframe || false,
      attrExec: window.__xss_attr || false,
      cssExec: window.__xss_css || false,
      ejsExec: window.__xss_ejs || false,
      anyExecuted: !!(window.__xss_test || window.__xss_img || window.__xss_svg || window.__xss_template || window.__xss_iframe || window.__xss_attr || window.__xss_css || window.__xss_ejs)
    };
  });
  results.tests["7A_xss_content_injection"] = {
    pass: xssExecuted.anyExecuted === false,
    detail: { payloads: xssContent.payloadsSet, ...xssExecuted }
  };

  // --- 7B: XSS via filename display ---
  const xssFilename = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    // Inject malicious filename into file list
    const sel = el.shadowRoot.querySelector("select");
    if (!sel) return { error: "no select" };

    const maliciousName = "<img src=x onerror='window.__xss_filename=true'>";
    const opt = document.createElement("option");
    opt.value = maliciousName;
    opt.textContent = maliciousName;
    sel.appendChild(opt);

    return { injected: true };
  }, FEC);
  await page.waitForTimeout(1000);

  const filenameXSS = await page.evaluate(() => window.__xss_filename || false);
  results.tests["7B_xss_filename_injection"] = { pass: filenameXSS === false, detail: { ...xssFilename, executed: filenameXSS } };

  // --- 7C: Prototype pollution via config ---
  const protoPollution = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    try {
      el.setConfig({ "__proto__": { polluted: true }, "constructor": { "prototype": { polluted2: true } } });
      const polluted = ({}).polluted || false;
      const polluted2 = ({}).polluted2 || false;
      return { nocrash: true, prototypePolluted: polluted, constructorPolluted: polluted2 };
    } catch (e) {
      return { nocrash: true, error: e.message };
    }
  }, FEC);
  results.tests["7C_prototype_pollution"] = { pass: protoPollution.prototypePolluted !== true && protoPollution.constructorPolluted !== true, detail: protoPollution };

  // --- 7D: HTML injection in status bar ---
  const statusInjection = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    // Set a file with XSS in its name to be displayed in status
    if (el.edit) {
      el.openedFile = "<b onmouseover='window.__xss_status=true'>test</b>";
      el.requestUpdate();
    }

    const status = el.shadowRoot.querySelector(".status");
    const hasHTMLInStatus = status ? status.innerHTML.includes("<b") : false;
    return { nocrash: true, htmlRendered: hasHTMLInStatus };
  }, FEC);
  await page.waitForTimeout(500);
  const statusXSS = await page.evaluate(() => window.__xss_status || false);
  results.tests["7D_html_injection_status"] = { pass: statusXSS === false, detail: { ...statusInjection, executed: statusXSS } };

  // --- 7E: Path traversal in file operations ---
  const pathTraversal = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    const maliciousPaths = [
      "../../../etc/passwd",
      "..\\..\\..\\windows\\system32\\config\\sam",
      "/etc/shadow",
      "....//....//etc/passwd",
      "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
      "..%252f..%252f..%252fetc%252fpasswd"
    ];

    // These should be passed to backend (which validates), component shouldn't crash
    try {
      for (const path of maliciousPaths) {
        if (el.edit) el.edit.open = path;
        el.requestUpdate();
      }
      return { nocrash: true, testedPaths: maliciousPaths.length };
    } catch (e) {
      return { error: e.message };
    }
  }, FEC);
  results.tests["7E_path_traversal_resilience"] = { pass: pathTraversal.nocrash === true, detail: pathTraversal };

  // --- 7F: Content-Type confusion (binary content) ---
  const binaryContent = await page.evaluate((fec) => {
    const el = eval(fec);
    if (!el || !el.shadowRoot) return { error: "not found" };

    // Set binary-like content
    let binary = "";
    for (let i = 0; i < 256; i++) binary += String.fromCharCode(i);
    binary += "\x89PNG\r\n\x1a\n"; // PNG magic bytes as string

    if (el.edit) {
      el.edit.text = binary;
      el.requestUpdate();
    }

    const host = el.getBoundingClientRect();
    return { nocrash: true, alive: host.width > 0, binaryLength: binary.length };
  }, FEC);
  results.tests["7F_binary_content_handling"] = { pass: binaryContent.nocrash === true, detail: binaryContent };

  await page.waitForTimeout(1000);

  results.totalErrors = results.errors.length;
  results.summary = Object.entries(results.tests).map(([k, v]) => k + ": " + (v.pass ? "PASS" : "FAIL")).join("\n");
  return JSON.stringify(results, null, 2);
}
