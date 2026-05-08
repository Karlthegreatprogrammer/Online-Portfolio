(function(){
    var ROUTES = {
        home: { clean: "/", file: "index.html" },
        login: { clean: "/login", file: "admin-login.html" },
        records: { clean: "/records", file: "client-records.html" },
        importTools: { clean: "/import-tools", file: "import-tools.html" },
        addRecord: { clean: "/add-record", file: "add-record.html" },
        ceuDatabase: { clean: "/ceu-database", file: "ceu-database.html" },
        reports: { clean: "/reports", file: "reports.html" },
        helpCenter: { clean: "/help", file: "help-center.html" },
        localForm: { clean: "/local-form", file: "local-form.html" }
    };
    var VISITED_ROUTE_PREFIX = "lb:route-loaded:";
    var FORCED_ROUTE_LOADER_PREFIX = "lb:force-route-loader:";
    var NO_FULL_LOADER_ROUTES = {
        addRecord: true,
        reports: true,
        helpCenter: true,
        localForm: true
    };

    function isFileMode(){
        return window.location.protocol === "file:";
    }

    function isLocalDevHost(){
        var host = String(window.location.hostname || "").toLowerCase();
        return host === "127.0.0.1" || host === "localhost" || host === "::1";
    }

    function shouldUseFileRoutes(){
        return true;
    }

    function href(name){
        var route = ROUTES[name];
        if(!route) return String(name || "");
        return route.file;
    }

    function normalizePath(value){
        var path = String(value || "").split("#")[0].split("?")[0];
        path = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
        return path || "index.html";
    }

    function routeNameFromTarget(target){
        var targetPath = "";
        try {
            targetPath = normalizePath(new URL(target, window.location.href).pathname);
        } catch(err){
            targetPath = normalizePath(target);
        }

        var names = Object.keys(ROUTES);
        for(var index = 0; index < names.length; index += 1){
            var name = names[index];
            var route = ROUTES[name];
            if(
                targetPath === normalizePath(route.clean) ||
                targetPath === normalizePath(route.file) ||
                targetPath.endsWith("/" + normalizePath(route.file))
            ){
                return name;
            }
        }

        return "";
    }

    function storageKey(name){
        return VISITED_ROUTE_PREFIX + String(name || "");
    }

    function forcedLoaderKey(name){
        return FORCED_ROUTE_LOADER_PREFIX + String(name || "");
    }

    function wasRouteLoaded(name){
        if(!name) return false;
        try {
            return sessionStorage.getItem(storageKey(name)) === "1";
        } catch(err){
            return false;
        }
    }

    function markRouteLoaded(name){
        if(!name) return;
        try {
            sessionStorage.setItem(storageKey(name), "1");
        } catch(err){
            /* ignore storage failures */
        }
    }

    function forceRouteLoader(name){
        if(!name) return;
        try {
            sessionStorage.setItem(forcedLoaderKey(name), "1");
        } catch(err){
            /* ignore storage failures */
        }
    }

    function consumeForcedRouteLoader(name){
        if(!name) return false;
        try {
            if(sessionStorage.getItem(forcedLoaderKey(name)) === "1"){
                sessionStorage.removeItem(forcedLoaderKey(name));
                return true;
            }
        } catch(err){
            return false;
        }
        return false;
    }

    function shouldShowRouteLoader(name){
        if(!name || NO_FULL_LOADER_ROUTES[name]) return false;
        if(consumeForcedRouteLoader(name)) return true;
        return !wasRouteLoaded(name);
    }

    function performNavigation(target, replace){
        if(replace){
            window.location.replace(target);
            return;
        }
        window.location.href = target;
    }

    function go(name, replace){
        var target = href(name);
        if(typeof window.lbBeforeRouteChange === "function"){
            var handled = window.lbBeforeRouteChange({
                routeName: name,
                target: target,
                replace: !!replace,
                navigate: function(){
                    performNavigation(target, replace);
                }
            });

            if(handled){
                return;
            }
        }

        performNavigation(target, replace);
    }

    function applyLinks(root){
        var scope = root || document;
        var nodes = scope.querySelectorAll("[data-route]");
        nodes.forEach(function(node){
            var name = node.getAttribute("data-route");
            if(name){
                node.setAttribute("href", href(name));
            }
        });
    }

    window.lbRoutes = {
        href: href,
        go: go,
        applyLinks: applyLinks,
        markRouteLoaded: markRouteLoaded,
        forceRouteLoader: forceRouteLoader,
        routeNameFromTarget: routeNameFromTarget,
        shouldShowRouteLoader: shouldShowRouteLoader,
        isFileMode: isFileMode,
        isLocalDevHost: isLocalDevHost,
        shouldUseFileRoutes: shouldUseFileRoutes,
        wasRouteLoaded: wasRouteLoaded,
        map: ROUTES
    };

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", function(){
            applyLinks(document);
        });
    } else {
        applyLinks(document);
    }
})();
