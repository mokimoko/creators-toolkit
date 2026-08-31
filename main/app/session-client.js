(function installToolkitSessionClient(root) {
    'use strict';

    if (!root || typeof root.fetch !== 'function' || root.__toolkitSessionFetchInstalled) return;

    const nativeFetch = root.fetch.bind(root);
    const inFlight = new Set();
    const protectedPrefixes = [
        '/api/llm/',
        '/api/cowriter/',
        '/api/debug/cowriter/',
        '/api/notebook/',
        '/api/notebooks',
        '/api/user/',
        '/api/user-sites',
        '/api/projects',
        '/api/github-sync/',
        '/api/save',
        '/api/restore-backup',
        '/api/roleplay/',
        '/api/assets/',
        '/api/time-systems/',
        '/api/auth/update-user',
        '/api/auth/delete-account'
    ];

    function observeSessionResponse(responsePromise, isProtected, controller = null) {
        return responsePromise.then(response => {
            if (isProtected && response.status === 401) {
                root.authManager?.handleSessionExpired?.();
            }
            return response;
        }).finally(() => {
            if (controller) inFlight.delete(controller);
        });
    }

    root.fetch = function toolkitSessionFetch(input, init = {}) {
        const requestUrl = input instanceof Request ? input.url : input;
        const url = new URL(requestUrl, root.location.origin);
        const isProtected = url.origin === root.location.origin
            && protectedPrefixes.some(prefix => url.pathname.startsWith(prefix));
        const token = isProtected ? root.authManager?.getToolkitSessionToken?.() : null;
        const controller = isProtected ? new AbortController() : null;
        if (controller) inFlight.add(controller);
        const signal = controller
            ? (init.signal && root.AbortSignal?.any
                ? root.AbortSignal.any([init.signal, controller.signal])
                : controller.signal)
            : init.signal;
        if (!token) return observeSessionResponse(nativeFetch(input, { ...init, signal }), isProtected, controller);

        const headers = new Headers(input instanceof Request ? input.headers : init.headers);
        headers.set('X-Toolkit-Session', token);
        const request = input instanceof Request
            ? new Request(input, { ...init, headers, signal })
            : input;
        const requestInit = input instanceof Request ? undefined : { ...init, headers, signal };
        return observeSessionResponse(nativeFetch(request, requestInit), isProtected, controller);
    };

    root.ToolkitSessionRequests = Object.freeze({
        abortAll(reason = 'Toolkit session changed') {
            inFlight.forEach(controller => controller.abort(reason));
            inFlight.clear();
        },
        get pendingCount() { return inFlight.size; }
    });
    root.document.addEventListener('auth:state', event => {
        if (['switching', 'expired', 'signed-out'].includes(event.detail?.state)) {
            root.ToolkitSessionRequests.abortAll(`Auth state: ${event.detail.state}`);
        }
    });
    root.__toolkitSessionFetchInstalled = true;
})(typeof window !== 'undefined' ? window : null);
