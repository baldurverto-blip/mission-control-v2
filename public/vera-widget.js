/**
 * vera-widget.js — Vera support widget
 *
 * Embed on any page:
 *   <script src="https://your-mc.app/vera-widget.js"
 *           data-workspace-id="YOUR_WORKSPACE_ID">
 *   </script>
 *
 * Captures local context (console errors, network failures, last 10 UI actions)
 * and passes it to the widget iframe via postMessage.
 * Context is only transmitted to the server after the user grants consent.
 *
 * Target: <20KB uncompressed.
 */
(function () {
  "use strict";

  // ── Config ─────────────────────────────────────────────────────────────────
  var script = document.currentScript;
  var workspaceId = script && script.getAttribute("data-workspace-id");
  var apiBase =
    (script && script.getAttribute("data-api-url")) ||
    (function () {
      var src = (script && script.src) || "";
      var m = src.match(/^(https?:\/\/[^/]+)/);
      return m ? m[1] : "";
    })();

  if (!workspaceId) {
    console.warn("[Vera] data-workspace-id is required. Widget not loaded.");
    return;
  }

  // ── Circular buffer ─────────────────────────────────────────────────────────
  function CircularBuffer(max) {
    this.buf = [];
    this.max = max;
  }
  CircularBuffer.prototype.push = function (item) {
    if (this.buf.length >= this.max) this.buf.shift();
    this.buf.push(item);
  };
  CircularBuffer.prototype.all = function () {
    return this.buf.slice();
  };

  // ── Context capture ─────────────────────────────────────────────────────────
  var consoleErrors = new CircularBuffer(20);
  var networkFailures = new CircularBuffer(20);
  var uiActions = new CircularBuffer(10);

  // Console errors
  var _origError = console.error.bind(console);
  var _origWarn = console.warn.bind(console);

  console.error = function () {
    _origError.apply(console, arguments);
    try {
      consoleErrors.push({
        level: "error",
        message: Array.from(arguments)
          .map(function (a) {
            return typeof a === "string" ? a : String(a);
          })
          .join(" ")
          .slice(0, 500),
        timestamp: Date.now(),
      });
    } catch (e) {}
  };

  console.warn = function () {
    _origWarn.apply(console, arguments);
    try {
      consoleErrors.push({
        level: "warn",
        message: Array.from(arguments)
          .map(function (a) {
            return typeof a === "string" ? a : String(a);
          })
          .join(" ")
          .slice(0, 300),
        timestamp: Date.now(),
      });
    } catch (e) {}
  };

  // Network failures via fetch + XHR interception
  var _origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url =
      typeof input === "string"
        ? input
        : input instanceof Request
        ? input.url
        : String(input);
    var method = (init && init.method) || "GET";
    return _origFetch.apply(this, arguments).then(
      function (res) {
        if (!res.ok && res.status >= 400) {
          networkFailures.push({
            url: url.slice(0, 200),
            status: res.status,
            method: method.toUpperCase(),
            timestamp: Date.now(),
          });
        }
        return res;
      },
      function (err) {
        networkFailures.push({
          url: url.slice(0, 200),
          status: 0,
          method: method.toUpperCase(),
          timestamp: Date.now(),
        });
        throw err;
      }
    );
  };

  // UI actions — clicks and significant keyups (form submits)
  document.addEventListener(
    "click",
    function (e) {
      try {
        var el = e.target;
        var tag = el.tagName ? el.tagName.toLowerCase() : "?";
        var id = el.id ? "#" + el.id : "";
        var cls =
          el.className && typeof el.className === "string"
            ? "." + el.className.split(" ")[0]
            : "";
        uiActions.push({
          type: "click",
          target: (tag + id + cls).slice(0, 60),
          timestamp: Date.now(),
        });
      } catch (e) {}
    },
    { capture: true, passive: true }
  );

  document.addEventListener(
    "submit",
    function (e) {
      try {
        var form = e.target;
        var action = (form.action || "").replace(/^https?:\/\/[^/]+/, "").slice(0, 60);
        uiActions.push({
          type: "submit",
          target: "form" + (action ? ":" + action : ""),
          timestamp: Date.now(),
        });
      } catch (e) {}
    },
    { capture: true, passive: true }
  );

  // ── Widget UI ───────────────────────────────────────────────────────────────
  var isOpen = false;
  var iframe = null;

  function getContext() {
    return {
      workspace_id: workspaceId,
      page_url: window.location.href,
      page_title: document.title,
      user_agent: navigator.userAgent,
      referrer: document.referrer || undefined,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      console_errors: consoleErrors.all(),
      network_failures: networkFailures.all(),
      recent_actions: uiActions.all(),
    };
  }

  // ── Share-screen button (lives in parent context for getDisplayMedia access) ──
  var shareBtn = null;

  function removeShareBtn() {
    if (shareBtn) { shareBtn.remove(); shareBtn = null; }
  }

  function createShareBtn(caseId) {
    if (shareBtn) return;
    shareBtn = document.createElement("button");
    shareBtn.textContent = "Share screen with Vera";
    Object.assign(shareBtn.style, {
      position: "absolute",
      bottom: "12px",
      right: "18px",
      fontSize: "11px",
      fontWeight: "600",
      color: "#BC6143",
      background: "transparent",
      border: "none",
      padding: "0",
      cursor: "pointer",
      letterSpacing: "0.02em",
      zIndex: "1",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
    });
    shareBtn.addEventListener("click", function () {
      captureAndShare(caseId);
    });
    var drawer = document.getElementById("vera-drawer");
    if (drawer) drawer.appendChild(shareBtn);
  }

  function captureAndShare(caseId) {
    if (!shareBtn || !iframe) return;
    shareBtn.textContent = "Capturing…";
    shareBtn.disabled = true;

    navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: false })
      .then(function (stream) {
        var video = document.createElement("video");
        video.srcObject = stream;
        video.muted = true;
        return new Promise(function (resolve) {
          video.onloadedmetadata = function () {
            video.play().then(function () { resolve(video); });
          };
        }).then(function (v) {
          var vid = /** @type {HTMLVideoElement} */ (v);
          var canvas = document.createElement("canvas");
          canvas.width = vid.videoWidth;
          canvas.height = vid.videoHeight;
          canvas.getContext("2d").drawImage(vid, 0, 0);
          stream.getTracks().forEach(function (t) { t.stop(); });
          vid.srcObject = null;
          return canvas.toDataURL("image/jpeg", 0.6);
        });
      })
      .then(function (screenshotData) {
        iframe.contentWindow.postMessage(
          { type: "VERA_SCREENSHOT", case_id: caseId, screenshot_data: screenshotData },
          "*"
        );
        shareBtn.textContent = "✓ Vera can see your screen";
        shareBtn.style.color = "#76875A";
        shareBtn.style.cursor = "default";
      })
      .catch(function () {
        if (!shareBtn) return;
        shareBtn.textContent = "Share failed — try again";
        shareBtn.style.color = "#D94F3D";
        shareBtn.disabled = false;
        setTimeout(function () {
          if (!shareBtn) return;
          shareBtn.textContent = "Share screen with Vera";
          shareBtn.style.color = "#BC6143";
        }, 3000);
      });
  }

  // Listen for messages from iframe
  window.addEventListener("message", function (e) {
    if (!iframe) return;
    try {
      if (e.source !== iframe.contentWindow) return;
      if (!e.data) return;
      if (e.data.type === "VERA_REQUEST_CONTEXT") {
        iframe.contentWindow.postMessage(
          { type: "VERA_CONTEXT", payload: getContext() },
          "*"
        );
      }
      if (e.data.type === "VERA_WAITING") {
        createShareBtn(e.data.case_id);
      }
    } catch (err) {}
  });

  function openWidget() {
    if (isOpen) return;
    isOpen = true;

    // Backdrop
    var backdrop = document.createElement("div");
    backdrop.id = "vera-backdrop";
    Object.assign(backdrop.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(42,41,39,0.25)",
      zIndex: "2147483645",
      opacity: "0",
      transition: "opacity 0.2s ease",
    });
    backdrop.addEventListener("click", closeWidget);

    // Drawer
    var drawer = document.createElement("div");
    drawer.id = "vera-drawer";
    Object.assign(drawer.style, {
      position: "fixed",
      bottom: "0",
      right: "0",
      width: "100%",
      maxWidth: "380px",
      height: "520px",
      zIndex: "2147483646",
      borderRadius: "12px 12px 0 0",
      overflow: "hidden",
      boxShadow: "0 -4px 32px rgba(42,41,39,0.18)",
      transform: "translateY(100%)",
      transition: "transform 0.25s cubic-bezier(0.32,0.72,0,1)",
    });

    // Iframe
    iframe = document.createElement("iframe");
    iframe.src = apiBase + "/widget?ws=" + encodeURIComponent(workspaceId);
    iframe.title = "Vera Support";
    iframe.setAttribute("allow", "");
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-forms allow-same-origin"
    );
    Object.assign(iframe.style, {
      width: "100%",
      height: "100%",
      border: "none",
      display: "block",
    });

    drawer.appendChild(iframe);
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);

    // Animate in
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        backdrop.style.opacity = "1";
        drawer.style.transform = "translateY(0)";
      });
    });

    // Hide launcher while open
    var launcher = document.getElementById("vera-launcher");
    if (launcher) launcher.style.opacity = "0";
  }

  function closeWidget() {
    if (!isOpen) return;

    var backdrop = document.getElementById("vera-backdrop");
    var drawer = document.getElementById("vera-drawer");
    var launcher = document.getElementById("vera-launcher");

    if (backdrop) backdrop.style.opacity = "0";
    if (drawer) drawer.style.transform = "translateY(100%)";

    setTimeout(function () {
      if (backdrop) backdrop.remove();
      if (drawer) drawer.remove();
      if (launcher) launcher.style.opacity = "1";
      removeShareBtn();
      iframe = null;
      isOpen = false;
    }, 280);
  }

  // ── Launcher button ─────────────────────────────────────────────────────────
  function createLauncher() {
    var btn = document.createElement("button");
    btn.id = "vera-launcher";
    btn.setAttribute("aria-label", "Open support");
    btn.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      width: "52px",
      height: "52px",
      borderRadius: "50%",
      background: "#BC6143",
      color: "#FAF7F1",
      border: "none",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 2px 16px rgba(188,97,67,0.35)",
      zIndex: "2147483644",
      transition: "transform 0.15s ease, box-shadow 0.15s ease, opacity 0.2s ease",
    });

    btn.addEventListener("mouseenter", function () {
      btn.style.transform = "scale(1.06)";
      btn.style.boxShadow = "0 4px 24px rgba(188,97,67,0.45)";
    });
    btn.addEventListener("mouseleave", function () {
      btn.style.transform = "scale(1)";
      btn.style.boxShadow = "0 2px 16px rgba(188,97,67,0.35)";
    });
    btn.addEventListener("click", openWidget);

    document.body.appendChild(btn);
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createLauncher);
  } else {
    createLauncher();
  }
})();
