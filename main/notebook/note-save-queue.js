(function initializeNotebookSaveQueue(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.NotebookSaveQueue = api.NotebookSaveQueue;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createNotebookSaveQueueApi() {
    'use strict';

    class NotebookSaveQueue {
        constructor(persist) {
            if (typeof persist !== 'function') {
                throw new TypeError('NotebookSaveQueue requires a persistence function');
            }

            this.persist = persist;
            this.states = new Map();
        }

        save(key, revision, value) {
            if (typeof key !== 'string' || !key) {
                return Promise.reject(new TypeError('A save key is required'));
            }

            return new Promise((resolve, reject) => {
                let state = this.states.get(key);
                if (!state) {
                    state = { active: null, pending: null, draining: false };
                    this.states.set(key, state);
                }

                const waiter = { resolve, reject };

                if (state.pending) {
                    if (revision >= state.pending.revision) {
                        state.pending.revision = revision;
                        state.pending.value = value;
                    }
                    state.pending.waiters.push(waiter);
                } else if (state.active && revision <= state.active.revision) {
                    state.active.waiters.push(waiter);
                } else {
                    state.pending = { revision, value, waiters: [waiter] };
                }

                if (!state.draining) {
                    state.draining = true;
                    void this.drain(key, state);
                }
            });
        }

        async drain(key, state) {
            while (state.pending) {
                const request = state.pending;
                state.pending = null;
                state.active = request;

                try {
                    const savedValue = await this.persist(request.value);
                    request.waiters.forEach(waiter => waiter.resolve({
                        revision: request.revision,
                        value: savedValue
                    }));
                } catch (error) {
                    request.waiters.forEach(waiter => waiter.reject(error));
                } finally {
                    state.active = null;
                }
            }

            state.draining = false;
            if (!state.active && !state.pending) {
                this.states.delete(key);
            }
        }
    }

    return Object.freeze({ NotebookSaveQueue });
}));

