(function () {
  "use strict";
  const engine = window.ImportKlarEsgEngine;
  if (!engine) return;

  let commodities = engine.SAMPLES.s1.commodities.map((x) => ({ ...x }));
  let lastRes = null;

  const el = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  function commoditiesToCsv() {
    const hdr = "SKU;Bezeichnung;HS_Code;Ursprung;Warenwert_EUR;GeoJSON_OK;TRACES_DDS";
    const rows = commodities.map((c) =>
      [c.sku, c.label, c.hs_code, c.origin, c.volume_eur, c.geo_polygon_ok ? "1" : "0", c.traces_dds_ref || ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";")
    );
    return [hdr, ...rows].join("\n");
  }

  function parseCsv(text) {
    const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    lines.forEach((line, idx) => {
      const sep = line.includes(";") ? ";" : ",";
      const cols = line.split(sep).map((x) => x.replace(/^"|"$/g, "").trim());
      if (idx === 0 && /^sku$/i.test(cols[0] || "")) return;
      if (!cols[0] && !cols[1]) return;
      out.push({
        sku: cols[0] || `SKU-${out.length + 1}`,
        label: cols[1] || "Rohstoffposition",
        hs_code: cols[2] || "",
        origin: cols[3] || "DE",
        volume_eur: parseFloat(String(cols[4] || "0").replace(",", ".")) || 0,
        geo_polygon_ok: ["1", "true", "ja", "yes"].includes(String(cols[5] || "").toLowerCase()),
        traces_dds_ref: cols[6] || "",
      });
    });
    return out;
  }

  function syncCsv() {
    if (el("batchCsvInput")) el("batchCsvInput").value = commoditiesToCsv();
  }

  function applySample(s) {
    el("profileInput").value = s.profile_name;
    el("modeSelect").value = s.mode;
    el("toneSelect").value = s.tone;
    el("elecInput").value = s.vsme.electricity_kwh;
    el("greenPowerCheck").checked = Boolean(s.vsme.green_power);
    el("gasInput").value = s.vsme.gas_kwh;
    el("dieselInput").value = s.vsme.diesel_liters;
    el("scope3Input").value = s.vsme.scope3_spend_eur;
    commodities = (s.commodities || []).map((x) => ({ ...x }));
    syncCsv();
    runCheck();
  }

  function runCheck() {
    const res = engine.evaluateEsgAndEudr({
      profile_name: el("profileInput").value,
      mode: el("modeSelect").value,
      tone: el("toneSelect").value,
      vsme: {
        electricity_kwh: parseFloat(el("elecInput").value) || 0,
        green_power: Boolean(el("greenPowerCheck").checked),
        gas_kwh: parseFloat(el("gasInput").value) || 0,
        diesel_liters: parseFloat(el("dieselInput").value) || 0,
        scope3_spend_eur: parseFloat(el("scope3Input").value) || 0,
      },
      commodities,
    });
    lastRes = res;
    el("resultCard").classList.remove("hidden");
    el("kpi1Val").textContent = `${res.readiness_percent.toFixed(1)} %`;
    el("kpi2Val").textContent = `${res.co2e_totals.total_t.toFixed(2)} t CO2e`;
    el("kpi3Val").textContent = `${res.impact_eur.toFixed(2)} EUR`;
    el("kpi4Val").textContent = `${res.summary.fail_count} FAIL / ${res.summary.warn_count} WARN`;
    el("resultHeadline").textContent = res.ok
      ? `${res.profile_name}: VSME & EUDR Nachweise vollständig (${res.co2e_totals.total_t.toFixed(2)} t CO2e)`
      : `${res.profile_name}: ${res.summary.fail_count + res.summary.warn_count} Nachweis-Lücken erkannt`;
    el("actionBox").value = res.action_text;

    el("entriesBody").innerHTML = res.entries
      .map((e) => {
        const cls = e.status === "PASS" ? "badge-pass" : e.status === "WARN" ? "badge-warn" : "badge-fail";
        const canDel = !e.id.startsWith("VSME-");
        const delBtn = canDel
          ? `<button type="button" class="btn btn-sm remove-item-btn" data-sku="${esc(e.id)}">&times;</button>`
          : "";
        return `<tr>
          <td><code>${esc(e.id)}</code></td>
          <td><strong>${esc(e.label)}</strong><div class="muted">${esc(e.category)}</div></td>
          <td>${esc(e.metric_label)}</td>
          <td>${e.impact_eur.toFixed(2)} EUR</td>
          <td><span class="badge ${cls}">${esc(e.status)}</span></td>
          <td>${esc(e.note)}</td>
          <td>${delBtn}</td>
        </tr>`;
      })
      .join("");
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!el("runCheckBtn")) return;
    el("runCheckBtn").addEventListener("click", runCheck);
    el("modeSelect").addEventListener("change", runCheck);
    el("toneSelect").addEventListener("change", runCheck);
    el("sample1Btn").addEventListener("click", () => applySample(engine.SAMPLES.s1));
    el("sample2Btn").addEventListener("click", () => applySample(engine.SAMPLES.s2));
    el("sample3Btn").addEventListener("click", () => applySample(engine.SAMPLES.s3));

    if (el("addCommodityBtn")) {
      el("addCommodityBtn").addEventListener("click", () => {
        const label = (el("comLabelInput").value || "").trim();
        if (!label) return el("comLabelInput").focus();
        commodities.push({
          sku: (el("comSkuInput").value || "").trim() || `SKU-${commodities.length + 1}`,
          label,
          hs_code: (el("comHsInput").value || "").trim(),
          origin: (el("comOriginInput").value || "BR").trim().toUpperCase(),
          volume_eur: parseFloat(el("comVolInput").value) || 0,
          geo_polygon_ok: Boolean(el("comGeoCheck").checked),
          traces_dds_ref: (el("comDdsInput").value || "").trim(),
        });
        el("comLabelInput").value = "";
        el("comSkuInput").value = "";
        syncCsv();
        runCheck();
      });
    }

    el("clearItemsBtn").addEventListener("click", () => {
      commodities = [];
      syncCsv();
      runCheck();
    });

    el("applyCsvBtn").addEventListener("click", () => {
      commodities = parseCsv(el("batchCsvInput").value);
      syncCsv();
      runCheck();
    });

    el("entriesBody").addEventListener("click", (ev) => {
      const btn = ev.target.closest(".remove-item-btn");
      if (!btn) return;
      const sku = btn.getAttribute("data-sku");
      commodities = commodities.filter((c) => c.sku !== sku);
      syncCsv();
      runCheck();
    });

    el("copyActionBtn").addEventListener("click", async () => {
      if (!lastRes || !navigator.clipboard) return;
      await navigator.clipboard.writeText(lastRes.action_text);
      el("copyActionBtn").textContent = "Text kopiert!";
      setTimeout(() => (el("copyActionBtn").textContent = "Antwortbogen kopieren"), 1800);
    });
    el("dlCsvBtn").addEventListener("click", () => {
      if (!lastRes) return;
      const blob = new Blob([lastRes.export_csv], { type: "text/csv;charset=utf-8" });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = "importklar_vsme_eudr_export.csv";
      a.click();
      URL.revokeObjectURL(u);
    });
    el("dlJsonBtn").addEventListener("click", () => {
      if (!lastRes) return;
      const blob = new Blob([engine.formatAuditReportJson(lastRes)], { type: "application/json" });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = "importklar_vsme_eudr_audit.json";
      a.click();
      URL.revokeObjectURL(u);
    });

    applySample(engine.SAMPLES.s1);
  });
})();
