(function exposeCoWriterDebug(root) {
    'use strict';

    function enabled() {
        try {
            return root.localStorage?.getItem('cowriter.debug') === '1';
        } catch {
            return false;
        }
    }

    root.CoWriterDebug = Object.freeze({
        log(...args) {
            if (enabled()) console.debug('[CoWriter]', ...args);
        }
    });
}(typeof globalThis !== 'undefined' ? globalThis : this));
