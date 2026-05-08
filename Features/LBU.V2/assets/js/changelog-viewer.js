(function(){
    "use strict";

    var CHANGELOG = {
        currentVersion: "v2.0.9",
        updatedAt: "April 20, 2026",
        entries: [
            {
                version: "v2.0.9",
                date: "2026-04-20",
                summary: "Stage-based loaders and Excel template import flow",
                items: [
                    "CEU and Lingkod Bayan database openings now use clearer stage-based loading messages before the tables appear.",
                    "Full-screen loading now appears only for first-time major page/database loads instead of every Add Record or Report navigation.",
                    "Import Tools now includes a downloadable Lingkod Bayan Excel template and warns before saving workbooks with missing template columns."
                ]
            },
            {
                version: "v2.0.8",
                date: "2026-04-15",
                summary: "Supabase attachments, smarter records search, and audit trail",
                items: [
                    "Lingkod Bayan attachments now use private Supabase Storage with signed preview/download links for history entries.",
                    "Client Records now support stronger filters for barangay, program, status, office, and requested date range.",
                    "Duplicate request checks now warn before saving the same client, request date, and program combination.",
                    "Client detail pages now show recent Supabase audit activity so admins can review who changed a record and when."
                ]
            },
            {
                version: "v2.0.7",
                date: "2026-04-15",
                summary: "Menu update card and history form cleanup",
                items: [
                    "The System Updates card now sits at the bottom of the main menu drawer for a cleaner navigation layout.",
                    "The version card now uses a clearer current-version presentation with a stronger changelog call-to-action.",
                    "Lingkod Bayan's New History Entry form no longer shows the extra section titles, while keeping the fields and helper text intact."
                ]
            },
            {
                version: "v2.0.6",
                date: "2026-04-09",
                summary: "Smoother first category switch in CEU",
                items: [
                    "CEU category switching now keeps the current records visible until the next category is fully ready.",
                    "The outgoing CEU panel now softens briefly during the handoff so first-load category clicks no longer feel like a blank flash.",
                    "The latest category click now wins safely, preventing sudden old-panel flashes when users switch categories quickly."
                ]
            },
            {
                version: "v2.0.5",
                date: "2026-04-09",
                summary: "In-app update viewer",
                items: [
                    "Added a built-in changelog modal so updates can be viewed directly from the menu.",
                    "Version cards now open the latest release notes in the UI instead of pointing only to the markdown file.",
                    "Version labels and patch dates are now synced from one shared changelog viewer script."
                ]
            },
            {
                version: "v2.0.4",
                date: "2026-04-09",
                summary: "Navigation and transition polish",
                items: [
                    "CEU Database category switching now uses a subtle fade-and-rise panel transition.",
                    "CEU Database and Import Tools now match the Client Records header menu button placement and drawer styling.",
                    "Added a shared version card to the main menu of the CEU Database, Client Records, and Import Tools pages."
                ]
            },
            {
                version: "v2.0.3",
                date: "2026-04-09",
                summary: "Faster-feeling CEU load",
                items: [
                    "Removed the temporary CEU loading spinner, skeleton cards, and loading summary text during category initialization.",
                    "Kept the CEU load/error handler only for real category load failures so successful switches feel immediate."
                ]
            },
            {
                version: "v2.0.2",
                date: "2026-04-09",
                summary: "CEU rendering and search optimization",
                items: [
                    "CEU accordion tables now render only when a barangay panel is opened.",
                    "CEU search now debounces typing before filtering large categories.",
                    "CEU records now use compact search indexes instead of the older verbose search text payload."
                ]
            },
            {
                version: "v2.0.1",
                date: "2026-04-09",
                summary: "Initial CEU split and tools page",
                items: [
                    "CEU category datasets now load on demand instead of all at once.",
                    "Import and migration tools were moved into a dedicated admin page.",
                    "Client Assistance navigation was refreshed with the cleaner government-style menu button."
                ]
            }
        ]
    };

    var modalState = {
        root: null,
        closeButton: null,
        restoreFocus: null
    };

    function ensureStyles(){
        if(document.getElementById("lbChangelogViewerStyles")){
            return;
        }

        var style = document.createElement("style");
        style.id = "lbChangelogViewerStyles";
        style.textContent = [
            "body.lb-changelog-open { overflow: hidden; }",
            ".lb-changelog-modal[hidden] { display: none; }",
            ".lb-changelog-modal { position: fixed; inset: 0; z-index: 1500; display: grid; place-items: center; padding: 24px; }",
            ".lb-changelog-backdrop { position: absolute; inset: 0; background: rgba(9, 25, 44, 0.56); backdrop-filter: blur(8px); opacity: 0; transition: opacity 180ms ease; }",
            ".lb-changelog-panel { position: relative; width: min(760px, 100%); max-height: min(84vh, 760px); overflow: hidden; display: grid; grid-template-rows: auto 1fr; border-radius: 24px; border: 1px solid rgba(18, 62, 114, 0.16); background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 255, 0.98)); box-shadow: 0 28px 70px rgba(7, 29, 58, 0.28); transform: translateY(18px) scale(0.985); opacity: 0; transition: transform 220ms cubic-bezier(.2,.8,.2,1), opacity 180ms ease; }",
            ".lb-changelog-modal.is-open .lb-changelog-backdrop { opacity: 1; }",
            ".lb-changelog-modal.is-open .lb-changelog-panel { transform: translateY(0) scale(1); opacity: 1; }",
            ".lb-changelog-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 22px 22px 18px; border-bottom: 1px solid rgba(18, 62, 114, 0.1); background: linear-gradient(135deg, rgba(15, 108, 207, 0.08), rgba(241, 154, 41, 0.12)); }",
            ".lb-changelog-kicker { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 0.74rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--brand-600, #0b4f98); }",
            ".lb-changelog-title { margin: 0; font-family: 'Space Grotesk', 'Arial Narrow', sans-serif; font-size: clamp(1.2rem, 2vw, 1.6rem); color: var(--ink, #122c44); }",
            ".lb-changelog-subtitle { margin: 8px 0 0; color: var(--muted, #667a92); font-size: 0.92rem; line-height: 1.5; }",
            ".lb-changelog-close { width: 40px; height: 40px; flex: 0 0 auto; border: none; border-radius: 12px; background: rgba(15, 108, 207, 0.12); color: var(--brand-600, #0b4f98); font-size: 24px; line-height: 1; cursor: pointer; transition: transform 120ms ease, background 140ms ease; }",
            ".lb-changelog-close:hover { transform: translateY(-1px); background: rgba(15, 108, 207, 0.2); }",
            ".lb-changelog-close:focus-visible { outline: none; box-shadow: 0 0 0 4px rgba(15, 108, 207, 0.18); }",
            ".lb-changelog-body { overflow: auto; padding: 20px 22px 22px; display: grid; gap: 14px; }",
            ".lb-changelog-entry { border: 1px solid rgba(18, 62, 114, 0.12); border-radius: 18px; padding: 16px 18px; background: rgba(255, 255, 255, 0.92); box-shadow: 0 12px 28px rgba(10, 41, 87, 0.08); }",
            ".lb-changelog-entry.is-latest { border-color: rgba(15, 108, 207, 0.22); background: linear-gradient(135deg, rgba(15, 108, 207, 0.08), rgba(255, 255, 255, 0.98)); }",
            ".lb-changelog-entry-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 10px; }",
            ".lb-changelog-version { font-family: 'Space Grotesk', 'Arial Narrow', sans-serif; font-size: 1rem; font-weight: 700; color: var(--ink, #122c44); }",
            ".lb-changelog-date { font-size: 0.8rem; color: var(--muted, #667a92); }",
            ".lb-changelog-badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 5px 10px; background: rgba(15, 108, 207, 0.12); color: var(--brand-600, #0b4f98); font-size: 0.74rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }",
            ".lb-changelog-summary { margin: 0 0 10px; color: var(--ink, #122c44); font-size: 0.92rem; font-weight: 600; }",
            ".lb-changelog-list { margin: 0; padding-left: 18px; color: var(--muted, #667a92); display: grid; gap: 8px; }",
            ".lb-changelog-list li { line-height: 1.55; }",
            ".lb-changelog-footnote { margin: 2px 0 0; color: var(--muted, #667a92); font-size: 0.8rem; text-align: center; }",
            "@media (max-width: 640px) { .lb-changelog-modal { padding: 14px; } .lb-changelog-header { padding: 18px 18px 16px; } .lb-changelog-body { padding: 16px 18px 18px; } }",
            "@media (prefers-reduced-motion: reduce) { .lb-changelog-backdrop, .lb-changelog-panel, .lb-changelog-close { transition: none; } }"
        ].join("\n");
        document.head.appendChild(style);
    }

    function escapeHtml(value){
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function renderEntries(){
        return CHANGELOG.entries.map(function(entry, index){
            var items = entry.items.map(function(item){
                return "<li>" + escapeHtml(item) + "</li>";
            }).join("");

            return [
                "<article class=\"lb-changelog-entry" + (index === 0 ? " is-latest" : "") + "\">",
                "  <div class=\"lb-changelog-entry-head\">",
                "    <span class=\"lb-changelog-version\">" + escapeHtml(entry.version) + "</span>",
                index === 0 ? "    <span class=\"lb-changelog-badge\">Latest Patch</span>" : "",
                "    <span class=\"lb-changelog-date\">" + escapeHtml(entry.date) + "</span>",
                "  </div>",
                "  <p class=\"lb-changelog-summary\">" + escapeHtml(entry.summary) + "</p>",
                "  <ul class=\"lb-changelog-list\">" + items + "</ul>",
                "</article>"
            ].join("\n");
        }).join("\n");
    }

    function buildModal(){
        if(modalState.root){
            return modalState.root;
        }

        var root = document.createElement("div");
        root.id = "lbChangelogModal";
        root.className = "lb-changelog-modal";
        root.hidden = true;
        root.innerHTML = [
            "<div class=\"lb-changelog-backdrop\" data-changelog-close></div>",
            "<section class=\"lb-changelog-panel\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"lbChangelogTitle\">",
            "  <header class=\"lb-changelog-header\">",
            "    <div>",
            "      <div class=\"lb-changelog-kicker\">Current Version " + escapeHtml(CHANGELOG.currentVersion) + "</div>",
            "      <h2 id=\"lbChangelogTitle\" class=\"lb-changelog-title\">System Updates</h2>",
            "      <p class=\"lb-changelog-subtitle\">Here are the latest Lingkod Bayan patches and interface improvements available in this build.</p>",
            "    </div>",
            "    <button class=\"lb-changelog-close\" type=\"button\" aria-label=\"Close updates\" data-changelog-close>&times;</button>",
            "  </header>",
            "  <div class=\"lb-changelog-body\">",
            renderEntries(),
            "    <p class=\"lb-changelog-footnote\">Recent updates are mirrored here for quick viewing inside the app.</p>",
            "  </div>",
            "</section>"
        ].join("\n");

        root.addEventListener("click", function(event){
            if(event.target && event.target.hasAttribute("data-changelog-close")){
                closeModal();
            }
        });

        document.body.appendChild(root);
        modalState.root = root;
        modalState.closeButton = root.querySelector(".lb-changelog-close");
        return root;
    }

    function syncVersionCard(){
        var versionNodes = document.querySelectorAll("[data-changelog-version]");
        versionNodes.forEach(function(node){
            node.textContent = CHANGELOG.currentVersion;
        });

        var updatedNodes = document.querySelectorAll("[data-changelog-updated]");
        updatedNodes.forEach(function(node){
            node.textContent = CHANGELOG.updatedAt;
        });
    }

    function closeOpenMenu(){
        var navOverlay = document.getElementById("navOverlay");
        if(!navOverlay || !navOverlay.classList.contains("is-open")){
            return;
        }

        navOverlay.classList.remove("is-open");
        navOverlay.setAttribute("aria-hidden", "true");
        document.body.classList.remove("menu-open");

        var menuToggle = document.getElementById("menuToggle");
        if(menuToggle){
            menuToggle.setAttribute("aria-expanded", "false");
        }
    }

    function openModal(trigger){
        closeOpenMenu();
        ensureStyles();
        buildModal();

        modalState.restoreFocus = trigger && trigger.closest && trigger.closest("#navOverlay")
            ? document.getElementById("menuToggle")
            : trigger;

        modalState.root.hidden = false;
        document.body.classList.add("lb-changelog-open");

        window.requestAnimationFrame(function(){
            if(modalState.root){
                modalState.root.classList.add("is-open");
            }
            if(modalState.closeButton){
                modalState.closeButton.focus();
            }
        });
    }

    function closeModal(){
        if(!modalState.root || modalState.root.hidden){
            return;
        }

        modalState.root.classList.remove("is-open");
        document.body.classList.remove("lb-changelog-open");

        var restoreFocus = modalState.restoreFocus;
        window.setTimeout(function(){
            if(modalState.root){
                modalState.root.hidden = true;
            }
            if(restoreFocus && typeof restoreFocus.focus === "function"){
                restoreFocus.focus();
            }
        }, 180);
    }

    function isModalOpen(){
        return !!(modalState.root && !modalState.root.hidden);
    }

    function init(){
        var triggers = document.querySelectorAll("[data-changelog-trigger]");
        if(!triggers.length){
            return;
        }

        ensureStyles();
        buildModal();
        syncVersionCard();

        triggers.forEach(function(trigger){
            trigger.addEventListener("click", function(){
                openModal(trigger);
            });
        });

        document.addEventListener("keydown", function(event){
            if(event.key === "Escape" && isModalOpen()){
                closeModal();
            }
        });
    }

    window.lbChangelog = {
        data: CHANGELOG,
        open: function(){
            openModal(document.getElementById("menuToggle"));
        },
        close: closeModal
    };

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
