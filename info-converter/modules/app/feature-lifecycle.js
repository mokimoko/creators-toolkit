export function createFeatureLifecycle(initializers) {
    const features = new Map();

    function setFeatureState(name, state) {
        const datasetName = `loreFeature${name.charAt(0).toUpperCase()}${name.slice(1)}`;
        document.documentElement.dataset[datasetName] = state;
    }

    function ensureFeature(name) {
        const existing = features.get(name);
        if (existing) return existing.promise;

        const initialize = initializers[name];
        if (typeof initialize !== 'function') return Promise.resolve(false);

        setFeatureState(name, 'initializing');
        const finishMetric = window.LorePerformanceMetrics?.start(`feature:${name}`);
        const footprintBefore = window.LorePerformanceMetrics?.getRuntimeFootprint?.();
        const record = {};
        features.set(name, record);

        try {
            const result = initialize();
            record.promise = Promise.resolve(result).then(() => {
                setFeatureState(name, 'ready');
                const footprintAfter = window.LorePerformanceMetrics?.getRuntimeFootprint?.();
                finishMetric?.({
                    status: 'ready',
                    scriptRequestDelta: footprintAfter && footprintBefore
                        ? footprintAfter.scriptRequests - footprintBefore.scriptRequests
                        : null,
                    heapDeltaBytes: Number.isFinite(footprintAfter?.usedHeapBytes) && Number.isFinite(footprintBefore?.usedHeapBytes)
                        ? footprintAfter.usedHeapBytes - footprintBefore.usedHeapBytes
                        : null
                });
                return true;
            }).catch(error => {
                features.delete(name);
                setFeatureState(name, 'failed');
                finishMetric?.({ status: 'failed' });
                throw error;
            });
        } catch (error) {
            features.delete(name);
            setFeatureState(name, 'failed');
            finishMetric?.({ status: 'failed' });
            record.promise = Promise.reject(error);
        }

        return record.promise;
    }

    function ensureForTab(tabName) {
        if (tabName === 'appearance') return ensureFeature('appearance');
        if (tabName === 'pages' || tabName === 'generate') return ensureFeature('customPages');
        return Promise.resolve(false);
    }

    Object.keys(initializers).forEach(name => setFeatureState(name, 'deferred'));

    const api = { ensureFeature, ensureForTab };
    window.LoreFeatureLifecycle = api;
    return api;
}
