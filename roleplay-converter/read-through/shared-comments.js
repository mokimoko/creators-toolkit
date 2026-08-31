(function () {
    'use strict';

    const {
        BLOCK_SELECTOR,
        CACHE_PREFIX,
        PROFILE_KEY,
        QUEUE_PREFIX,
        SEEN_PREFIX,
        createId,
        formatWhen,
        normalizeColor,
        parseJson,
        readMeta,
        stableAnchorId
    } = window.RPReadThroughCore;

    function readStorage(key) {
        try {
            return window.localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    function writeStorage(key, value) {
        try {
            window.localStorage.setItem(key, value);
            return true;
        } catch {
            return false;
        }
    }

    function removeStorage(key) {
        try {
            window.localStorage.removeItem(key);
        } catch {
            // Sandboxed previews intentionally have no same-origin storage access.
        }
    }

    class ReadThroughComments {
        constructor() {
            this.enabled = readMeta('rp-read-through-enabled') === 'true';
            this.documentId = readMeta('rp-read-through-document-id');
            this.endpoint = readMeta('rp-read-through-endpoint', '/api/read-through/comments');
            this.title = document.title.split(' - ')[0] || 'This roleplay';
            this.comments = [];
            this.profile = this.loadProfile();
            this.pendingSelection = null;
            this.activeCommentId = null;
            this.activeFilter = 'open';
            this.profileCallback = null;
            this.networkState = 'checking';
            this.toastTimer = null;
            this.lastSeen = readStorage(`${SEEN_PREFIX}${this.documentId}`) || '';

            if (!this.enabled || !this.documentId) return;

            this.comments = this.loadCachedComments();
            this.ensureAnchors();
            this.buildInterface();
            this.bindEvents();
            this.positionLauncher();
            this.render();
            this.refresh({ silent: true });
        }

        loadProfile() {
            const profile = parseJson(readStorage(PROFILE_KEY), null);
            if (!profile || !profile.name) return null;
            const normalized = {
                id: profile.id || createId('reader'),
                name: String(profile.name).slice(0, 80),
                color: normalizeColor(profile.color)
            };
            if (!profile.id) writeStorage(PROFILE_KEY, JSON.stringify(normalized));
            return normalized;
        }

        saveProfile(profile) {
            this.profile = {
                id: profile.id || this.profile?.id || createId('reader'),
                name: String(profile.name || '').trim().slice(0, 80),
                color: normalizeColor(profile.color)
            };
            writeStorage(PROFILE_KEY, JSON.stringify(this.profile));
            this.updateProfileButton();
            this.renderComments();
        }

        loadCachedComments() {
            const embedded = parseJson(document.getElementById('rp-read-through-cache')?.textContent || '', []);
            const local = parseJson(readStorage(`${CACHE_PREFIX}${this.documentId}`), null);
            return Array.isArray(local) ? local : (Array.isArray(embedded) ? embedded : []);
        }

        persistCache() {
            try {
                writeStorage(`${CACHE_PREFIX}${this.documentId}`, JSON.stringify(this.comments));
            } catch (error) {
                console.warn('Unable to cache read-through comments:', error);
            }
        }

        getQueue() {
            const queue = parseJson(readStorage(`${QUEUE_PREFIX}${this.documentId}`), []);
            return Array.isArray(queue) ? queue : [];
        }

        saveQueue(queue) {
            if (queue.length) {
                writeStorage(`${QUEUE_PREFIX}${this.documentId}`, JSON.stringify(queue));
            } else {
                removeStorage(`${QUEUE_PREFIX}${this.documentId}`);
            }
        }

        ensureAnchors() {
            const blocks = [...document.querySelectorAll(BLOCK_SELECTOR)];
            blocks.forEach((block, index) => {
                if (!block.dataset.rpAnchor) {
                    block.dataset.rpAnchor = stableAnchorId(index);
                }
            });
            this.blocks = blocks;
        }

        buildInterface() {
            const launcher = document.createElement('button');
            launcher.type = 'button';
            launcher.className = 'rtc-launcher';
            launcher.setAttribute('aria-label', 'Open shared read-through comments');
            launcher.title = 'Read-through';
            launcher.innerHTML = '<span class="rtc-launcher-mark">¶</span><span class="rtc-count">0</span>';

            const selectionButton = document.createElement('button');
            selectionButton.type = 'button';
            selectionButton.className = 'rtc-selection-button';
            selectionButton.textContent = 'Comment or correct';
            selectionButton.dataset.visible = 'false';

            const scrim = document.createElement('div');
            scrim.className = 'rtc-scrim';
            scrim.dataset.open = 'false';

            const panel = document.createElement('aside');
            panel.className = 'rtc-panel';
            panel.dataset.open = 'false';
            panel.setAttribute('aria-label', 'Shared read-through comments');
            panel.innerHTML = `
                <header class="rtc-panel-header">
                    <div class="rtc-heading">
                        <p class="rtc-kicker">Shared margin notes</p>
                        <h2 class="rtc-title"></h2>
                    </div>
                    <button type="button" class="rtc-icon-button rtc-close" aria-label="Close comments">×</button>
                </header>
                <div class="rtc-toolbar" aria-label="Comment filters">
                    <button type="button" class="rtc-filter rtc-nav" data-direction="previous" title="Previous comment">←</button>
                    <button type="button" class="rtc-filter rtc-nav" data-direction="next" title="Next comment">→</button>
                    <button type="button" class="rtc-filter" data-filter="open" aria-pressed="true">Open</button>
                    <button type="button" class="rtc-filter" data-filter="all" aria-pressed="false">All</button>
                    <button type="button" class="rtc-filter" data-filter="unread" aria-pressed="false">Unread</button>
                    <button type="button" class="rtc-filter" data-filter="mine" aria-pressed="false">Mine</button>
                    <button type="button" class="rtc-filter" data-filter="resolved" aria-pressed="false">Resolved</button>
                </div>
                <div class="rtc-comments" aria-live="polite"></div>
                <footer class="rtc-footer">
                    <button type="button" class="rtc-profile-button">
                        <span class="rtc-profile-swatch"></span>
                        <span class="rtc-profile-name">Choose your name & color</span>
                        <span class="rtc-network-state" data-state="checking">Checking sync</span>
                    </button>
                </footer>`;

            const dialog = document.createElement('div');
            dialog.className = 'rtc-dialog';
            dialog.dataset.open = 'false';
            dialog.setAttribute('role', 'dialog');
            dialog.setAttribute('aria-modal', 'true');
            dialog.innerHTML = '<div class="rtc-dialog-card"></div>';

            const toast = document.createElement('div');
            toast.className = 'rtc-toast';
            toast.setAttribute('role', 'status');

            document.body.append(launcher, selectionButton, scrim, panel, dialog, toast);

            this.ui = {
                launcher,
                count: launcher.querySelector('.rtc-count'),
                selectionButton,
                scrim,
                panel,
                close: panel.querySelector('.rtc-close'),
                title: panel.querySelector('.rtc-title'),
                comments: panel.querySelector('.rtc-comments'),
                profileButton: panel.querySelector('.rtc-profile-button'),
                profileName: panel.querySelector('.rtc-profile-name'),
                profileSwatch: panel.querySelector('.rtc-profile-swatch'),
                network: panel.querySelector('.rtc-network-state'),
                filters: [...panel.querySelectorAll('[data-filter]')],
                nav: [...panel.querySelectorAll('.rtc-nav')],
                dialog,
                dialogCard: dialog.querySelector('.rtc-dialog-card'),
                toast
            };

            this.ui.title.textContent = this.title || 'Read-through';
            this.updateProfileButton();
            this.updateNetworkState('checking');
        }

        bindEvents() {
            this.ui.launcher.addEventListener('click', () => this.openPanel());
            this.ui.close.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                this.closePanel();
            });
            this.ui.panel.addEventListener('click', event => {
                if (!event.target.closest('.rtc-close')) return;
                event.preventDefault();
                event.stopPropagation();
                this.closePanel();
            });
            this.ui.scrim.addEventListener('click', () => this.closePanel());
            this.ui.profileButton.addEventListener('click', () => this.openProfileDialog());
            this.ui.dialog.addEventListener('mousedown', event => {
                if (event.target === this.ui.dialog) this.closeDialog();
            });

            this.ui.filters.forEach(button => {
                button.addEventListener('click', () => {
                    this.activeFilter = button.dataset.filter;
                    this.ui.filters.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
                    this.renderComments();
                });
            });

            this.ui.nav.forEach(button => {
                button.addEventListener('click', () => this.navigateComments(button.dataset.direction));
            });

            this.ui.selectionButton.addEventListener('mousedown', event => event.preventDefault());
            this.ui.selectionButton.addEventListener('click', () => {
                const selection = this.pendingSelection;
                this.hideSelectionButton();
                window.getSelection()?.removeAllRanges();
                if (!selection) return;
                this.requireProfile(() => this.openSelectionMenu(selection));
            });

            document.addEventListener('mouseup', event => this.captureSelection(event));
            document.addEventListener('touchend', event => this.captureSelection(event));
            document.addEventListener('mousedown', event => {
                if (!event.target.closest('.rtc-selection-button')) this.hideSelectionButton();
            });
            document.addEventListener('click', event => {
                const highlight = event.target.closest('.rp-annotation-highlight');
                if (!highlight) return;
                const ids = (highlight.dataset.commentIds || '').split(',').filter(Boolean);
                const preferred = ids.find(id => !this.comments.find(comment => comment.id === id)?.resolved) || ids[0];
                if (preferred) this.activateComment(preferred, { scrollStory: false });
            });

            document.addEventListener('keydown', event => {
                if (event.key !== 'Escape') return;
                if (this.ui.dialog.dataset.open === 'true') this.closeDialog();
                else if (this.ui.panel.dataset.open === 'true') this.closePanel();
                else this.hideSelectionButton();
            });

            window.addEventListener('online', () => this.refresh({ silent: true }));
            window.addEventListener('resize', () => this.positionLauncher());
        }

        positionLauncher() {
            const scrollTopButton = document.querySelector('.scroll-top-btn');
            if (!scrollTopButton || !this.ui?.launcher) return;
            const rect = scrollTopButton.getBoundingClientRect();
            const bottom = Math.max(82, window.innerHeight - rect.top + 14);
            this.ui.launcher.style.setProperty('--rtc-launcher-bottom', `${Math.round(bottom)}px`);
        }

        captureSelection(event) {
            if (event.target.closest('.rtc-panel, .rtc-dialog, .rtc-launcher, .rtc-selection-button')) return;
            window.setTimeout(() => {
                const selection = window.getSelection();
                if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
                const result = this.targetsFromRange(selection.getRangeAt(0));
                if (!result || !result.targets.length) return;
                this.pendingSelection = result;

                const rects = selection.getRangeAt(0).getClientRects();
                const rect = rects.length ? rects[rects.length - 1] : selection.getRangeAt(0).getBoundingClientRect();
                const width = 175;
                const left = Math.min(window.innerWidth - width - 10, Math.max(10, rect.left + rect.width / 2 - width / 2));
                const top = Math.max(10, rect.top - 46);
                this.ui.selectionButton.style.left = `${left}px`;
                this.ui.selectionButton.style.top = `${top}px`;
                this.ui.selectionButton.dataset.visible = 'true';
            }, 0);
        }

        targetsFromRange(range) {
            const targets = [];
            for (const block of this.blocks) {
                try {
                    if (!range.intersectsNode(block)) continue;
                } catch (error) {
                    continue;
                }

                const segment = document.createRange();
                segment.selectNodeContents(block);
                if (block.contains(range.startContainer)) segment.setStart(range.startContainer, range.startOffset);
                if (block.contains(range.endContainer)) segment.setEnd(range.endContainer, range.endOffset);

                const raw = segment.toString();
                const leading = raw.match(/^\s*/)?.[0].length || 0;
                const trailing = raw.match(/\s*$/)?.[0].length || 0;
                const exact = raw.slice(leading, raw.length - trailing);
                if (!exact) continue;

                const before = document.createRange();
                before.selectNodeContents(block);
                before.setEnd(segment.startContainer, segment.startOffset);
                const start = before.toString().length + leading;
                const end = start + exact.length;
                const text = block.textContent || '';
                targets.push({
                    anchor: block.dataset.rpAnchor,
                    start,
                    end,
                    exact,
                    prefix: text.slice(Math.max(0, start - 80), start),
                    suffix: text.slice(end, end + 80)
                });
            }

            if (!targets.length) return null;
            return {
                targets,
                quote: targets.map(target => target.exact.trim()).join(' … ').slice(0, 12000)
            };
        }

        hideSelectionButton() {
            if (!this.ui) return;
            this.ui.selectionButton.dataset.visible = 'false';
        }

        openPanel() {
            this.ui.panel.dataset.open = 'true';
            this.ui.scrim.dataset.open = 'true';
            this.ui.launcher.style.visibility = 'hidden';
            this.renderComments();
        }

        closePanel() {
            this.ui.panel.dataset.open = 'false';
            this.ui.scrim.dataset.open = 'false';
            this.ui.launcher.style.visibility = '';
            this.lastSeen = new Date().toISOString();
            writeStorage(`${SEEN_PREFIX}${this.documentId}`, this.lastSeen);
        }

        openDialog(contentBuilder) {
            this.ui.dialogCard.innerHTML = '';
            contentBuilder(this.ui.dialogCard);
            this.ui.dialog.dataset.open = 'true';
            window.setTimeout(() => this.ui.dialogCard.querySelector('input, textarea, button')?.focus(), 0);
        }

        closeDialog() {
            this.ui.dialog.dataset.open = 'false';
            this.ui.dialogCard.innerHTML = '';
            this.profileCallback = null;
        }

        requireProfile(callback) {
            if (this.profile?.name) callback();
            else this.openProfileDialog(callback);
        }

        openProfileDialog(callback = null) {
            this.profileCallback = callback;
            this.openDialog(card => {
                const title = document.createElement('h2');
                title.className = 'rtc-dialog-title';
                title.textContent = this.profile ? 'Your margin-note profile' : 'Choose your margin-note style';
                const note = document.createElement('p');
                note.className = 'rtc-dialog-note';
                note.textContent = 'This name and color are remembered in this browser and attached to your comments.';
                const nameLabel = document.createElement('label');
                nameLabel.htmlFor = 'rtc-profile-name-input';
                nameLabel.textContent = 'Display name';
                const nameInput = document.createElement('input');
                nameInput.id = 'rtc-profile-name-input';
                nameInput.type = 'text';
                nameInput.maxLength = 80;
                nameInput.placeholder = 'Moki';
                nameInput.value = this.profile?.name || '';
                const colorLabel = document.createElement('label');
                colorLabel.htmlFor = 'rtc-profile-color-input';
                colorLabel.textContent = 'Highlight color';
                const colorRow = document.createElement('div');
                colorRow.className = 'rtc-color-row';
                const colorInput = document.createElement('input');
                colorInput.id = 'rtc-profile-color-input';
                colorInput.type = 'color';
                colorInput.value = this.profile?.color || '#b66a3c';
                const colorText = document.createElement('input');
                colorText.type = 'text';
                colorText.value = colorInput.value;
                colorInput.addEventListener('input', () => { colorText.value = colorInput.value; });
                colorText.addEventListener('input', () => {
                    if (/^#[0-9a-f]{6}$/i.test(colorText.value)) colorInput.value = colorText.value;
                });
                colorRow.append(colorInput, colorText);
                const actions = this.makeDialogActions('Save profile', () => {
                    const name = nameInput.value.trim();
                    if (!name) {
                        nameInput.focus();
                        this.showToast('Choose a name first.');
                        return;
                    }
                    const next = this.profileCallback;
                    this.saveProfile({ id: this.profile?.id, name, color: colorInput.value });
                    this.closeDialog();
                    if (next) next();
                });
                card.append(title, note, nameLabel, nameInput, colorLabel, colorRow, actions);
            });
        }

        openComposer(selection) {
            this.openDialog(card => {
                const title = document.createElement('h2');
                title.className = 'rtc-dialog-title';
                title.textContent = 'Leave a margin note';
                const note = document.createElement('p');
                note.className = 'rtc-dialog-note';
                note.textContent = `Commenting as ${this.profile.name}`;
                const quote = document.createElement('div');
                quote.className = 'rtc-composer-quote';
                quote.textContent = selection.quote;
                const label = document.createElement('label');
                label.htmlFor = 'rtc-comment-input';
                label.textContent = 'Your comment';
                const textarea = document.createElement('textarea');
                textarea.id = 'rtc-comment-input';
                textarea.maxLength = 12000;
                textarea.placeholder = 'What stood out here?';
                const actions = this.makeDialogActions('Add comment', async button => {
                    const body = textarea.value.trim();
                    if (!body) {
                        textarea.focus();
                        this.showToast('Write a comment first.');
                        return;
                    }
                    button.disabled = true;
                    await this.createComment({
                        body,
                        quote: selection.quote,
                        targets: selection.targets,
                        parentId: null
                    });
                    this.closeDialog();
                    this.openPanel();
                });
                card.append(title, note, quote, label, textarea, actions);
            });
        }

        openSelectionMenu(selection) {
            this.openDialog(card => {
                const title = document.createElement('h2');
                title.className = 'rtc-dialog-title';
                title.textContent = 'Add to the read-through';
                const note = document.createElement('p');
                note.className = 'rtc-dialog-note';
                note.textContent = `Posting as ${this.profile.name}`;
                const quote = document.createElement('div');
                quote.className = 'rtc-composer-quote';
                quote.textContent = selection.quote;
                const choices = document.createElement('div');
                choices.className = 'rtc-choice-grid';

                const comment = document.createElement('button');
                comment.type = 'button';
                comment.className = 'rtc-choice-button';
                comment.innerHTML = '<b>Margin note</b><span>Start a comment thread about this passage.</span>';
                comment.addEventListener('click', () => this.openComposer(selection));

                const correction = document.createElement('button');
                correction.type = 'button';
                correction.className = 'rtc-choice-button';
                correction.innerHTML = '<b>Suggest correction</b><span>Show the author exactly what should replace it.</span>';
                correction.disabled = selection.targets.length !== 1;
                if (correction.disabled) correction.title = 'Corrections must stay within one paragraph';
                correction.addEventListener('click', () => this.openCorrectionComposer(selection));
                choices.append(comment, correction);

                if (correction.disabled) {
                    const hint = document.createElement('p');
                    hint.className = 'rtc-dialog-note rtc-choice-hint';
                    hint.textContent = 'For a correction, select text inside a single paragraph.';
                    card.append(title, note, quote, choices, hint);
                } else {
                    card.append(title, note, quote, choices);
                }
            });
        }

        openCorrectionComposer(selection) {
            this.openDialog(card => {
                const title = document.createElement('h2');
                title.className = 'rtc-dialog-title';
                title.textContent = 'Suggest a correction';
                const note = document.createElement('p');
                note.className = 'rtc-dialog-note';
                note.textContent = `The author can apply this directly to the Roleplay Text.`;
                const quote = document.createElement('div');
                quote.className = 'rtc-composer-quote';
                quote.textContent = selection.quote;
                const replacementLabel = document.createElement('label');
                replacementLabel.htmlFor = 'rtc-correction-input';
                replacementLabel.textContent = 'Replace it with';
                const replacement = document.createElement('textarea');
                replacement.id = 'rtc-correction-input';
                replacement.maxLength = 12000;
                replacement.value = selection.quote;
                const commentLabel = document.createElement('label');
                commentLabel.htmlFor = 'rtc-correction-note';
                commentLabel.textContent = 'Note (optional)';
                const comment = document.createElement('textarea');
                comment.id = 'rtc-correction-note';
                comment.maxLength = 12000;
                comment.className = 'rtc-short-textarea';
                comment.placeholder = 'Why are you changing it?';
                const actions = this.makeDialogActions('Suggest correction', async button => {
                    const replacementText = replacement.value.trim();
                    if (!replacementText || replacementText === selection.quote.trim()) {
                        replacement.focus();
                        this.showToast('Enter the corrected text first.');
                        return;
                    }
                    button.disabled = true;
                    await this.createComment({
                        kind: 'correction',
                        body: comment.value.trim(),
                        replacement: replacementText,
                        quote: selection.quote,
                        targets: selection.targets,
                        parentId: null
                    });
                    this.closeDialog();
                    this.openPanel();
                });
                card.append(title, note, quote, replacementLabel, replacement, commentLabel, comment, actions);
                window.setTimeout(() => replacement.select(), 0);
            });
        }

        openReplyDialog(parent) {
            this.requireProfile(() => {
                this.openDialog(card => {
                    const title = document.createElement('h2');
                    title.className = 'rtc-dialog-title';
                    title.textContent = `Reply to ${parent.author?.name || 'this note'}`;
                    const quote = document.createElement('div');
                    quote.className = 'rtc-composer-quote';
                    quote.textContent = parent.body || parent.replacement || parent.quote;
                    const label = document.createElement('label');
                    label.htmlFor = 'rtc-reply-input';
                    label.textContent = 'Your reply';
                    const textarea = document.createElement('textarea');
                    textarea.id = 'rtc-reply-input';
                    textarea.maxLength = 12000;
                    const actions = this.makeDialogActions('Add reply', async button => {
                        const body = textarea.value.trim();
                        if (!body) {
                            textarea.focus();
                            return;
                        }
                        button.disabled = true;
                        await this.createComment({ body, quote: '', targets: [], parentId: parent.id });
                        this.closeDialog();
                        this.openPanel();
                    });
                    card.append(title, quote, label, textarea, actions);
                });
            });
        }

        ownsComment(comment) {
            return Boolean(this.profile?.id && comment.author?.id === this.profile.id);
        }

        openEditDialog(comment) {
            if (!this.ownsComment(comment)) {
                this.showToast('You can only edit comments made with this browser profile.');
                return;
            }
            if (comment.kind === 'correction') {
                this.openCorrectionEditDialog(comment);
                return;
            }

            this.openDialog(card => {
                const title = document.createElement('h2');
                title.className = 'rtc-dialog-title';
                title.textContent = comment.parentId ? 'Edit reply' : 'Edit margin note';
                const note = document.createElement('p');
                note.className = 'rtc-dialog-note';
                note.textContent = `Originally posted as ${comment.author?.name || 'Reader'}`;
                const label = document.createElement('label');
                label.htmlFor = 'rtc-edit-input';
                label.textContent = 'Comment';
                const textarea = document.createElement('textarea');
                textarea.id = 'rtc-edit-input';
                textarea.maxLength = 12000;
                textarea.value = comment.body || '';
                const actions = this.makeDialogActions('Save changes', async button => {
                    const body = textarea.value.trim();
                    if (!body) {
                        textarea.focus();
                        this.showToast('A comment cannot be empty.');
                        return;
                    }
                    button.disabled = true;
                    await this.updateCommentBody(comment, body);
                    this.closeDialog();
                });
                card.append(title, note, label, textarea, actions);
                window.setTimeout(() => {
                    textarea.focus();
                    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                }, 0);
            });
        }

        openCorrectionEditDialog(comment) {
            this.openDialog(card => {
                const title = document.createElement('h2');
                title.className = 'rtc-dialog-title';
                title.textContent = 'Edit suggested correction';
                const quote = document.createElement('div');
                quote.className = 'rtc-composer-quote';
                quote.textContent = comment.quote;
                const label = document.createElement('label');
                label.htmlFor = 'rtc-correction-edit-input';
                label.textContent = 'Replace it with';
                const textarea = document.createElement('textarea');
                textarea.id = 'rtc-correction-edit-input';
                textarea.maxLength = 12000;
                textarea.value = comment.replacement || '';
                const actions = this.makeDialogActions('Save correction', async button => {
                    const replacement = textarea.value.trim();
                    if (!replacement) {
                        textarea.focus();
                        return;
                    }
                    button.disabled = true;
                    await this.updateCorrection(comment, replacement);
                    this.closeDialog();
                });
                card.append(title, quote, label, textarea, actions);
            });
        }

        openDeleteDialog(comment) {
            if (!this.ownsComment(comment)) {
                this.showToast('You can only delete comments made with this browser profile.');
                return;
            }

            const replyCount = comment.parentId ? 0 : this.comments.filter(item => item.parentId === comment.id).length;
            this.openDialog(card => {
                const title = document.createElement('h2');
                title.className = 'rtc-dialog-title';
                title.textContent = comment.parentId
                    ? 'Delete this reply?'
                    : (comment.kind === 'correction' ? 'Delete this correction?' : 'Delete this margin note?');
                const note = document.createElement('p');
                note.className = 'rtc-dialog-note';
                note.textContent = replyCount
                    ? `This also deletes ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'} in the thread. This cannot be undone.`
                    : 'This cannot be undone.';
                const preview = document.createElement('div');
                preview.className = 'rtc-composer-quote';
                preview.textContent = comment.body || comment.replacement || comment.quote;
                const actions = this.makeDialogActions('Delete', async button => {
                    button.disabled = true;
                    await this.deleteComment(comment);
                    this.closeDialog();
                }, { destructive: true });
                card.append(title, note, preview, actions);
            });
        }

        makeDialogActions(primaryLabel, primaryAction, { destructive = false } = {}) {
            const actions = document.createElement('div');
            actions.className = 'rtc-dialog-actions';
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'rtc-button';
            cancel.textContent = 'Cancel';
            cancel.addEventListener('click', () => this.closeDialog());
            const primary = document.createElement('button');
            primary.type = 'button';
            primary.className = destructive ? 'rtc-button rtc-button-danger' : 'rtc-button rtc-button-primary';
            primary.textContent = primaryLabel;
            primary.addEventListener('click', () => primaryAction(primary));
            actions.append(cancel, primary);
            return actions;
        }

        updateProfileButton() {
            if (!this.ui) return;
            this.ui.profileName.textContent = this.profile?.name || 'Choose your name & color';
            const color = this.profile?.color || '#b66a3c';
            this.ui.profileSwatch.style.setProperty('--rtc-profile-color', color);
        }

        updateNetworkState(state) {
            this.networkState = state;
            if (!this.ui) return;
            this.ui.network.dataset.state = state;
            this.ui.network.textContent = {
                checking: 'Checking sync',
                online: 'Synced',
                offline: 'Browser only'
            }[state] || state;
        }

        async api(method, body = null) {
            const url = new URL(this.endpoint, window.location.href);
            if (method === 'GET') url.searchParams.set('documentId', this.documentId);
            const response = await fetch(url, {
                method,
                credentials: 'include',
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                body: body ? JSON.stringify(body) : undefined
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(data.error || `Comment service returned ${response.status}`);
                error.status = response.status;
                throw error;
            }
            return data;
        }

        shouldQueue(error) {
            return !error.status || error.status >= 500;
        }

        async refresh({ silent = false } = {}) {
            this.updateNetworkState('checking');
            try {
                const data = await this.api('GET');
                this.comments = Array.isArray(data.comments) ? data.comments : [];
                this.persistCache();
                this.updateNetworkState('online');
                await this.flushQueue();
                this.render();
            } catch (error) {
                this.updateNetworkState('offline');
                if (!silent) this.showToast('Could not reach the shared comment service. Showing this browser’s cached notes.');
                this.render();
            }
        }

        async createComment({ body, quote, targets, parentId, kind = 'comment', replacement = '' }) {
            const localId = createId('local');
            const now = new Date().toISOString();
            const payload = {
                documentId: this.documentId,
                parentId,
                author: this.profile,
                kind,
                body,
                replacement,
                quote,
                targets
            };
            const optimistic = {
                id: localId,
                ...payload,
                resolved: false,
                createdAt: now,
                updatedAt: now
            };
            this.comments.push(optimistic);
            this.persistCache();
            this.render();

            try {
                const data = await this.api('POST', payload);
                this.replaceCommentId(localId, data.comment);
                this.updateNetworkState('online');
                this.showToast(parentId ? 'Reply added.' : (kind === 'correction' ? 'Correction suggested.' : 'Margin note added.'));
            } catch (error) {
                const queue = this.getQueue();
                queue.push({ kind: 'create', localId, payload });
                this.saveQueue(queue);
                this.updateNetworkState('offline');
                this.showToast('Saved in this browser. It will sync when the comment service is available.');
            }
            this.persistCache();
            this.render();
        }

        replaceCommentId(localId, serverComment) {
            const index = this.comments.findIndex(comment => comment.id === localId);
            if (index >= 0) this.comments[index] = serverComment;
            else this.comments.push(serverComment);
            this.comments.forEach(comment => {
                if (comment.parentId === localId) comment.parentId = serverComment.id;
            });
            if (this.activeCommentId === localId) this.activeCommentId = serverComment.id;
        }

        async toggleResolved(comment) {
            const resolved = !comment.resolved;
            comment.resolved = resolved;
            comment.updatedAt = new Date().toISOString();
            this.persistCache();
            this.render();
            const payload = { documentId: this.documentId, commentId: comment.id, resolved };
            try {
                const data = await this.api('PATCH', payload);
                const index = this.comments.findIndex(item => item.id === comment.id);
                if (index >= 0) this.comments[index] = data.comment;
                this.updateNetworkState('online');
            } catch (error) {
                if (!this.shouldQueue(error)) {
                    await this.refresh({ silent: true });
                    this.showToast(error.message);
                    return;
                }
                const queue = this.getQueue();
                queue.push({ kind: 'patch', payload });
                this.saveQueue(queue);
                this.updateNetworkState('offline');
                this.showToast('Change saved in this browser and queued for sync.');
            }
            this.persistCache();
            this.render();
        }

        async updateCommentBody(comment, body) {
            if (!this.ownsComment(comment)) return;
            const editedAt = new Date().toISOString();
            comment.body = body;
            comment.updatedAt = editedAt;
            comment.editedAt = editedAt;
            this.persistCache();
            this.render();

            const payload = {
                documentId: this.documentId,
                commentId: comment.id,
                actorId: this.profile.id,
                body
            };
            try {
                const data = await this.api('PATCH', payload);
                const index = this.comments.findIndex(item => item.id === comment.id);
                if (index >= 0) this.comments[index] = data.comment;
                this.updateNetworkState('online');
                this.showToast(comment.parentId ? 'Reply updated.' : 'Margin note updated.');
            } catch (error) {
                if (!this.shouldQueue(error)) {
                    await this.refresh({ silent: true });
                    this.showToast(error.message);
                    return;
                }
                const queue = this.getQueue();
                queue.push({ kind: 'patch', payload });
                this.saveQueue(queue);
                this.updateNetworkState('offline');
                this.showToast('Edit saved in this browser and queued for sync.');
            }
            this.persistCache();
            this.render();
        }

        async updateCorrection(comment, replacement) {
            if (!this.ownsComment(comment)) return;
            const editedAt = new Date().toISOString();
            comment.replacement = replacement;
            comment.updatedAt = editedAt;
            comment.editedAt = editedAt;
            this.persistCache();
            this.render();

            const payload = {
                documentId: this.documentId,
                commentId: comment.id,
                actorId: this.profile.id,
                replacement
            };
            try {
                const data = await this.api('PATCH', payload);
                const index = this.comments.findIndex(item => item.id === comment.id);
                if (index >= 0) this.comments[index] = data.comment;
                this.updateNetworkState('online');
                this.showToast('Correction updated.');
            } catch (error) {
                if (!this.shouldQueue(error)) {
                    await this.refresh({ silent: true });
                    this.showToast(error.message);
                    return;
                }
                const queue = this.getQueue();
                queue.push({ kind: 'patch', payload });
                this.saveQueue(queue);
                this.updateNetworkState('offline');
                this.showToast('Edit saved in this browser and queued for sync.');
            }
            this.persistCache();
            this.render();
        }

        async deleteComment(comment) {
            if (!this.ownsComment(comment)) return;
            const deletedIds = new Set([comment.id]);
            if (!comment.parentId) {
                this.comments.forEach(item => {
                    if (item.parentId === comment.id) deletedIds.add(item.id);
                });
            }
            this.comments = this.comments.filter(item => !deletedIds.has(item.id));
            if (this.activeCommentId === comment.id) this.activeCommentId = null;
            this.persistCache();
            this.render();

            const payload = {
                documentId: this.documentId,
                commentId: comment.id,
                actorId: this.profile.id
            };
            try {
                await this.api('DELETE', payload);
                this.updateNetworkState('online');
                this.showToast(comment.parentId ? 'Reply deleted.' : 'Margin note deleted.');
            } catch (error) {
                if (!this.shouldQueue(error)) {
                    await this.refresh({ silent: true });
                    this.showToast(error.message);
                    return;
                }
                const queue = this.getQueue();
                queue.push({ kind: 'delete', payload });
                this.saveQueue(queue);
                this.updateNetworkState('offline');
                this.showToast('Deletion saved in this browser and queued for sync.');
            }
        }

        async flushQueue() {
            let queue = this.getQueue();
            if (!queue.length) return;
            const idMap = new Map();

            while (queue.length) {
                const operation = queue[0];
                try {
                    if (operation.payload.parentId && idMap.has(operation.payload.parentId)) {
                        operation.payload.parentId = idMap.get(operation.payload.parentId);
                    }
                    if (operation.payload.commentId && idMap.has(operation.payload.commentId)) {
                        operation.payload.commentId = idMap.get(operation.payload.commentId);
                    }

                    if (operation.kind === 'create') {
                        const data = await this.api('POST', operation.payload);
                        idMap.set(operation.localId, data.comment.id);
                        this.replaceCommentId(operation.localId, data.comment);
                        queue.forEach(pending => {
                            if (pending.payload.parentId === operation.localId) pending.payload.parentId = data.comment.id;
                            if (pending.payload.commentId === operation.localId) pending.payload.commentId = data.comment.id;
                        });
                    } else if (operation.kind === 'patch') {
                        await this.api('PATCH', operation.payload);
                    } else if (operation.kind === 'delete') {
                        await this.api('DELETE', operation.payload);
                    }
                    queue.shift();
                    this.saveQueue(queue);
                } catch (error) {
                    this.saveQueue(queue);
                    this.updateNetworkState('offline');
                    return;
                }
            }

            this.persistCache();
            this.updateNetworkState('online');
            this.showToast('Queued margin notes are synced.');
        }

        topLevelComments() {
            return this.comments
                .filter(comment => !comment.parentId)
                .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        }

        filteredComments() {
            const comments = this.topLevelComments();
            switch (this.activeFilter) {
                case 'open': return comments.filter(comment => !comment.resolved);
                case 'resolved': return comments.filter(comment => comment.resolved);
                case 'mine': return this.profile
                    ? comments.filter(comment => comment.author?.id === this.profile.id)
                    : [];
                case 'unread': return this.lastSeen
                    ? comments.filter(comment => new Date(comment.createdAt) > new Date(this.lastSeen))
                    : comments;
                default: return comments;
            }
        }

        render() {
            this.renderHighlights();
            this.renderComments();
            const openCount = this.topLevelComments().filter(comment => !comment.resolved).length;
            this.ui.count.textContent = String(openCount);
            this.ui.count.style.display = openCount ? '' : 'none';
        }

        renderComments() {
            if (!this.ui) return;
            const comments = this.filteredComments();
            this.ui.comments.innerHTML = '';

            if (!comments.length) {
                const empty = document.createElement('div');
                empty.className = 'rtc-empty';
                const text = document.createElement('div');
                text.textContent = this.activeFilter === 'open'
                    ? 'No open margin notes. Highlight a passage to begin.'
                    : 'No comments match this filter.';
                empty.append(text);
                this.ui.comments.append(empty);
                return;
            }

            comments.forEach(comment => this.ui.comments.append(this.createCommentCard(comment)));
        }

        createCommentCard(comment) {
            const card = document.createElement('article');
            card.className = 'rtc-comment-card';
            card.dataset.commentId = comment.id;
            card.dataset.resolved = String(Boolean(comment.resolved));
            card.dataset.kind = comment.kind || 'comment';
            card.dataset.active = String(comment.id === this.activeCommentId);
            card.style.setProperty('--rtc-author-color', normalizeColor(comment.author?.color));

            const meta = document.createElement('div');
            meta.className = 'rtc-comment-meta';
            const dot = document.createElement('span');
            dot.className = 'rtc-author-dot';
            const author = document.createElement('span');
            author.className = 'rtc-author-name';
            author.textContent = comment.author?.name || 'Reader';
            const time = document.createElement('time');
            time.className = 'rtc-comment-time';
            time.dateTime = comment.createdAt || '';
            time.textContent = `${formatWhen(comment.createdAt)}${comment.editedAt ? ' · edited' : ''}`;
            meta.append(dot, author);
            if (comment.kind === 'correction') {
                const badge = document.createElement('span');
                badge.className = 'rtc-correction-badge';
                badge.textContent = comment.correctionStatus === 'applied'
                    ? 'Applied'
                    : (comment.correctionStatus === 'dismissed' ? 'Dismissed' : 'Correction');
                meta.append(badge);
            }
            meta.append(time);

            const quote = document.createElement('blockquote');
            quote.className = 'rtc-quote';
            quote.textContent = comment.quote || comment.targets?.map(target => target.exact).join(' … ') || 'Highlighted passage';
            quote.addEventListener('click', () => this.activateComment(comment.id, { scrollStory: true }));

            const body = document.createElement('p');
            body.className = 'rtc-comment-body';
            body.textContent = comment.body;

            const replacement = document.createElement('div');
            replacement.className = 'rtc-correction-replacement';
            replacement.textContent = comment.replacement || '';

            const actions = document.createElement('div');
            actions.className = 'rtc-card-actions';
            const reply = document.createElement('button');
            reply.type = 'button';
            reply.className = 'rtc-text-button';
            reply.textContent = 'Reply';
            reply.addEventListener('click', () => this.openReplyDialog(comment));
            const resolve = document.createElement('button');
            resolve.type = 'button';
            resolve.className = 'rtc-text-button';
            resolve.textContent = comment.resolved ? 'Reopen' : 'Resolve';
            resolve.addEventListener('click', () => this.toggleResolved(comment));
            actions.append(reply, resolve);
            if (this.ownsComment(comment)) {
                const edit = document.createElement('button');
                edit.type = 'button';
                edit.className = 'rtc-text-button';
                edit.textContent = 'Edit';
                edit.addEventListener('click', () => this.openEditDialog(comment));
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'rtc-text-button rtc-text-button-danger';
                remove.textContent = 'Delete';
                remove.addEventListener('click', () => this.openDeleteDialog(comment));
                actions.append(edit, remove);
            }
            card.append(meta, quote);
            if (comment.kind === 'correction') card.append(replacement);
            if (comment.body) card.append(body);
            card.append(actions);

            const replies = this.comments
                .filter(item => item.parentId === comment.id)
                .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            if (replies.length) {
                const repliesContainer = document.createElement('div');
                repliesContainer.className = 'rtc-replies';
                replies.forEach(item => {
                    const replyEl = document.createElement('div');
                    replyEl.className = 'rtc-reply';
                    replyEl.style.setProperty('--rtc-author-color', normalizeColor(item.author?.color));
                    const replyMeta = document.createElement('div');
                    replyMeta.className = 'rtc-reply-meta';
                    const replyDot = document.createElement('span');
                    replyDot.className = 'rtc-author-dot';
                    const replyAuthor = document.createElement('span');
                    replyAuthor.className = 'rtc-author-name';
                    replyAuthor.textContent = item.author?.name || 'Reader';
                    const replyTime = document.createElement('time');
                    replyTime.className = 'rtc-comment-time';
                    replyTime.dateTime = item.createdAt || '';
                    replyTime.textContent = `${formatWhen(item.createdAt)}${item.editedAt ? ' · edited' : ''}`;
                    const replyBody = document.createElement('p');
                    replyBody.className = 'rtc-reply-body';
                    replyBody.textContent = item.body;
                    replyMeta.append(replyDot, replyAuthor, replyTime);
                    replyEl.append(replyMeta, replyBody);
                    if (this.ownsComment(item)) {
                        const replyActions = document.createElement('div');
                        replyActions.className = 'rtc-reply-actions';
                        const edit = document.createElement('button');
                        edit.type = 'button';
                        edit.className = 'rtc-text-button';
                        edit.textContent = 'Edit';
                        edit.addEventListener('click', () => this.openEditDialog(item));
                        const remove = document.createElement('button');
                        remove.type = 'button';
                        remove.className = 'rtc-text-button rtc-text-button-danger';
                        remove.textContent = 'Delete';
                        remove.addEventListener('click', () => this.openDeleteDialog(item));
                        replyActions.append(edit, remove);
                        replyEl.append(replyActions);
                    }
                    repliesContainer.append(replyEl);
                });
                card.append(repliesContainer);
            }

            return card;
        }

        navigateComments(direction) {
            const comments = this.filteredComments();
            if (!comments.length) return;
            let index = comments.findIndex(comment => comment.id === this.activeCommentId);
            if (direction === 'previous') index = index <= 0 ? comments.length - 1 : index - 1;
            else index = index < 0 || index >= comments.length - 1 ? 0 : index + 1;
            this.activateComment(comments[index].id, { scrollStory: true });
        }

        activateComment(commentId, { scrollStory = true } = {}) {
            this.activeCommentId = commentId;
            this.openPanel();
            this.renderComments();
            document.querySelectorAll('.rp-annotation-highlight').forEach(mark => {
                const ids = (mark.dataset.commentIds || '').split(',');
                mark.dataset.active = String(ids.includes(commentId));
            });
            this.ui.comments.querySelector(`[data-comment-id="${commentId}"]`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
            if (scrollStory) {
                const mark = [...document.querySelectorAll('.rp-annotation-highlight')].find(element => (
                    (element.dataset.commentIds || '').split(',').includes(commentId)
                ));
                mark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        cleanHighlights() {
            document.querySelectorAll('.rp-annotation-highlight').forEach(mark => {
                mark.replaceWith(...mark.childNodes);
            });
            this.blocks.forEach(block => block.normalize());
        }

        resolveTarget(target) {
            const byAnchor = this.blocks.find(block => block.dataset.rpAnchor === target.anchor);
            const candidates = byAnchor ? [byAnchor, ...this.blocks.filter(block => block !== byAnchor)] : this.blocks;
            let best = null;

            for (const block of candidates) {
                const text = block.textContent || '';
                if (!target.exact || !text.includes(target.exact)) continue;
                let from = 0;
                while (from <= text.length) {
                    const index = text.indexOf(target.exact, from);
                    if (index < 0) break;
                    let score = block === byAnchor ? 1000 : 0;
                    score -= Math.abs(index - (Number(target.start) || 0));
                    if (target.prefix && text.slice(Math.max(0, index - target.prefix.length), index).endsWith(target.prefix)) score += 250;
                    if (target.suffix && text.slice(index + target.exact.length, index + target.exact.length + target.suffix.length).startsWith(target.suffix)) score += 250;
                    if (!best || score > best.score) {
                        best = { element: block, start: index, end: index + target.exact.length, score };
                    }
                    from = index + 1;
                }
            }
            return best;
        }

        renderHighlights() {
            this.cleanHighlights();
            const grouped = new Map();
            this.topLevelComments().forEach(comment => {
                (comment.targets || []).forEach(target => {
                    const resolved = this.resolveTarget(target);
                    if (!resolved) return;
                    if (!grouped.has(resolved.element)) grouped.set(resolved.element, []);
                    grouped.get(resolved.element).push({
                        start: resolved.start,
                        end: resolved.end,
                        comment
                    });
                });
            });

            grouped.forEach((intervals, block) => {
                const textNodes = [];
                const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
                while (walker.nextNode()) textNodes.push(walker.currentNode);
                let globalOffset = 0;

                textNodes.forEach(node => {
                    const original = node.nodeValue || '';
                    const nodeStart = globalOffset;
                    const nodeEnd = nodeStart + original.length;
                    globalOffset = nodeEnd;
                    const touching = intervals.filter(interval => interval.start < nodeEnd && interval.end > nodeStart);
                    if (!touching.length || !original) return;

                    const boundaries = new Set([0, original.length]);
                    touching.forEach(interval => {
                        boundaries.add(Math.max(0, interval.start - nodeStart));
                        boundaries.add(Math.min(original.length, interval.end - nodeStart));
                    });
                    const points = [...boundaries].sort((a, b) => a - b);
                    const fragment = document.createDocumentFragment();

                    for (let index = 0; index < points.length - 1; index += 1) {
                        const start = points[index];
                        const end = points[index + 1];
                        const value = original.slice(start, end);
                        const absoluteStart = nodeStart + start;
                        const covering = touching.filter(interval => interval.start <= absoluteStart && interval.end >= nodeStart + end);
                        if (!covering.length) {
                            fragment.append(document.createTextNode(value));
                            continue;
                        }

                        const mark = document.createElement('span');
                        mark.className = 'rp-annotation-highlight';
                        mark.dataset.commentIds = covering.map(item => item.comment.id).join(',');
                        mark.dataset.resolved = String(covering.every(item => item.comment.resolved));
                        mark.dataset.active = String(covering.some(item => item.comment.id === this.activeCommentId));
                        mark.dataset.overlap = String(covering.length > 1);
                        const correction = covering.find(item => item.comment.kind === 'correction');
                        const marginNote = covering.find(item => item.comment.kind !== 'correction');
                        mark.dataset.kind = correction && marginNote
                            ? 'mixed'
                            : (correction ? 'correction' : 'comment');
                        mark.style.setProperty(
                            '--rtc-highlight',
                            marginNote ? normalizeColor(marginNote.comment.author?.color) : '#3f9c8f'
                        );
                        mark.style.setProperty('--rtc-correction', '#3f9c8f');
                        const secondMarginNote = covering.find(item => (
                            item !== marginNote && item.comment.kind !== 'correction'
                        ));
                        if (secondMarginNote) {
                            mark.style.setProperty('--rtc-overlap', normalizeColor(secondMarginNote.comment.author?.color));
                        }
                        mark.textContent = value;
                        fragment.append(mark);
                    }
                    node.replaceWith(fragment);
                });
            });
        }

        showToast(message) {
            window.clearTimeout(this.toastTimer);
            this.ui.toast.textContent = message;
            this.ui.toast.dataset.visible = 'true';
            this.toastTimer = window.setTimeout(() => {
                this.ui.toast.dataset.visible = 'false';
            }, 3600);
        }
    }

    function initialize() {
        const instance = new ReadThroughComments();
        if (instance.enabled) window.rpReadThroughComments = instance;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
})();
