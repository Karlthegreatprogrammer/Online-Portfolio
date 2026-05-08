/* Minimal Supabase bootstrap for the static Lingkod Bayan pages. */
(function () {
    "use strict";

    let sdkLoadPromise = null;
    let clientPromise = null;

    function getConfig() {
        return window.LBU_SUPABASE_CONFIG || {};
    }

    function isEnabled() {
        const config = getConfig();
        return !!(config.enabled && config.url && config.anonKey);
    }

    function loadSdk() {
        if (window.supabase && typeof window.supabase.createClient === "function") {
            return Promise.resolve(window.supabase);
        }

        if (sdkLoadPromise) {
            return sdkLoadPromise;
        }

        const config = getConfig();
        const sdkUrl = config.sdkUrl || "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

        sdkLoadPromise = new Promise(function (resolve, reject) {
            const script = document.createElement("script");
            script.src = sdkUrl;
            script.async = true;
            script.onload = function () {
                if (window.supabase && typeof window.supabase.createClient === "function") {
                    resolve(window.supabase);
                    return;
                }
                reject(new Error("Supabase SDK loaded but createClient() was not found."));
            };
            script.onerror = function () {
                reject(new Error("Failed to load the Supabase browser SDK."));
            };
            document.head.appendChild(script);
        });

        return sdkLoadPromise;
    }

    function getProjectRef() {
        const config = getConfig();
        if (!config.url) return "";
        try {
            const hostname = new URL(config.url).hostname;
            return hostname.split(".")[0] || "";
        } catch (err) {
            return "";
        }
    }

    function getAuthStorageKey() {
        const projectRef = getProjectRef();
        return projectRef ? "sb-" + projectRef + "-auth-token" : "";
    }

    function getClient() {
        if (!isEnabled()) {
            return Promise.resolve(null);
        }

        if (clientPromise) {
            return clientPromise;
        }

        clientPromise = loadSdk().then(function (sdk) {
            const config = getConfig();
            return sdk.createClient(config.url, config.anonKey, {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true
                }
            });
        });

        return clientPromise;
    }

    window.lbSupabase = {
        getAuthStorageKey: getAuthStorageKey,
        getClient: getClient,
        getConfig: getConfig,
        getProjectRef: getProjectRef,
        isEnabled: isEnabled
    };
})();
