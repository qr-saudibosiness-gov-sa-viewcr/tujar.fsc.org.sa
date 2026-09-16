(function () {
  'use strict';

  // Capture the loader URL now; document.currentScript becomes null later.
  var LOADER_SRC = document.currentScript && document.currentScript.src
    ? document.currentScript.src
    : '';

  var FIELD_NAMES = [
    'chamberName', 'service', 'documentNumber', 'applicantName',
    'facilityName', 'membershipNumber', 'unifiedNumber', 'createdAt',
    'statusAccepted', 'statusValidity'
  ];

  function isVerificationRoute() {
    return /\/document-verification\/?$/i.test(window.location.pathname || '');
  }

  function normalizeVisibleUrl() {
    // GitHub Pages may serve the directory as /document-verification/.
    // Hide only the final slash after load so the visible URL becomes:
    // document-verification?documentNumber=...&subscriptionNumber=...
    var path = window.location.pathname || '';
    if (/\/document-verification\/$/i.test(path)) {
      var cleanPath = path.slice(0, -1);
      try {
        history.replaceState(null, document.title, cleanPath + window.location.search + window.location.hash);
      } catch (_) {}
    }
  }

  function getParams() {
    var q = new URLSearchParams(window.location.search || '');
    return {
      documentNumber: (q.get('documentNumber') || '').trim(),
      subscriptionNumber: (q.get('subscriptionNumber') || '').trim()
    };
  }

  function safePart(value) {
    return /^[A-Za-z0-9._-]+$/.test(value || '') ? value : '';
  }

  function dataBaseUrl() {
    // Resolve /data relative to this loader, so it works under any repo/domain path.
    if (LOADER_SRC) return new URL('../data/', LOADER_SRC);
    return new URL('data/', document.baseURI);
  }

  function setField(name, value) {
    var node = document.querySelector('[data-doc-field="' + name + '"]');
    if (node) node.textContent = value == null ? '' : String(value);
  }

  function clearFields() {
    FIELD_NAMES.forEach(function (name) { setField(name, ''); });
    document.documentElement.removeAttribute('data-document-loaded');
    document.documentElement.removeAttribute('data-document-error');
  }

  function findDownloadButton() {
    return Array.prototype.slice.call(document.querySelectorAll('button')).find(function (b) {
      return (b.textContent || '').replace(/\s+/g, ' ').trim().indexOf('تحميل الوثيقة') !== -1;
    });
  }

  function disableDownload() {
    var btn = findDownloadButton();
    if (!btn) return;
    btn.disabled = true;
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
  }

  function wireDownload(data, recordId) {
    var btn = findDownloadButton();
    if (!btn) return;

    var file = String(data.pdfFile || (recordId + '.pdf')).replace(/^\/+/, '');
    btn.disabled = false;
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      var a = document.createElement('a');
      a.href = new URL(file, dataBaseUrl()).href;
      a.download = file.split('/').pop() || (recordId + '.pdf');
      document.body.appendChild(a);
      a.click();
      a.remove();
      return false;
    };
  }

  async function loadRoutes() {
    var url = new URL('routes.json', dataBaseUrl());
    var res = await fetch(url.href, { cache: 'no-store' });
    if (!res.ok) throw new Error('routes.json not found: ' + res.status);
    return await res.json();
  }

  async function loadRecord(documentNumber, subscriptionNumber) {
    var doc = safePart(documentNumber);
    var sub = safePart(subscriptionNumber);
    if (!doc || !sub) throw new Error('Invalid documentNumber/subscriptionNumber');

    // BOTH values now select the record.
    var routeKey = doc + '|' + sub;
    var routes = await loadRoutes();
    var recordId = safePart(String(routes[routeKey] || ''));
    if (!recordId) throw new Error('No route for: ' + routeKey);

    var jsonUrl = new URL(recordId + '.json', dataBaseUrl());
    var res = await fetch(jsonUrl.href, { cache: 'no-store' });
    if (!res.ok) throw new Error('Data file not found: ' + jsonUrl.href + ' (' + res.status + ')');
    var data = await res.json();

    FIELD_NAMES.forEach(function (name) { setField(name, data[name]); });
    wireDownload(data, recordId);
    document.documentElement.setAttribute('data-document-loaded', recordId);
  }

  async function init() {
    clearFields();
    disableDownload();

    // /test/ (or domain root) remains a blank viewer.
    if (!isVerificationRoute()) return;

    var params = getParams();
    // Data loads ONLY when BOTH values exist.
    if (!params.documentNumber || !params.subscriptionNumber) {
      normalizeVisibleUrl();
      return;
    }

    try {
      await loadRecord(params.documentNumber, params.subscriptionNumber);
    } catch (err) {
      console.error('[document-data-loader]', err);
      clearFields();
      disableDownload();
      document.documentElement.setAttribute('data-document-error', '1');
    } finally {
      normalizeVisibleUrl();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
