(function (root) {
    'use strict';

    document.documentElement.dataset.rpReadThroughScript = 'loaded';

    const SESSION_ID_KEY = 'rp-read-through-draft-document-id';

    function makeDocumentId() {
        const uuid = window.crypto?.randomUUID
            ? window.crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
        return `rp_${uuid.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    }

    function safeJson(value, fallback) {
        try {
            return JSON.parse(value);
        } catch (error) {
            return fallback;
        }
    }

    function shortDate(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    class ArchiverReadThroughManager {
        constructor() {
            this.comments = [];
            this.assets = { css: '', js: '' };
            this.assetPromise = null;
            this.lastSyncAt = null;
            this.initialized = false;
        }

        initialize() {
            if (this.initialized) return;
            this.initialized = true;
            document.documentElement.dataset.rpReadThroughManager = 'initializing';
            this.ui = {
                enabled: document.getElementById('read-through-enabled'),
                settings: document.getElementById('read-through-settings'),
                linkedUrl: document.getElementById('read-through-linked-url'),
                endpoint: document.getElementById('read-through-endpoint'),
                documentId: document.getElementById('read-through-document-id'),
                cache: document.getElementById('read-through-cache-data'),
                sync: document.getElementById('read-through-sync'),
                open: document.getElementById('read-through-open'),
                status: document.getElementById('read-through-status'),
                summary: document.getElementById('read-through-summary'),
                total: document.getElementById('read-through-total'),
                openCount: document.getElementById('read-through-open-count'),
                corrections: document.getElementById('read-through-corrections'),
                replies: document.getElementById('read-through-replies'),
                list: document.getElementById('read-through-comment-list')
            };

            if (!this.ui.enabled) return;
            this.ui.documentId.value = sessionStorage.getItem(SESSION_ID_KEY) || makeDocumentId();
            sessionStorage.setItem(SESSION_ID_KEY, this.ui.documentId.value);

            this.ui.enabled.addEventListener('change', () => {
                this.updateEnabledState();
                if (this.ui.enabled.checked) this.preloadAssets();
            });
            this.ui.linkedUrl.addEventListener('input', () => this.updateOpenButton());
            this.ui.sync.addEventListener('click', () => this.syncComments());
            this.ui.open.addEventListener('click', () => {
                const url = this.ui.linkedUrl.value.trim();
                if (url) window.open(url, '_blank', 'noopener,noreferrer');
            });
            document.addEventListener('rp-read-through-import', event => {
                if (event.detail?.project) this.importFromProject(event.detail.project.readThrough);
                else if (event.detail?.doc) this.importFromDocument(event.detail.doc);
            });

            this.updateEnabledState();
            this.updateOpenButton();
            this.renderComments();
            this.preloadAssets();
            document.documentElement.dataset.rpReadThroughManager = 'ready';
        }

        updateEnabledState() {
            this.ui.settings.dataset.enabled = String(this.ui.enabled.checked);
            this.setStatus(
                this.ui.enabled.checked ? (this.ui.linkedUrl.value.trim() ? 'Ready to sync' : 'Not linked yet') : 'Disabled',
                'idle'
            );
        }

        updateOpenButton() {
            let valid = false;
            try {
                const url = new URL(this.ui.linkedUrl.value.trim());
                valid = /^https?:$/.test(url.protocol);
            } catch (error) {
                valid = false;
            }
            this.ui.open.disabled = !valid;
        }

        setStatus(message, state = 'idle') {
            this.ui.status.textContent = message;
            this.ui.status.dataset.state = state;
        }

        async preloadAssets() {
            if (this.assetPromise) return this.assetPromise;
            this.assetPromise = Promise.all([
                fetch('read-through/shared-comments.css').then(response => {
                    if (!response.ok) throw new Error('Unable to load shared comment styles');
                    return response.text();
                }),
                fetch('read-through/shared-comments-core.js').then(response => {
                    if (!response.ok) throw new Error('Unable to load shared comment core');
                    return response.text();
                }),
                fetch('read-through/shared-comments.js').then(response => {
                    if (!response.ok) throw new Error('Unable to load shared comment script');
                    return response.text();
                })
            ]).then(([css, core, runtime]) => {
                this.assets = { css, js: `${core}\n${runtime}` };
                return this.assets;
            }).catch(error => {
                this.assetPromise = null;
                throw error;
            });
            return this.assetPromise;
        }

        getExportConfig() {
            let documentId = this.ui.documentId.value.trim();
            if (!documentId) {
                documentId = makeDocumentId();
                this.ui.documentId.value = documentId;
                sessionStorage.setItem(SESSION_ID_KEY, documentId);
            }
            return {
                enabled: this.ui.enabled.checked,
                documentId,
                linkedUrl: this.ui.linkedUrl.value.trim(),
                endpoint: this.ui.endpoint.value.trim() || '/api/read-through/comments',
                comments: this.comments
            };
        }

        async getExportAssets() {
            if (!this.ui.enabled.checked) return { css: '', js: '' };
            return this.preloadAssets();
        }

        importFromDocument(doc) {
            const enabled = doc.querySelector('meta[name="rp-read-through-enabled"]')?.content === 'true';
            const documentId = doc.querySelector('meta[name="rp-read-through-document-id"]')?.content;
            const linkedUrl = doc.querySelector('meta[name="rp-read-through-linked-url"]')?.content || '';
            const endpoint = doc.querySelector('meta[name="rp-read-through-endpoint"]')?.content || '/api/read-through/comments';
            const cache = safeJson(doc.getElementById('rp-read-through-cache')?.textContent || '', []);

            this.ui.enabled.checked = enabled;
            this.ui.documentId.value = documentId || makeDocumentId();
            this.ui.linkedUrl.value = linkedUrl;
            this.ui.endpoint.value = endpoint;
            this.comments = Array.isArray(cache) ? cache : [];
            this.syncCacheField();
            sessionStorage.setItem(SESSION_ID_KEY, this.ui.documentId.value);
            this.updateEnabledState();
            this.updateOpenButton();
            this.renderComments();

            if (enabled && linkedUrl) {
                window.setTimeout(() => this.syncComments({ quiet: true }), 150);
            }
        }

        importFromProject(config = {}) {
            this.ui.enabled.checked = Boolean(config.enabled);
            this.ui.documentId.value = config.documentId || makeDocumentId();
            this.ui.linkedUrl.value = config.hostedUrl || '';
            this.ui.endpoint.value = config.endpoint || '/api/read-through/comments';
            this.comments = Array.isArray(config.cachedThreads) ? config.cachedThreads : [];
            this.syncCacheField();
            sessionStorage.setItem(SESSION_ID_KEY, this.ui.documentId.value);
            this.updateEnabledState();
            this.updateOpenButton();
            this.renderComments();

            if (config.enabled && config.hostedUrl) {
                window.setTimeout(() => this.syncComments({ quiet: true }), 150);
            }
        }

        getRemoteEndpoint() {
            const linkedUrl = this.ui.linkedUrl.value.trim();
            if (!linkedUrl) throw new Error('Add the hosted story URL first');
            const endpoint = this.ui.endpoint.value.trim() || '/api/read-through/comments';
            return new URL(endpoint, linkedUrl);
        }

        async syncComments({ quiet = false } = {}) {
            if (!this.ui.enabled.checked) {
                this.setStatus('Enable Read-Through Mode first', 'error');
                return;
            }

            this.setStatus('Checking hosted comments…', 'checking');
            this.ui.sync.disabled = true;
            try {
                const url = this.getRemoteEndpoint();
                url.searchParams.set('documentId', this.ui.documentId.value.trim());
                const response = await fetch(url, { credentials: 'include' });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || `Comment service returned ${response.status}`);
                this.comments = Array.isArray(data.comments) ? data.comments : [];
                this.syncCacheField();
                this.lastSyncAt = new Date();
                this.renderComments();
                const correctionCount = this.comments.filter(item => (
                    item.kind === 'correction' && item.correctionStatus !== 'applied' && item.correctionStatus !== 'dismissed'
                )).length;
                this.setStatus(`${this.comments.filter(item => !item.parentId).length} threads synced${correctionCount ? ` · ${correctionCount} corrections` : ''}`, 'online');
                if (!quiet) window.RPArchiver.get('previewExport').showStatus(
                    '✅ Shared read-through comments are up to date',
                    'success'
                );
            } catch (error) {
                window.RPLogger?.error('Read-through sync failed:', error);
                const linkedUrl = this.ui.linkedUrl.value.trim();
                const isCrossOrigin = (() => {
                    try { return new URL(linkedUrl).origin !== window.location.origin; }
                    catch (ignored) { return false; }
                })();
                const message = error instanceof TypeError && isCrossOrigin
                    ? 'Hosted comment service unavailable — deploy the Read-Through Netlify function, then try again'
                    : error.message;
                this.setStatus(message, 'error');
                if (!quiet) window.RPArchiver.get('previewExport').showStatus(
                    `❌ Comment sync failed: ${message}`,
                    'error'
                );
            } finally {
                this.ui.sync.disabled = false;
            }
        }

        renderComments() {
            this.syncCacheField();
            const threads = this.comments
                .filter(comment => !comment.parentId)
                .sort((a, b) => {
                    const aPending = a.kind === 'correction' && !['applied', 'dismissed'].includes(a.correctionStatus);
                    const bPending = b.kind === 'correction' && !['applied', 'dismissed'].includes(b.correctionStatus);
                    return Number(bPending) - Number(aPending) || new Date(b.createdAt) - new Date(a.createdAt);
                });
            const replies = this.comments.filter(comment => comment.parentId);
            const notes = threads.filter(comment => comment.kind !== 'correction');
            const pendingCorrections = threads.filter(comment => (
                comment.kind === 'correction' && !['applied', 'dismissed'].includes(comment.correctionStatus)
            ));
            this.ui.total.textContent = String(notes.length);
            this.ui.openCount.textContent = String(notes.filter(comment => !comment.resolved).length);
            this.ui.corrections.textContent = String(pendingCorrections.length);
            this.ui.replies.textContent = String(replies.length);
            this.ui.summary.hidden = this.comments.length === 0;
            this.ui.list.innerHTML = '';

            threads.slice(0, 8).forEach(comment => {
                const card = document.createElement('article');
                card.className = 'read-through-preview-card';
                card.style.setProperty('--reader-color', /^#[0-9a-f]{6}$/i.test(comment.author?.color || '')
                    ? comment.author.color
                    : 'var(--accent-primary)');
                const meta = document.createElement('div');
                meta.className = 'read-through-preview-meta';
                const author = document.createElement('b');
                author.textContent = comment.author?.name || 'Reader';
                const state = document.createElement('span');
                state.textContent = comment.kind === 'correction'
                    ? (comment.correctionStatus || 'pending')
                    : (comment.resolved ? 'resolved' : 'open');
                const time = document.createElement('time');
                time.textContent = shortDate(comment.createdAt);
                meta.append(author, state, time);
                const quote = document.createElement('div');
                quote.className = 'read-through-preview-quote';
                quote.textContent = comment.quote || comment.targets?.map(target => target.exact).join(' … ') || 'Highlighted passage';
                const body = document.createElement('p');
                body.className = 'read-through-preview-body';
                body.textContent = comment.body;
                card.append(meta, quote);

                if (comment.kind === 'correction') {
                    card.classList.add('read-through-preview-correction');
                    const replacement = document.createElement('div');
                    replacement.className = 'read-through-preview-replacement';
                    replacement.textContent = comment.replacement || '';
                    card.append(replacement);
                }
                if (comment.body) card.append(body);

                if (comment.kind === 'correction' && !['applied', 'dismissed'].includes(comment.correctionStatus)) {
                    const actions = document.createElement('div');
                    actions.className = 'read-through-preview-actions';
                    const apply = document.createElement('button');
                    apply.type = 'button';
                    apply.className = 'btn-secondary read-through-apply';
                    apply.textContent = 'Apply correction';
                    apply.addEventListener('click', () => this.applyCorrection(comment, apply));
                    const dismiss = document.createElement('button');
                    dismiss.type = 'button';
                    dismiss.className = 'read-through-dismiss';
                    dismiss.textContent = 'Dismiss';
                    dismiss.addEventListener('click', () => this.dismissCorrection(comment, dismiss));
                    actions.append(apply, dismiss);
                    card.append(actions);
                }
                this.ui.list.append(card);
            });

            if (threads.length > 8) {
                const note = document.createElement('div');
                note.className = 'read-through-footnote';
                note.textContent = `${threads.length - 8} more threads are available on the hosted page.`;
                this.ui.list.append(note);
            }
        }

        findCorrectionRange(comment, sourceText) {
            const target = comment.targets?.[0];
            if (!target?.exact || !comment.replacement) return null;

            const generatedHtml = document.getElementById('html-output')?.value || '';
            if (generatedHtml && target.anchor) {
                const doc = new DOMParser().parseFromString(generatedHtml, 'text/html');
                const block = [...doc.querySelectorAll('[data-rp-anchor]')]
                    .find(item => item.dataset.rpAnchor === target.anchor);
                const originalBlock = block?.getAttribute('data-original') || '';
                const withinBlock = originalBlock.indexOf(target.exact);
                const sourceStart = sourceText.indexOf(originalBlock);
                if (withinBlock >= 0 && sourceStart >= 0 && sourceText.indexOf(originalBlock, sourceStart + 1) === -1) {
                    return {
                        start: sourceStart + withinBlock,
                        end: sourceStart + withinBlock + target.exact.length
                    };
                }
            }

            const first = sourceText.indexOf(target.exact);
            if (first >= 0 && sourceText.indexOf(target.exact, first + 1) === -1) {
                return { start: first, end: first + target.exact.length };
            }
            return null;
        }

        async updateCorrectionStatus(comment, status) {
            const url = this.getRemoteEndpoint();
            const response = await fetch(url, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    documentId: this.ui.documentId.value.trim(),
                    commentId: comment.id,
                    correctionStatus: status,
                    resolved: true
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `Comment service returned ${response.status}`);
            return data.comment;
        }

        async applyCorrection(comment, button) {
            const source = document.getElementById('rp-text');
            const range = source ? this.findCorrectionRange(comment, source.value) : null;
            if (!range) {
                const message = 'Could not find one safe match in Roleplay Text. This correction needs a manual look.';
                this.setStatus(message, 'error');
                window.RPArchiver.get('previewExport').showStatus(`❌ ${message}`, 'error');
                return;
            }

            button.disabled = true;
            source.value = source.value.slice(0, range.start) + comment.replacement + source.value.slice(range.end);
            source.dispatchEvent(new Event('input', { bubbles: true }));
            source.dispatchEvent(new Event('change', { bubbles: true }));
            const expanded = document.getElementById('expanded-rp-text');
            if (document.getElementById('textEditorModal')?.classList.contains('show') && expanded) {
                expanded.value = source.value;
                expanded.dispatchEvent(new Event('input', { bubbles: true }));
            }

            comment.correctionStatus = 'applied';
            comment.resolved = true;
            this.syncCacheField();
            this.renderComments();

            try {
                const remote = await this.updateCorrectionStatus(comment, 'applied');
                const index = this.comments.findIndex(item => item.id === comment.id);
                if (index >= 0) this.comments[index] = remote;
            } catch (error) {
                window.RPLogger?.warn('Correction was applied locally but its hosted status could not be updated:', error);
            }

            await window.RPArchiver.get('previewExport').convertToHTML();
            this.syncCacheField();
            this.renderComments();
            this.setStatus('Correction applied to Roleplay Text', 'online');
            window.RPArchiver.get('previewExport').showStatus(
                '✅ Correction applied — save the RP when you are ready',
                'success',
                7000
            );
        }

        async dismissCorrection(comment, button) {
            button.disabled = true;
            try {
                const remote = await this.updateCorrectionStatus(comment, 'dismissed');
                const index = this.comments.findIndex(item => item.id === comment.id);
                if (index >= 0) this.comments[index] = remote;
                this.syncCacheField();
                this.renderComments();
                this.setStatus('Correction dismissed', 'online');
            } catch (error) {
                button.disabled = false;
                this.setStatus(error.message, 'error');
            }
        }

        syncCacheField() {
            if (this.ui?.cache) this.ui.cache.value = JSON.stringify(this.comments || []);
        }
    }

    const manager = new ArchiverReadThroughManager();
    root.RPArchiver.define('readThroughEditor', {
        getManager: () => manager,
        initialize() {
            manager.initialize();
            return manager;
        }
    });
})(window);
