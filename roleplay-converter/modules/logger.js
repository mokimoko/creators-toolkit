// Small, opt-in logger for RP Archiver application diagnostics.
(function initializeRPLogger() {
    const LEVELS = Object.freeze({ silent: 0, error: 1, warn: 2, info: 3, debug: 4 });
    const STORAGE_KEY = 'rpArchiver_logLevel';
    let currentLevel = normalizeLevel(localStorage.getItem(STORAGE_KEY) || 'warn');

    function normalizeLevel(level) {
        return Object.prototype.hasOwnProperty.call(LEVELS, level) ? level : 'warn';
    }

    function shouldLog(level) {
        return LEVELS[currentLevel] >= LEVELS[level];
    }

    function write(level, args) {
        if (!shouldLog(level)) return;
        const method = level === 'debug' ? 'log' : level;
        console[method]('[RP Archiver]', ...args);
    }

    window.RPLogger = Object.freeze({
        debug: (...args) => write('debug', args),
        info: (...args) => write('info', args),
        warn: (...args) => write('warn', args),
        error: (...args) => write('error', args),
        getLevel: () => currentLevel,
        setLevel(level) {
            currentLevel = normalizeLevel(level);
            localStorage.setItem(STORAGE_KEY, currentLevel);
            return currentLevel;
        }
    });
})();
