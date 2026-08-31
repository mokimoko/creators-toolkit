'use strict';

(function createLoreLogger(global) {
    const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40, silent: 50 });
    const rawConsole = {
        debug: console.debug.bind(console),
        info: console.info.bind(console),
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console)
    };
    let level = localStorage.getItem('loreCodexLogLevel') || 'warn';
    if (!Object.prototype.hasOwnProperty.call(LEVELS, level)) level = 'warn';

    function enabled(target) {
        return LEVELS[target] >= LEVELS[level];
    }

    const logger = {
        debug: (...args) => { if (enabled('debug')) rawConsole.debug(...args); },
        info: (...args) => { if (enabled('info')) rawConsole.info(...args); },
        warn: (...args) => { if (enabled('warn')) rawConsole.warn(...args); },
        error: (...args) => { if (enabled('error')) rawConsole.error(...args); },
        getLevel: () => level,
        setLevel(nextLevel) {
            if (!Object.prototype.hasOwnProperty.call(LEVELS, nextLevel)) {
                throw new Error(`Unknown Lore Codex log level: ${nextLevel}`);
            }
            level = nextLevel;
            localStorage.setItem('loreCodexLogLevel', nextLevel);
        }
    };

    // Existing feature modules still use console.log heavily. Route those routine
    // messages through the leveled logger while preserving warnings and errors.
    console.log = (...args) => logger.debug(...args);
    console.info = (...args) => logger.info(...args);

    global.LoreLogger = Object.freeze(logger);
    global.notifyLoreUser = function notifyLoreUser(message, type = 'info') {
        if (typeof global.showToast === 'function') global.showToast(type, message);
        else if (typeof global.showStatus === 'function') global.showStatus(type, message);
        else logger[type] ? logger[type](message) : logger.info(message);
    };
})(window);
