#!/usr/bin/env node
/**
 * Sanity-check Odoo document URL builders (no /odoo/web/...).
 */
import assert from "node:assert/strict";

const BASE = "https://alomraniah.odoo.com/odoo";

function parseOdooUrlBases(baseUrl) {
  let t = String(baseUrl ?? "").trim().replace(/\/+$/g, "");
  t = t.replace(/\/web$/i, "");
  t = t.replace(/(?:\/odoo)+$/i, "/odoo");
  const webRoot = t.replace(/\/odoo$/i, "") || t;
  const appRoot = /\/odoo$/i.test(t) ? t : `${t}/odoo`;
  const origin = new URL(webRoot).origin;
  return { origin, appRoot, webRoot };
}

function odooDocumentDownloadUrl(baseUrl, id) {
  const { webRoot } = parseOdooUrlBases(baseUrl);
  return `${webRoot}/web/content/${id}?download=true`;
}

function odooDocumentsAppUrl(baseUrl, folderId) {
  const { appRoot } = parseOdooUrlBases(baseUrl);
  const params = new URLSearchParams({ view_type: "list" });
  if (folderId != null && folderId > 0) params.set("folder_id", String(folderId));
  return `${appRoot}/documents?${params.toString()}`;
}

function odooDocumentsRecordUrl(baseUrl, id) {
  const { appRoot } = parseOdooUrlBases(baseUrl);
  return `${appRoot}/documents/${id}`;
}

function odooWebRecordFormUrl(baseUrl, model, resId) {
  const { webRoot } = parseOdooUrlBases(baseUrl);
  return `${webRoot}/web#id=${resId}&model=${encodeURIComponent(model)}&view_type=form`;
}

const { appRoot, webRoot } = parseOdooUrlBases(BASE);
assert.equal(appRoot, "https://alomraniah.odoo.com/odoo");
assert.equal(webRoot, "https://alomraniah.odoo.com");

const download = odooDocumentDownloadUrl(BASE, 99);
assert.equal(download, "https://alomraniah.odoo.com/web/content/99?download=true");
assert.ok(!download.includes("/odoo/web"), `bad download url: ${download}`);

const docsList = odooDocumentsAppUrl(BASE);
assert.equal(docsList, "https://alomraniah.odoo.com/odoo/documents?view_type=list");
assert.ok(!docsList.includes("/odoo/odoo"), `double odoo: ${docsList}`);

const docsFolder = odooDocumentsAppUrl(BASE, 5840);
assert.ok(docsFolder.includes("folder_id=5840"), docsFolder);
assert.ok(docsFolder.startsWith("https://alomraniah.odoo.com/odoo/documents"), docsFolder);

const docRecord = odooDocumentsRecordUrl(BASE, 5840);
assert.equal(docRecord, "https://alomraniah.odoo.com/odoo/documents/5840");

const projectForm = odooWebRecordFormUrl(BASE, "project.project", 5);
assert.equal(projectForm, "https://alomraniah.odoo.com/web#id=5&model=project.project&view_type=form");
assert.ok(!projectForm.includes("/odoo/web"), `bad form url: ${projectForm}`);

console.log("[odoo-links:check] OK — URL patterns match /odoo/* apps and /web/* legacy paths.");
