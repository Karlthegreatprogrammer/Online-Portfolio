(function () {
    "use strict";

    function getPortfolioUrl() {
        if (window.location.protocol === "file:") {
            return "../../projects/lingkod-bayan-monitoring-system/index.html";
        }

        var path = window.location.pathname || "";
        var marker = "/Features/LBU.V2/";
        var index = path.indexOf(marker);

        if (index !== -1) {
            return path.slice(0, index + 1) + "projects/lingkod-bayan-monitoring-system/";
        }

        return "../../projects/lingkod-bayan-monitoring-system/";
    }

    function injectStyle() {
        if (document.getElementById("portfolioExitStyle")) {
            return;
        }

        var style = document.createElement("style");
        style.id = "portfolioExitStyle";
        style.textContent = [
            ".portfolio-exit-button{position:fixed;right:18px;bottom:18px;z-index:9999;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-width:0;width:auto;height:auto;padding:12px 16px;border:1px solid rgba(15,108,207,.22);border-radius:999px;background:#fff;color:#0b4b93;font-family:'Outfit',Arial,sans-serif;font-size:14px;font-weight:800;line-height:1;text-decoration:none;box-shadow:0 16px 36px rgba(10,38,84,.18);transition:transform .2s ease,box-shadow .2s ease,background .2s ease}",
            ".portfolio-exit-button:hover{transform:translateY(-2px);box-shadow:0 20px 44px rgba(10,38,84,.24);background:#f6fbff}",
            ".portfolio-exit-button:focus-visible{outline:3px solid rgba(15,108,207,.28);outline-offset:3px}",
            ".portfolio-exit-button span{display:inline-block}",
            "@media(max-width:560px){.portfolio-exit-button{right:12px;bottom:12px;padding:11px 13px;font-size:13px}.portfolio-exit-button span{display:none}}",
            "@media print{.portfolio-exit-button{display:none!important}}"
        ].join("");
        document.head.appendChild(style);
    }

    function createExitButton() {
        if (document.querySelector(".portfolio-exit-button")) {
            return;
        }

        injectStyle();

        var link = document.createElement("a");
        link.className = "portfolio-exit-button";
        link.href = getPortfolioUrl();
        link.setAttribute("aria-label", "Exit demo and return to KarlForge portfolio");
        link.textContent = "Exit Demo";
        link.addEventListener("click", function (event) {
            var target = link.href;

            if (window.lbAuth && typeof window.lbAuth.logout === "function") {
                event.preventDefault();
                window.lbAuth.logout({ redirect: target });
            }
        });
        document.body.appendChild(link);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", createExitButton);
    } else {
        createExitButton();
    }
})();
