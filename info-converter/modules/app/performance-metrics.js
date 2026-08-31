const samples = new Map();

function publishSnapshot() {
    document.documentElement.dataset.lorePerformance = JSON.stringify(getPerformanceSnapshot());
}

export function performanceNow() {
    return window.performance?.now?.() ?? Date.now();
}

export function recordPerformance(name, durationMs, details = {}) {
    const entries = samples.get(name) || [];
    entries.push({
        durationMs: Number(durationMs.toFixed(1)),
        ...details
    });
    if (entries.length > 20) entries.shift();
    samples.set(name, entries);
    publishSnapshot();
}

export function startPerformance(name) {
    const startedAt = performanceNow();
    return details => recordPerformance(name, performanceNow() - startedAt, details);
}

export function getPerformanceSnapshot() {
    return Object.fromEntries([...samples].map(([name, entries]) => [name, entries.map(entry => ({ ...entry }))]));
}

export function getRuntimeFootprint() {
    const resources = window.performance?.getEntriesByType?.('resource') || [];
    const scriptResources = resources.filter(entry => entry.initiatorType === 'script');
    const memory = window.performance?.memory;
    return {
        domNodes: document.getElementsByTagName('*').length,
        scriptRequests: scriptResources.length,
        scriptTransferBytes: scriptResources.reduce((total, entry) => total + (entry.transferSize || 0), 0),
        usedHeapBytes: Number.isFinite(memory?.usedJSHeapSize) ? memory.usedJSHeapSize : null
    };
}

window.LorePerformanceMetrics = {
    getSnapshot: getPerformanceSnapshot,
    getRuntimeFootprint,
    record: recordPerformance,
    start: startPerformance
};
