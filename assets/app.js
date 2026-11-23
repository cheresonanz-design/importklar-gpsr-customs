(function () {
  "use strict";
  const engine = window.ImportKlarEngine;
  if (!engine) return;
  let lastRes = null;
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function readPayload() {
    return {
      product_name: el("prodName").value,
      sku: el("skuInput").value,
      gtin_or_batch: el("gtinInput").value,
      manufacturer_name: el("mfgName").value,
      manufacturer_contact: el("mfgContact").value,
      manufacturer_country: el("mfgCountry").value,
      non_eu_manufacturer: el("nonEuCheck").checked,
      eu_rp_name: el("euRpName").value,
      eu_rp_contact: el("euRpContact").value,
      safety_warnings_de_eu: el("safetyCheck").checked,
      ce_required: el("ceReqCheck").checked,
      ce_tech_docs_ready: el("ceDocsCheck").checked,
      hs_taric_code: el("hsCodeInput").value,
      incoterm: el("incotermSelect").value,
      goods_value_eur: Number(el("goodsEur").value || 0),
      base_freight_eur: Number(el("freightEur").value || 0),
      surcharges_eur: Number(el("surchargeEur").value || 0),
      insurance_eur: Number(el("insEur").value || 0),
    };
  }

  function applySample(s) {
    el("prodName").value = s.product_name;
    el("skuInput").value = s.sku;
    el("gtinInput").value = s.gtin_or_batch;
    el("mfgName").value = s.manufacturer_name;
    el("mfgContact").value = s.manufacturer_contact;
    el("mfgCountry").value = s.manufacturer_country;
    el("nonEuCheck").checked = Boolean(s.non_eu_manufacturer);
    el("euRpName").value = s.eu_rp_name;
    el("euRpContact").value = s.eu_rp_contact;
    el("safetyCheck").checked = Boolean(s.safety_warnings_de_eu);
    el("ceReqCheck").checked = Boolean(s.ce_required);
    el("ceDocsCheck").checked = Boolean(s.ce_tech_docs_ready);
    el("hsCodeInput").value = s.hs_taric_code;
    el("incotermSelect").value = s.incoterm;
    el("goodsEur").value = s.goods_value_eur;
    el("freightEur").value = s.base_freight_eur;
    el("surchargeEur").value = s.surcharges_eur;
    el("insEur").value = s.insurance_eur;
    runCheck();
  }

  function runCheck() {
    const res = engine.evaluateImportCompliance(readPayload());
    lastRes = res;
    el("resultCard").classList.remove("hidden");
    el("scoreKpi").textContent = `${res.score_percent} %`;
    el("customsKpi").textContent = `${res.customs_value_eur.toFixed(2)} EUR`;
    el("freightKpi").textContent = `${res.surcharge_ratio_percent.toFixed(1)} %`;
    el("hsKpi").textContent = res.hs_taric_code || "-";
    el("resultHeadline").textContent = res.ok ? `${res.product_name}: Export-/Listing-Ready` : `${res.product_name}: ${res.summary.fail} Sperr-/Prüfrisiken erkannt`;

    el("checksBody").innerHTML = res.checks.map((c) => {
      const cls = c.status === "PASS" ? "badge-pass" : c.status === "WARN" ? "badge-warn" : "badge-fail";
      return `<tr><td><code>${esc(c.id)}</code></td><td><strong>${esc(c.domain)}</strong></td><td><span class="badge ${cls}">${esc(c.status)}</span></td><td><strong>${esc(c.field)}</strong><div class="muted">${esc(c.detail)}</div></td></tr>`;
    }).join("");
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!el("runCheckBtn")) return;
    el("runCheckBtn").addEventListener("click", runCheck);
    el("sampleGapBtn").addEventListener("click", () => applySample(engine.SAMPLES.non_eu_amazon_gaps));
    el("sampleOkBtn").addEventListener("click", () => applySample(engine.SAMPLES.eu_compliant_sku));
    el("sampleFrtBtn").addEventListener("click", () => applySample(engine.SAMPLES.freight_overcharge_alert));
    el("copyMdBtn").addEventListener("click", async () => {
      if (!lastRes || !navigator.clipboard) return;
      await navigator.clipboard.writeText(engine.formatAuditReportMarkdown(lastRes));
      el("copyMdBtn").textContent = "Protokoll kopiert!";
      setTimeout(() => (el("copyMdBtn").textContent = "Markdown-Protokoll kopieren"), 1800);
    });
    el("dlJsonBtn").addEventListener("click", () => {
      if (!lastRes) return;
      const blob = new Blob([engine.formatAuditReportJson(lastRes)], { type: "application/json" });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = "importklar_preflight_audit.json";
      a.click();
      URL.revokeObjectURL(u);
    });
    applySample(engine.SAMPLES.non_eu_amazon_gaps);
  });
})();
