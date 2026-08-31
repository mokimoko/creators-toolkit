'use strict';

(function createLoreProjectState(global) {
    let state = null;
    const status = { dirty: false, generated: false };

    function requireState() {
        if (!state) throw new Error('Lore project state has not been configured');
        return state;
    }

    function replaceObjectContents(target, source) {
        Object.keys(target).forEach(key => delete target[key]);
        Object.assign(target, source);
        return target;
    }

    function normalizeForEditor(value) {
        const contract = global.LoreProjectContract;
        if (!contract) throw new Error('Lore project contract is unavailable');
        return contract.toLegacyInfoData(contract.normalizeLoreProject(value));
    }

    function configure(initialState) {
        if (!initialState || typeof initialState !== 'object' || Array.isArray(initialState)) {
            throw new Error('Lore project state must be configured with an object');
        }
        if (state && state !== initialState) replaceObjectContents(state, initialState);
        else state = initialState;
        global.infoData = state;
        return state;
    }

    function get() {
        return requireState();
    }

    function replace(value, options = {}) {
        const next = options.editorShape === true ? value : normalizeForEditor(value);
        replaceObjectContents(requireState(), next);
        global.infoData = state;
        if (options.markDirty !== false) {
            status.dirty = true;
            status.generated = false;
        }
        return state;
    }

    function update(updater) {
        if (typeof updater !== 'function') throw new Error('Lore project update requires a function');
        const next = updater(get());
        if (next && next !== state) replace(next, { editorShape: true });
        else {
            status.dirty = true;
            status.generated = false;
        }
        return state;
    }

    function reset(options = {}) {
        const next = replace({}, { markDirty: false });
        status.dirty = options.markDirty === true;
        status.generated = false;
        return next;
    }

    function setStatus(nextStatus = {}) {
        if (typeof nextStatus.dirty === 'boolean') status.dirty = nextStatus.dirty;
        if (typeof nextStatus.generated === 'boolean') status.generated = nextStatus.generated;
        return getStatus();
    }

    function getStatus() {
        return { ...status };
    }

    function snapshot() {
        return global.LoreProjectContract.normalizeLoreProject(get());
    }

    global.LoreProjectState = Object.freeze({
        configure,
        get,
        getStatus,
        replace,
        reset,
        setStatus,
        snapshot,
        update
    });
})(window);
