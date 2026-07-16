/*
 * Prototype behaviour injected into the saved Data Processing Engine definition
 * pages (1stdpe.html, 2nddpe.html, dpe_definition_2_2.html).
 *
 * Intercepts the page's "Run Definition" button and drives a two-step
 * "Run definition?" confirmation modal, then shows a success toast.
 */
(function () {
  'use strict';

  var ROOT_ID = 'dpe-run-modal-root';
  if (document.getElementById(ROOT_ID)) return;

  var style = document.createElement('style');
  style.textContent = [
    '#' + ROOT_ID + ' *{box-sizing:border-box;font-family:"Salesforce Sans",Arial,sans-serif;}',
    '.dpe-rm-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:99999;display:flex;align-items:center;justify-content:center;}',
    '.dpe-rm-modal{position:relative;background:#fff;width:min(720px,92vw);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.3);overflow:hidden;}',
    '.dpe-rm-close{position:absolute;top:-40px;right:0;width:32px;height:32px;border-radius:50%;background:#fff;border:none;cursor:pointer;font-size:18px;line-height:1;color:#181818;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.25);}',
    '.dpe-rm-header{padding:20px 24px;text-align:center;font-size:20px;font-weight:700;color:#181818;border-bottom:1px solid #e5e5e5;}',
    '.dpe-rm-body{padding:28px 32px;min-height:96px;color:#3e3e3c;font-size:15px;line-height:1.5;}',
    '.dpe-rm-body p{margin:0;}',
    '.dpe-rm-step2-label{font-size:14px;color:#444;margin:0 0 14px;}',
    '.dpe-rm-check{display:flex;align-items:center;gap:10px;font-size:15px;color:#181818;cursor:pointer;}',
    '.dpe-rm-check input{width:16px;height:16px;}',
    '.dpe-rm-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;border-top:1px solid #e5e5e5;}',
    '.dpe-rm-footer-right{display:flex;gap:12px;}',
    '.dpe-rm-btn{height:36px;padding:0 18px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid #c9c9c9;background:#fff;color:#0176d3;}',
    '.dpe-rm-btn:hover{background:#f4f6f9;}',
    '.dpe-rm-btn--brand{background:#0176d3;border-color:#0176d3;color:#fff;}',
    '.dpe-rm-btn--brand:hover{background:#014486;}',
    '.dpe-rm-progress{display:flex;align-items:center;gap:0;flex:1;justify-content:center;max-width:360px;margin:0 12px;}',
    '.dpe-rm-dot{width:14px;height:14px;border-radius:50%;border:2px solid #0176d3;background:#fff;flex:0 0 auto;}',
    '.dpe-rm-dot--done{background:#0176d3;}',
    '.dpe-rm-line{height:2px;background:#c9c9c9;flex:1 1 auto;}',
    '.dpe-rm-line--done{background:#0176d3;}',
    '.dpe-toast{position:fixed;top:76px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:12px;background:#2e844a;color:#fff;padding:12px 16px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.25);font-size:14px;font-weight:600;max-width:90vw;}',
    '.dpe-toast svg{flex:0 0 auto;}',
    '.dpe-toast-close{background:none;border:none;color:#fff;cursor:pointer;font-size:16px;line-height:1;padding:0 2px;}'
  ].join('');
  document.head.appendChild(style);

  var state = { step: 1 };
  var overlay = null;

  function close() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    state.step = 1;
  }

  function progress(step) {
    return (
      '<span class="dpe-rm-dot dpe-rm-dot--done"></span>' +
      '<span class="dpe-rm-line ' + (step >= 2 ? 'dpe-rm-line--done' : '') + '"></span>' +
      '<span class="dpe-rm-dot ' + (step >= 2 ? 'dpe-rm-dot--done' : '') + '"></span>'
    );
  }

  function render() {
    var body, footerLeft, footerRight;
    if (state.step === 1) {
      body =
        '<p>Results are written back to the target objects after the run is complete. ' +
        "We're just making sure that's what you want.</p>";
      footerLeft = '<button class="dpe-rm-btn" data-act="never">Never Mind</button>';
      footerRight =
        '<button class="dpe-rm-btn" data-act="cancel">Cancel</button>' +
        '<button class="dpe-rm-btn dpe-rm-btn--brand" data-act="next">Next</button>';
    } else {
      body =
        '<p class="dpe-rm-step2-label">Select Nodes for Output Record Count</p>' +
        '<label class="dpe-rm-check"><input type="checkbox" id="dpe-rm-showcount" />' +
        'Show output record count for nodes</label>';
      footerLeft = '<button class="dpe-rm-btn" data-act="back">Back</button>';
      footerRight =
        '<button class="dpe-rm-btn" data-act="cancel">Cancel</button>' +
        '<button class="dpe-rm-btn dpe-rm-btn--brand" data-act="run">Run Definition</button>';
    }

    overlay.innerHTML =
      '<div class="dpe-rm-modal" role="dialog" aria-modal="true" aria-label="Run definition">' +
      '<button class="dpe-rm-close" data-act="cancel" aria-label="Close">\u00d7</button>' +
      '<div class="dpe-rm-header">Run definition?</div>' +
      '<div class="dpe-rm-body">' + body + '</div>' +
      '<div class="dpe-rm-footer">' + footerLeft +
      '<span class="dpe-rm-progress">' + progress(state.step) + '</span>' +
      '<span class="dpe-rm-footer-right">' + footerRight + '</span>' +
      '</div></div>';
  }

  function open() {
    state.step = 1;
    overlay = document.createElement('div');
    overlay.id = ROOT_ID;
    overlay.className = 'dpe-rm-backdrop';
    render();
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { close(); return; }
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'cancel' || act === 'never') close();
      else if (act === 'next') { state.step = 2; render(); }
      else if (act === 'back') { state.step = 1; render(); }
      else if (act === 'run') { close(); showToast(); }
    });
    document.body.appendChild(overlay);
  }

  function showToast() {
    var toast = document.createElement('div');
    toast.className = 'dpe-toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
      '<circle cx="10" cy="10" r="10" fill="#fff"/>' +
      '<path d="M5.5 10.3l2.7 2.7 6-6.4" stroke="#2e844a" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '<span>Definition run started successfully. Results will be written back once the run completes.</span>' +
      '<button class="dpe-toast-close" aria-label="Close">\u00d7</button>';
    toast.querySelector('.dpe-toast-close').addEventListener('click', function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    });
    document.body.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 5000);
  }

  // Intercept the page's own "Run Definition" trigger (capture phase so it fires
  // before any dead handlers in the saved snapshot).
  document.addEventListener(
    'click',
    function (e) {
      if (e.target.closest('#' + ROOT_ID)) return; // ignore clicks inside our modal
      var trigger = e.target.closest('button, a, [role="button"]');
      if (!trigger) return;
      var label = (trigger.getAttribute('title') || trigger.textContent || '').trim();
      if (label === 'Run Definition') {
        e.preventDefault();
        e.stopPropagation();
        open();
      }
    },
    true
  );
})();
