/* Shared auth/session helper for Lingkod Bayan pages.
   Uses Supabase Auth when configured, otherwise falls back to local browser auth. */
(function () {
    "use strict";

    const AUTH_PROFILE_KEY = "lb_auth_profile_v1";
    const AUTH_SESSION_KEY = "lb_auth_session_v1";
    const CLOUD_ADMIN_PROFILE_KEY = "lb_cloud_admin_profile_v1";
    const LEGACY_LOGIN_KEY = "loggedIn";
    const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

    function safeParseJSON(raw, fallback) {
        if (!raw) return fallback;
        try {
            return JSON.parse(raw);
        } catch (err) {
            return fallback;
        }
    }

    function isCloudEnabled() {
        return !!(window.lbSupabase && window.lbSupabase.isEnabled && window.lbSupabase.isEnabled());
    }

    function normalizeEmail(value) {
        return String(value || "").trim().toLowerCase();
    }

    function getConfiguredAdminEmails() {
        const config = window.LBU_SUPABASE_CONFIG || {};
        const values = [];

        if (Array.isArray(config.adminEmails)) {
            config.adminEmails.forEach(function (email) {
                const normalized = normalizeEmail(email);
                if (normalized && values.indexOf(normalized) === -1) {
                    values.push(normalized);
                }
            });
        }

        const singleEmail = normalizeEmail(config.adminEmail || "");
        if (singleEmail && values.indexOf(singleEmail) === -1) {
            values.push(singleEmail);
        }

        return values;
    }

    function getConfiguredAdminEmail() {
        const emails = getConfiguredAdminEmails();
        return emails.length ? emails[0] : "";
    }

    function isAllowedCloudEmail(email) {
        const normalized = normalizeEmail(email);
        const allowedEmails = getConfiguredAdminEmails();
        if (!allowedEmails.length) return true;
        return allowedEmails.indexOf(normalized) !== -1;
    }

    function bytesToBase64(bytes) {
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            const sub = bytes.subarray(i, i + chunk);
            binary += String.fromCharCode.apply(null, sub);
        }
        return btoa(binary);
    }

    function fallbackHash(input) {
        let hash = 2166136261;
        for (let i = 0; i < input.length; i += 1) {
            hash ^= input.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        return String(hash >>> 0);
    }

    async function hashString(input) {
        if (window.crypto && window.crypto.subtle && window.TextEncoder) {
            const data = new TextEncoder().encode(input);
            const digest = await window.crypto.subtle.digest("SHA-256", data);
            return bytesToBase64(new Uint8Array(digest));
        }
        return fallbackHash(input);
    }

    async function hashPassword(password, salt) {
        return hashString(salt + ":" + password);
    }

    function randomHex(byteLength) {
        if (window.crypto && window.crypto.getRandomValues) {
            const bytes = new Uint8Array(byteLength);
            window.crypto.getRandomValues(bytes);
            return Array.from(bytes, function (b) {
                return b.toString(16).padStart(2, "0");
            }).join("");
        }
        const alphabet = "abcdef0123456789";
        let out = "";
        for (let i = 0; i < byteLength * 2; i += 1) {
            out += alphabet[Math.floor(Math.random() * alphabet.length)];
        }
        return out;
    }

    function decodeBase64Url(input) {
        try {
            const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
            const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
            return atob(padded);
        } catch (err) {
            return "";
        }
    }

    function decodeJwtPayload(token) {
        if (!token || token.indexOf(".") === -1) return null;
        try {
            return JSON.parse(decodeBase64Url(token.split(".")[1]));
        } catch (err) {
            return null;
        }
    }

    function getStoredCloudSession() {
        if (!isCloudEnabled() || !(window.lbSupabase && window.lbSupabase.getAuthStorageKey)) {
            return null;
        }

        const storageKey = window.lbSupabase.getAuthStorageKey();
        if (!storageKey) return null;

        const parsed = safeParseJSON(localStorage.getItem(storageKey), null);
        if (!parsed) return null;

        const candidates = [];
        if (Array.isArray(parsed)) {
            parsed.forEach(function (item) {
                candidates.push(item);
                if (item && item.currentSession) candidates.push(item.currentSession);
                if (item && item.session) candidates.push(item.session);
            });
        } else {
            candidates.push(parsed);
            if (parsed.currentSession) candidates.push(parsed.currentSession);
            if (parsed.session) candidates.push(parsed.session);
        }

        for (let i = 0; i < candidates.length; i += 1) {
            const candidate = candidates[i];
            if (candidate && candidate.access_token) {
                return candidate;
            }
        }

        return null;
    }

    function getCloudSessionUser(session) {
        return session && session.user && typeof session.user === "object" ? session.user : null;
    }

    function getSessionAal(session) {
        const payload = session && session.access_token ? decodeJwtPayload(session.access_token) : null;
        return String((payload && payload.aal) || "aal1");
    }

    function normalizeCloudAdminProfile(profile) {
        if (!profile || typeof profile !== "object") return null;

        const userId = String(profile.id || profile.userId || "").trim();
        const email = normalizeEmail(profile.email || "");
        const role = String(profile.role || "admin").trim() || "admin";

        if (!userId) return null;

        return {
            userId: userId,
            email: email,
            role: role,
            isActive: profile.is_active !== false && profile.isActive !== false,
            requireMfa: !!(profile.require_mfa || profile.requireMfa),
            updatedAt: String(profile.updated_at || profile.updatedAt || ""),
            verifiedAt: String(profile.verifiedAt || new Date().toISOString())
        };
    }

    function readCloudAdminProfile() {
        return normalizeCloudAdminProfile(
            safeParseJSON(localStorage.getItem(CLOUD_ADMIN_PROFILE_KEY), null)
        );
    }

    function writeCloudAdminProfile(profile) {
        const normalized = normalizeCloudAdminProfile(profile);
        if (!normalized) {
            clearCloudAdminProfile();
            return null;
        }

        localStorage.setItem(CLOUD_ADMIN_PROFILE_KEY, JSON.stringify(normalized));
        return normalized;
    }

    function clearCloudAdminProfile() {
        try {
            localStorage.removeItem(CLOUD_ADMIN_PROFILE_KEY);
        } catch (err) {
            /* ignore */
        }
    }

    function getStoredCloudUserEmail() {
        const session = getStoredCloudSession();
        const user = getCloudSessionUser(session);
        return normalizeEmail(user && user.email);
    }

    function isCloudSessionValid() {
        const session = getStoredCloudSession();
        const user = getCloudSessionUser(session);
        const profile = readCloudAdminProfile();
        if (!session || !session.access_token || !user) return false;

        let expiresAt = Number(session.expires_at || 0);
        if (!expiresAt) {
            const payload = decodeJwtPayload(session.access_token);
            expiresAt = payload && payload.exp ? Number(payload.exp) : 0;
        }

        if (expiresAt && Date.now() >= expiresAt * 1000) {
            return false;
        }

        const userId = String(user.id || "").trim();
        const userEmail = normalizeEmail(user.email || "");

        if (!userId) {
            return false;
        }

        if (!isAllowedCloudEmail(userEmail)) {
            return false;
        }

        if (!profile) {
            return true;
        }

        if (profile.userId !== userId) {
            return false;
        }

        if (!profile.isActive) {
            return false;
        }

        if (profile.email && userEmail && profile.email !== userEmail) {
            return false;
        }

        if (profile.requireMfa && getSessionAal(session) !== "aal2") {
            return false;
        }

        return true;
    }

    async function fetchCloudAdminProfile(client, user) {
        const userId = String(user && user.id || "").trim();
        const userEmail = normalizeEmail(user && user.email || "");
        if (!userId) return null;

        const response = await client
            .from("admin_users")
            .select("id, email, role, is_active, require_mfa, updated_at")
            .eq("id", userId)
            .maybeSingle();

        if (response.error) {
            throw response.error;
        }

        const profile = normalizeCloudAdminProfile(response.data);
        if (!profile || !profile.isActive) {
            return null;
        }

        if (profile.email && userEmail && profile.email !== userEmail) {
            throw new Error("The database-backed admin profile email does not match this account.");
        }

        return profile;
    }

    async function refreshCloudAdminProfile(options) {
        if (!isCloudEnabled()) {
            clearCloudAdminProfile();
            return null;
        }

        const opts = options || {};
        const client = opts.client || await window.lbSupabase.getClient();
        const session = opts.session || getStoredCloudSession();
        const user = opts.user || getCloudSessionUser(session);

        if (!client || !session || !user) {
            clearCloudAdminProfile();
            return null;
        }

        const profile = await fetchCloudAdminProfile(client, user);
        if (!profile) {
            clearCloudAdminProfile();
            if (opts.throwOnFailure) {
                throw new Error("This account is not an active admin in the database.");
            }
            return null;
        }

        if (profile.requireMfa && getSessionAal(session) !== "aal2") {
            clearCloudAdminProfile();
            if (opts.throwOnFailure) {
                throw new Error("This admin account requires MFA before it can access records.");
            }
            return null;
        }

        return writeCloudAdminProfile(profile);
    }

    function getProfile() {
        const parsed = safeParseJSON(localStorage.getItem(AUTH_PROFILE_KEY), null);
        if (!parsed || typeof parsed !== "object") return null;
        if (!parsed.salt || !parsed.hash) return null;
        return parsed;
    }

    function hasProfile() {
        if (isCloudEnabled()) return false;
        return !!getProfile();
    }

    function clearLegacyState() {
        try {
            localStorage.removeItem(LEGACY_LOGIN_KEY);
        } catch (err) {
            /* ignore */
        }
    }

    async function initializePassword(password) {
        if (isCloudEnabled()) {
            throw new Error("Create the admin user in Supabase Auth instead of using local setup.");
        }

        const salt = randomHex(16);
        const hash = await hashPassword(password, salt);
        const profile = {
            username: "admin",
            salt: salt,
            hash: hash,
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
        clearLegacyState();
        return true;
    }

    async function verifyPassword(password) {
        if (isCloudEnabled()) {
            throw new Error("Cloud auth uses Supabase sign-in.");
        }

        const profile = getProfile();
        if (!profile) return false;
        const hashed = await hashPassword(password, profile.salt);
        return hashed === profile.hash;
    }

    function createSession() {
        if (isCloudEnabled()) {
            return true;
        }

        const payload = {
            token: randomHex(24),
            expiresAt: Date.now() + SESSION_TTL_MS
        };
        sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(payload));
        clearLegacyState();
        return payload;
    }

    function clearSession() {
        if (isCloudEnabled()) {
            const storageKey = window.lbSupabase && window.lbSupabase.getAuthStorageKey
                ? window.lbSupabase.getAuthStorageKey()
                : "";
            if (storageKey) {
                try {
                    localStorage.removeItem(storageKey);
                } catch (err) {
                    /* ignore */
                }
            }
            clearCloudAdminProfile();
            return;
        }

        try {
            sessionStorage.removeItem(AUTH_SESSION_KEY);
        } catch (err) {
            /* ignore */
        }
    }

    function isLocalAuthenticated() {
        const session = safeParseJSON(sessionStorage.getItem(AUTH_SESSION_KEY), null);
        if (!session || typeof session !== "object") return false;
        if (!session.expiresAt || Number.isNaN(Number(session.expiresAt))) return false;
        const valid = Date.now() < Number(session.expiresAt);
        if (!valid) {
            clearSession();
        }
        return valid;
    }

    function isAuthenticated() {
        if (isCloudEnabled()) {
            return isCloudSessionValid();
        }
        return isLocalAuthenticated();
    }

    function getLoginUrl() {
        if (window.lbRoutes && typeof window.lbRoutes.href === "function") {
            return window.lbRoutes.href("login");
        }
        return window.location.protocol === "file:" ? "admin-login.html" : "/login";
    }

    function navigateWithRouteHook(target, routeName) {
        if (typeof window.lbBeforeRouteChange === "function") {
            const handled = window.lbBeforeRouteChange({
                routeName: routeName || "",
                target: target,
                replace: false,
                navigate: function () {
                    window.location.href = target;
                }
            });

            if (handled) return;
        }

        window.location.href = target;
    }

    function requireAuth(options) {
        const opts = options || {};
        const redirect = opts.redirect || getLoginUrl();
        if (isAuthenticated()) return true;
        navigateWithRouteHook(redirect, "login");
        return false;
    }

    async function signInWithPassword(options) {
        const opts = options || {};
        const password = String(opts.password || "");

        if (isCloudEnabled()) {
            const email = String(opts.email || getConfiguredAdminEmail() || "").trim();
            if (!email) {
                throw new Error("Admin email is required.");
            }

            if (!isAllowedCloudEmail(email)) {
                throw new Error("This email is not allowed for the admin portal.");
            }

            const client = await window.lbSupabase.getClient();
            const response = await client.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (response.error) {
                throw response.error;
            }

            const userEmail = normalizeEmail(
                response.data &&
                response.data.user &&
                response.data.user.email
            );

            if (!isAllowedCloudEmail(userEmail)) {
                await client.auth.signOut();
                clearSession();
                throw new Error("This email is not allowed for the admin portal.");
            }

            try {
                await refreshCloudAdminProfile({
                    client: client,
                    session: response.data && response.data.session,
                    user: response.data && response.data.user,
                    throwOnFailure: true
                });
            } catch (err) {
                await client.auth.signOut();
                clearSession();
                throw err;
            }

            return response.data;
        }

        const isValid = await verifyPassword(password);
        if (!isValid) {
            throw new Error("Invalid username or password.");
        }

        createSession();
        return { session: true };
    }

    async function logout(options) {
        const opts = options || {};
        const redirect = opts.redirect || getLoginUrl();

        if (isCloudEnabled()) {
            try {
                const client = await window.lbSupabase.getClient();
                await client.auth.signOut();
            } catch (err) {
                console.warn("Supabase sign out failed.", err);
            }

            clearSession();
            if (window.lbData && window.lbData.clearCache) {
                window.lbData.clearCache();
            }
            clearLegacyState();
            navigateWithRouteHook(redirect, "login");
            return;
        }

        clearSession();
        clearLegacyState();
        navigateWithRouteHook(redirect, "login");
    }

    clearLegacyState();

    window.lbAuth = {
        clearSession: clearSession,
        createSession: createSession,
        getConfiguredAdminEmail: getConfiguredAdminEmail,
        getConfiguredAdminEmails: getConfiguredAdminEmails,
        getCurrentAdminProfile: readCloudAdminProfile,
        getLoginUrl: getLoginUrl,
        getMode: function () {
            return isCloudEnabled() ? "supabase" : "local";
        },
        hasProfile: hasProfile,
        initializePassword: initializePassword,
        isAuthenticated: isAuthenticated,
        isCloudEnabled: isCloudEnabled,
        logout: logout,
        refreshCloudAdminProfile: refreshCloudAdminProfile,
        requireAuth: requireAuth,
        signInWithPassword: signInWithPassword,
        verifyPassword: verifyPassword
    };
})();
