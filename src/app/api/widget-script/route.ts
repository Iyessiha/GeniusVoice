export const dynamic = "force-dynamic";

/* Script d'intégration. Le client colle une seule ligne :
 *
 *   <script src="https://app.genius.ci/widget.js" data-key="gv_…" defer></script>
 *
 * On injecte une iframe plutôt que d'écrire dans le DOM de l'hôte : son
 * CSS ne peut pas casser notre interface, notre CSS ne peut pas casser son
 * site, et le micro est négocié proprement via l'attribut `allow`.
 */

function script(appUrl: string): string {
  return `(function () {
  "use strict";
  if (window.__geniusVoiceLoaded) return;
  window.__geniusVoiceLoaded = true;

  var APP = ${JSON.stringify(appUrl)};
  var current = document.currentScript;

  function readConfig() {
    var el = current;
    if (!el) {
      var all = document.querySelectorAll("script[data-key]");
      el = all[all.length - 1];
    }
    if (!el) return null;
    var key = el.getAttribute("data-key");
    if (!key) return null;
    return {
      key: key,
      position: el.getAttribute("data-position") === "left" ? "left" : "right",
      offset: parseInt(el.getAttribute("data-offset") || "20", 10) || 20
    };
  }

  var cfg = readConfig();
  if (!cfg) {
    console.error("[GeniusVoice] attribut data-key manquant sur la balise script.");
    return;
  }

  var BUBBLE = { w: 220, h: 84 };

  var frame = document.createElement("iframe");
  frame.src = APP + "/embed/" + encodeURIComponent(cfg.key);
  frame.title = "Accueil vocal";
  // Sans cette délégation, le navigateur refuse le micro dans une iframe
  // d'origine différente. La valeur par défaut d'une directive est 'src',
  // c'est-à-dire l'origine de l'iframe elle-même : exactement ce qu'il faut.
  frame.allow = "microphone; autoplay";
  frame.setAttribute("allowtransparency", "true");
  frame.style.cssText = [
    "position:fixed",
    "bottom:" + cfg.offset + "px",
    cfg.position + ":" + cfg.offset + "px",
    "width:" + BUBBLE.w + "px",
    "height:" + BUBBLE.h + "px",
    "max-width:calc(100vw - " + cfg.offset * 2 + "px)",
    "max-height:calc(100vh - " + cfg.offset * 2 + "px)",
    "border:0",
    "background:transparent",
    "color-scheme:normal",
    "z-index:2147483000",
    "transition:width .18s ease,height .18s ease"
  ].join(";");

  function mount() {
    (document.body || document.documentElement).appendChild(frame);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  window.addEventListener("message", function (event) {
    // On n'accepte que les messages venant de notre propre iframe.
    if (event.source !== frame.contentWindow) return;
    if (APP.indexOf(event.origin) !== 0) return;
    var data = event.data;
    if (!data || data.type !== "gv:resize") return;
    var w = parseInt(data.w, 10);
    var h = parseInt(data.h, 10);
    if (!w || !h || w > 720 || h > 1200) return;
    frame.style.width = w + "px";
    frame.style.height = h + "px";
  });

  window.GeniusVoice = {
    open: function () {
      frame.contentWindow && frame.contentWindow.postMessage({ type: "gv:open" }, APP);
    },
    remove: function () {
      frame.remove();
      window.__geniusVoiceLoaded = false;
    }
  };
})();
`;
}

export function GET(req: Request) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  return new Response(script(appUrl), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
