(function exposeModelCatalogUI(root) {
    'use strict';

    const sourceLabels = {
        live: 'Live provider catalog',
        cache: 'Last successful catalog',
        fallback: 'Built-in fallback catalog'
    };

    function tokenLabel(value) {
        if (!Number.isFinite(Number(value))) return '';
        return `${Number(value).toLocaleString()} token${Number(value) === 1 ? '' : 's'}`;
    }

    function priceLabel(pricing) {
        if (!pricing || typeof pricing !== 'object') return '';
        const prompt = Number(pricing.prompt);
        const completion = Number(pricing.completion);
        if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return '';
        if (prompt === 0 && completion === 0) return 'Free';
        return `$${(prompt * 1_000_000).toFixed(2)} input / $${(completion * 1_000_000).toFixed(2)} output per 1M tokens`;
    }

    class ModelCatalogUI {
        constructor({ select, search, status, details, manualInput }) {
            this.select = select;
            this.search = search;
            this.status = status;
            this.details = details;
            this.manualInput = manualInput;
            this.models = [];
            this.source = null;
            this.currentModel = '';
            this.freeOnly = false;

            this.search?.addEventListener('input', () => this.render());
            this.select?.addEventListener('change', () => {
                this.currentModel = this.select.value;
                this.renderDetails();
            });
            this.manualInput?.addEventListener('input', () => {
                const manualModel = this.manualInput.value.trim();
                if (manualModel) {
                    this.currentModel = manualModel;
                    this.select.value = '';
                }
                this.renderDetails();
            });
        }

        setLoading() {
            this.models = [];
            this.select.innerHTML = '<option value="">Loading live models…</option>';
            this.select.disabled = true;
            this.setStatus('Loading live models…');
            this.setDetails('');
        }

        setCatalog({ models = [], source = 'fallback', currentModel = '', freeOnly = false }) {
            this.models = models;
            this.source = source;
            this.freeOnly = freeOnly;
            const compatible = freeOnly
                ? models.filter(model => model.isFree === true || model.value.endsWith(':free'))
                : models;
            this.currentModel = freeOnly
                ? (compatible.some(model => model.value === currentModel) ? currentModel : '')
                : (currentModel || '');
            this.select.disabled = false;
            this.render();
        }

        setFreeOnly(freeOnly) {
            this.freeOnly = Boolean(freeOnly);
            const currentIsCompatible = !this.freeOnly || this.models.some(model =>
                model.value === this.currentModel && (model.isFree === true || model.value.endsWith(':free'))
            );
            if (!currentIsCompatible) this.currentModel = '';
            this.render();
        }

        setUnavailable(message, currentModel = '') {
            this.models = [];
            this.source = null;
            this.currentModel = currentModel || '';
            this.select.disabled = false;
            this.select.innerHTML = `<option value="">${message}</option>`;
            if (this.manualInput && currentModel) this.manualInput.value = currentModel;
            this.setStatus(message);
            this.setDetails(currentModel ? `Manual model ID: ${currentModel}` : '');
        }

        matches(model, query) {
            if (!query) return true;
            return [model.label, model.value, model.description]
                .some(value => String(value || '').toLowerCase().includes(query));
        }

        render() {
            const query = this.search?.value.trim().toLowerCase() || '';
            const compatible = this.freeOnly
                ? this.models.filter(model => model.isFree === true || model.value.endsWith(':free'))
                : this.models;
            const visible = compatible.filter(model => this.matches(model, query));
            const current = this.models.find(model => model.value === this.currentModel);
            const options = current && !visible.includes(current) ? [current, ...visible] : visible;

            this.select.replaceChildren();
            if (options.length === 0) {
                const option = new Option(
                    query ? 'No matching models — enter an ID manually' : 'No compatible models — enter an ID manually',
                    ''
                );
                this.select.add(option);
            } else {
                for (const model of options) {
                    const selectedOutsideFilter = model === current && !visible.includes(model);
                    const option = new Option(
                        `${selectedOutsideFilter ? 'Selected: ' : ''}${model.label || model.value}`,
                        model.value
                    );
                    option.title = model.description || model.value;
                    this.select.add(option);
                }
            }

            if (current) {
                this.select.value = current.value;
                if (this.manualInput) this.manualInput.value = '';
            } else if (this.currentModel) {
                this.select.add(new Option('Saved model unavailable — using manual ID', ''), 0);
                this.select.value = '';
                if (this.manualInput) this.manualInput.value = this.currentModel;
            } else if (options.length > 0) {
                this.select.value = options[0].value;
                this.currentModel = options[0].value;
                if (this.manualInput) this.manualInput.value = '';
            }

            const source = sourceLabels[this.source] || 'Model catalog';
            const count = query ? `${visible.length} of ${compatible.length}` : String(compatible.length);
            const filterSuffix = this.freeOnly ? ' · free models only' : '';
            this.setStatus(`${source} · ${count} model${compatible.length === 1 ? '' : 's'}${filterSuffix}`);
            this.renderDetails();
        }

        renderDetails() {
            const model = this.models.find(item => item.value === this.select.value);
            if (!model) {
                this.setDetails(this.manualInput?.value ? `Manual model ID: ${this.manualInput.value.trim()}` : '');
                return;
            }
            const details = [
                model.value,
                model.isFree === true ? 'Free' : priceLabel(model.pricing),
                model.contextLength ? `${tokenLabel(model.contextLength)} context` : '',
                model.maxOutputTokens ? `${tokenLabel(model.maxOutputTokens)} max output` : '',
                model.description
            ].filter(Boolean);
            this.setDetails(details.join(' · '));
        }

        setStatus(message) {
            if (this.status) this.status.textContent = message;
        }

        setDetails(message) {
            if (this.details) {
                this.details.textContent = message;
                this.details.hidden = !message;
            }
        }
    }

    root.CoWriterModelCatalogUI = Object.freeze({
        create(ids) {
            return new ModelCatalogUI({
                select: document.getElementById(ids.select),
                search: document.getElementById(ids.search),
                status: document.getElementById(ids.status),
                details: document.getElementById(ids.details),
                manualInput: document.getElementById(ids.manualInput)
            });
        }
    });
}(typeof globalThis !== 'undefined' ? globalThis : this));
