/**
 * ImportKlar (by VeriTakt Collective) — B6 + B8 Client-Side Compliance Engine
 * Deterministic EU-GPSR (VO 2023/988), HS/TARIC Customs & Freight Surcharge Pre-Flight Checker.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ImportKlarEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const VALID_INCOTERMS = new Set([
    "EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP",
  ]);

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  function evaluateImportCompliance(raw) {
    const d = raw || {};
    const sku = String(d.sku || "").trim();
    const gtin = String(d.gtin_or_batch || "").trim();
    const productName = String(d.product_name || "Unbenanntes Produkt").trim();
    const mfgName = String(d.manufacturer_name || "").trim();
    const mfgContact = String(d.manufacturer_contact || "").trim();
    const mfgCountry = String(d.manufacturer_country || "DE").trim().toUpperCase();
    const isNonEu = Boolean(d.non_eu_manufacturer) || !new Set([
      "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE",
    ]).has(mfgCountry);
    const euRpName = String(d.eu_rp_name || "").trim();
    const euRpContact = String(d.eu_rp_contact || "").trim();
    const safetyDocsOk = Boolean(d.safety_warnings_de_eu);
    const ceTechDocsOk = d.ce_required ? Boolean(d.ce_tech_docs_ready) : true;

    const hsCodeRaw = String(d.hs_taric_code || "").replace(/[\s.-]/g, "");
    const incoterm = String(d.incoterm || "").trim().toUpperCase();
    const goodsEur = num(d.goods_value_eur);
    const baseFreightEur = num(d.base_freight_eur);
    const surchargesEur = num(d.surcharges_eur);
    const insuranceEur = num(d.insurance_eur);

    const checks = [];
    const fixes = [];
    const add = (id, domain, status, field, detail, fix = "") => {
      checks.push({ id, domain, status, field, detail });
      if (status !== "PASS" && fix) fixes.push({ id, domain, severity: status, action: fix });
    };

    // GPSR-01: SKU / GTIN / Charge
    if (sku && gtin) {
      add("GPSR-01", "EU-GPSR", "PASS", "Produkt-ID / Charge / GTIN", `SKU '${sku}' mit Kennung '${gtin}' vorhanden.`);
    } else {
      add("GPSR-01", "EU-GPSR", "FAIL", "Produkt-ID / Charge fehlt", "Art. 9 Abs. 5 GPSR verlangt Typen-, Chargen- oder Seriennummer auf Produkt/Listing.", "Eindeutige GTIN/EAN und Chargennummer am Produkt & Listing ergänzen.");
    }

    // GPSR-02: Herstellerangabe + Kontakt
    if (mfgName && mfgContact) {
      add("GPSR-02", "EU-GPSR", "PASS", "Hersteller & Post-/E-Mail-Adresse", `${mfgName} (${mfgCountry}) vollständig angegeben.`);
    } else {
      add("GPSR-02", "EU-GPSR", "FAIL", "Hersteller-Pflichtdaten lückenhaft", "Name, eingetragene Handelsmarke, Postanschrift und elektronische Adresse fehlen.", "Vollständige Herstelleranschrift inkl. E-Mail/URL gemäß Art. 9 Abs. 6 GPSR hinterlegen.");
    }

    // GPSR-03: EU-Verantwortliche Person (Art. 16 bei Drittland-Hersteller)
    if (!isNonEu) {
      add("GPSR-03", "EU-GPSR", "PASS", "EU-Verantwortlicher (Art. 16)", `Hersteller sitzt in der EU (${mfgCountry}) — direkter EU-Ansprechpartner gegeben.`);
    } else if (euRpName && euRpContact) {
      add("GPSR-03", "EU-GPSR", "PASS", "EU-Verantwortlicher (Art. 16)", `Beauftragte EU-Person dokumentiert: ${euRpName}.`);
    } else {
      add(
        "GPSR-03",
        "EU-GPSR",
        "FAIL",
        "EU-Verantwortliche Person fehlt (Art. 16 GPSR)",
        `Bei Herstellung außerhalb der EU (${mfgCountry}) führt fehlender EU-Responsible-Person-Eintrag sofort zu Amazon-/Marktplatz-Sperrungen.`,
        "Benannte EU-Verantwortliche Person (Importeur/Bevollmächtigter mit EU-Adresse & E-Mail) im Listing und auf Verpackung ergänzen."
      );
    }

    // GPSR-04: Sicherheitswarnungen
    if (safetyDocsOk) {
      add("GPSR-04", "EU-GPSR", "PASS", "Sicherheits- & Warnhinweise", "Warnhinweise in Zielmarkt-Sprache (z. B. Deutsch) hinterlegt.");
    } else {
      add("GPSR-04", "EU-GPSR", "FAIL", "Sicherheits- & Warnhinweise fehlen", "Art. 9 Abs. 7 verlangt klare Warnhinweise/Gebrauchsanleitung in Amtssprache des Bestimmungslands.", "Warnhinweis-PDF/Text (DE/EU) am Marketplace-Listing anhängen.");
    }

    // GPSR-05: CE & Technische Doku
    if (ceTechDocsOk) {
      add("GPSR-05", "EU-GPSR", "PASS", "Technische Doku / CE-Konformität", d.ce_required ? "CE & Konformitätserklärung hinterlegt." : "Kein gesonderter CE-Sektor markiert; Risikoanalyse vorliegend.");
    } else {
      add("GPSR-05", "EU-GPSR", "FAIL", "CE / Technische Dokumentation fehlt", "Bei CE-pflichtigem Produkt fehlt interne Risikoanalyse/Konformitätserklärung.", "EU-Konformitätserklärung (DoC) und Risikoakte vor Verkauf ablegen.");
    }

    // CUS-01: HS / CN 8 / TARIC 10
    if (/^\d{8}$|^\d{10}$/.test(hsCodeRaw)) {
      add("CUS-01", "Zoll / HS-TARIC", "PASS", "CN8 / TARIC10 Code", `Valider ${hsCodeRaw.length}-stelliger Zolltarif-Code '${hsCodeRaw}'.`);
    } else if (/^\d{6}$/.test(hsCodeRaw)) {
      add("CUS-01", "Zoll / HS-TARIC", "WARN", "Nur 6-stelliger HS-Code", `Code '${hsCodeRaw}' benötigt für EU-Einfuhranmeldung 8 (CN) bzw. 10 (TARIC) Stellen.`, "Auf 10-stelligen EU-TARIC-Code für ATLAS/Einfuhr erweitern.");
    } else {
      add("CUS-01", "Zoll / HS-TARIC", "FAIL", "Ungültiger HS/TARIC-Code", `Eingabe '${d.hs_taric_code || ""}' ist keine gültige 8- oder 10-stellige Tarifnummer.`, "8-stellige KN- bzw. 10-stellige TARIC-Nummer im Produktstamm hinterlegen.");
    }

    // CUS-02: Incoterms 2020
    if (VALID_INCOTERMS.has(incoterm)) {
      add("CUS-02", "Zoll / HS-TARIC", "PASS", "Incoterms 2020", `Standardisierte Lieferklausel '${incoterm}' gewählt.`);
    } else {
      add("CUS-02", "Zoll / HS-TARIC", "FAIL", "Incoterm ungültig/fehlend", "Fehlender Incoterm 2020 verzögert Zollwert- & Frachtzuordnung.", "Gültige Incoterms 2020 Klausel (z. B. DDP, DAP, CIF, FOB, EXW) angeben.");
    }

    // CUS-03: Zollwert-Berechnung
    const totalCustomsBase = goodsEur + baseFreightEur + insuranceEur;
    if (goodsEur > 0) {
      add("CUS-03", "Zoll / HS-TARIC", "PASS", "Zollwert-Basis (CIF EU-Grenze)", `Warenwert ${goodsEur.toFixed(2)} EUR + Fracht ${baseFreightEur.toFixed(2)} EUR + Vers. ${insuranceEur.toFixed(2)} EUR = ${totalCustomsBase.toFixed(2)} EUR.`);
    } else {
      add("CUS-03", "Zoll / HS-TARIC", "WARN", "Warenwert 0 EUR", "Bitte realistischen Handelsrechnungswert für Zollwertberechnung eingeben.");
    }

    // FRT-01: Frachtrechnungs-Surcharge-Audit
    const surchargePct = baseFreightEur > 0 ? Math.round((surchargesEur / baseFreightEur) * 1000) / 10 : 0;
    if (baseFreightEur <= 0 && surchargesEur > 0) {
      add("FRT-01", "Freight Audit", "FAIL", "Zuschläge ohne Basisfracht", `Nebengebühren (${surchargesEur.toFixed(2)} EUR) ohne vereinbarte Basisfracht gefunden.`, "Speditionsrechnung gegen Ratenblatt prüfen & Gutschrift reklamieren.");
    } else if (surchargePct > 25) {
      add("FRT-01", "Freight Audit", "FAIL", "Surcharge-Anomalie (> 25 %)", `Nebenzuschläge betragen ${surchargePct.toFixed(1)} % (${surchargesEur.toFixed(2)} EUR auf ${baseFreightEur.toFixed(2)} EUR Basisfracht).`, "BAF/CAF/Demurrage-Zuschläge beim Spediteur anfechten.");
    } else if (surchargePct > 15) {
      add("FRT-01", "Freight Audit", "WARN", "Erhöhte Frachtzuschläge (15–25 %)", `Nebenzuschläge bei ${surchargePct.toFixed(1)} % — gegen Spot-Quote abgleichen.`);
    } else {
      add("FRT-01", "Freight Audit", "PASS", "Frachtzuschläge im Normalbereich", `Nebenkostenanteil liegt bei ${surchargePct.toFixed(1)} % (<= 15 %).`);
    }

    const summary = {
      pass: checks.filter((c) => c.status === "PASS").length,
      warn: checks.filter((c) => c.status === "WARN").length,
      fail: checks.filter((c) => c.status === "FAIL").length,
    };
    const score = Math.round(((summary.pass + summary.warn * 0.5) / checks.length) * 100);

    return {
      ok: summary.fail === 0,
      product_name: productName,
      sku,
      hs_taric_code: hsCodeRaw,
      non_eu_manufacturer: isNonEu,
      customs_value_eur: Number(totalCustomsBase.toFixed(2)),
      surcharge_ratio_percent: surchargePct,
      score_percent: score,
      summary,
      checks,
      fixes,
    };
  }

  function formatAuditReportJson(res) {
    return JSON.stringify(
      {
        tool: "ImportKlar EU-GPSR, HS/TARIC & Freight Pre-Flight",
        provider: "ImportKlar by VeriTakt Collective",
        checked_at: new Date().toISOString(),
        ...res,
      },
      null,
      2
    );
  }

  function formatAuditReportMarkdown(res) {
    const lines = [
      `# ImportKlar Pre-Flight Audit — ${res.product_name} (${res.sku || "-"})`,
      ``,
      `- **Score:** **${res.score_percent} %** (PASS ${res.summary.pass} / WARN ${res.summary.warn} / FAIL ${res.summary.fail})`,
      `- **HS / TARIC Code:** \`${res.hs_taric_code || "-"}\` · **Zollwertbasis:** ${res.customs_value_eur.toFixed(2)} EUR`,
      `- **Fracht-Zuschlagquote:** ${res.surcharge_ratio_percent.toFixed(1)} %`,
      ``,
      `| ID | Bereich | Status | Befund |`,
      `| :--- | :--- | :--- | :--- |`,
    ];
    for (const c of res.checks) {
      lines.push(`| ${c.id} | ${c.domain} | **${c.status}** | ${String(c.detail).replace(/\|/g, "/")} |`);
    }
    lines.push(``);
    lines.push(`*100 % lokal im Browser geprüft via ImportKlar (by VeriTakt Collective).*`);
    return lines.join("\n");
  }

  const SAMPLES = {
    non_eu_amazon_gaps: {
      product_name: "USB-C PD Ladestation 65W",
      sku: "IK-PWR-65W",
      gtin_or_batch: "",
      manufacturer_name: "Shenzhen PowerTech Co.",
      manufacturer_contact: "",
      manufacturer_country: "CN",
      non_eu_manufacturer: true,
      eu_rp_name: "",
      eu_rp_contact: "",
      safety_warnings_de_eu: false,
      ce_required: true,
      ce_tech_docs_ready: false,
      hs_taric_code: "850440",
      incoterm: "DDP",
      goods_value_eur: 4200,
      base_freight_eur: 800,
      surcharges_eur: 290,
      insurance_eur: 45,
    },
    eu_compliant_sku: {
      product_name: "Edelstahl Thermoskanne 1L",
      sku: "IK-THM-1000",
      gtin_or_batch: "4260999881122 / LOT-2026-11",
      manufacturer_name: "Hanse Metallwaren GmbH",
      manufacturer_contact: "info@hansemetall.example, Bremen",
      manufacturer_country: "DE",
      non_eu_manufacturer: false,
      eu_rp_name: "Hanse Metallwaren GmbH",
      eu_rp_contact: "Bremen",
      safety_warnings_de_eu: true,
      ce_required: false,
      ce_tech_docs_ready: true,
      hs_taric_code: "9617000010",
      incoterm: "CIF",
      goods_value_eur: 6500,
      base_freight_eur: 620,
      surcharges_eur: 70,
      insurance_eur: 55,
    },
    freight_overcharge_alert: {
      product_name: "Industrie LED Hallenstrahler",
      sku: "IK-LED-200",
      gtin_or_batch: "4012345678901",
      manufacturer_name: "NingboOptics Ltd.",
      manufacturer_contact: "export@ningbooptics.example",
      manufacturer_country: "CN",
      non_eu_manufacturer: true,
      eu_rp_name: "Rhein Compliance GmbH",
      eu_rp_contact: "gpsr@rheincompliance.example",
      safety_warnings_de_eu: true,
      ce_required: true,
      ce_tech_docs_ready: true,
      hs_taric_code: "9405423900",
      incoterm: "FOB",
      goods_value_eur: 11200,
      base_freight_eur: 1200,
      surcharges_eur: 430,
      insurance_eur: 95,
    },
  };

  return {
    evaluateImportCompliance,
    formatAuditReportJson,
    formatAuditReportMarkdown,
    SAMPLES,
  };
});
