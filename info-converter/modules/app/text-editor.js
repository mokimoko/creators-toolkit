const FIELD_NAMES = Object.freeze({
    'char-basic': 'Basic Information',
    'char-physical': 'Physical Description',
    'char-personality': 'Personality',
    'char-sexuality': 'Sexuality',
    'char-fighting-style': 'Fighting Style',
    'char-background': 'Background',
    'char-equipment': 'Weapons/Armor/Equipment',
    'char-hobbies': 'Hobbies/Pastimes',
    'char-quirks': 'Quirks/Mannerisms',
    'char-relationships': 'Relationships',
    'char-notes': 'Notes',
    'event-notes': 'Event Notes',
    'loc-description': 'Location Description',
    'loc-features': 'Notable Features',
    'loc-connections': 'Inhabitants/Connections',
    'item-description': 'Item Description',
    'item-properties': 'Properties/Characteristics',
    'item-connections': 'Related Information',
    'element-paragraph-content': 'Paragraph Content',
    'element-subcontainer-content': 'Container Content',
    'element-imagetext-right-content': 'Text Content',
    'element-imagetext-left-content': 'Text Content'
});

export function createTextEditorController(dependencies) {
    function initializeTextEditorModal() {
        const modal = document.getElementById('universalTextEditorModal');
        const closeButton = document.getElementById('closeUniversalTextEditor');
        const expandedTextarea = document.getElementById('universal-expanded-text');
        const modalTitle = document.getElementById('universal-editor-title');
        const modalWordCount = document.getElementById('universal-word-count');
        const modalPageCount = document.getElementById('universal-page-count');
        let currentFieldId = null;
        let currentOriginalTextarea = null;

        if (!modal || !closeButton || !expandedTextarea) {
            console.log('Universal text editor modal elements not found');
            return;
        }

        function updateModalWordCount() {
            if (!dependencies.countWords || !dependencies.calculatePageCount) return;
            const wordCount = dependencies.countWords(expandedTextarea.value);
            if (!Number.isFinite(wordCount)) return;
            const pageCount = dependencies.calculatePageCount(wordCount);
            if (modalWordCount) modalWordCount.textContent = `Words: ${wordCount}`;
            if (modalPageCount) modalPageCount.textContent = `Pages: ${pageCount}`;
        }

        function openTextEditor(fieldId) {
            const originalTextarea = document.getElementById(fieldId);
            if (!originalTextarea) {
                console.error('Original textarea not found:', fieldId);
                return;
            }

            currentFieldId = fieldId;
            currentOriginalTextarea = originalTextarea;
            if (modalTitle) modalTitle.textContent = FIELD_NAMES[fieldId] || 'Edit Text';
            expandedTextarea.value = originalTextarea.value;
            modal.style.display = 'block';
            setTimeout(() => modal.classList.add('show'), 10);
            setTimeout(() => expandedTextarea.focus(), 100);
            updateModalWordCount();
            document.body.style.overflow = 'hidden';
        }

        function closeTextEditor() {
            if (currentOriginalTextarea && currentFieldId) {
                currentOriginalTextarea.value = expandedTextarea.value;
                currentOriginalTextarea.dispatchEvent(new Event('input', { bubbles: true }));
            }

            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
                currentFieldId = null;
                currentOriginalTextarea = null;
            }, 300);
            document.body.style.overflow = '';
        }

        closeButton.addEventListener('click', closeTextEditor);
        modal.addEventListener('click', event => {
            if (event.target === modal) closeTextEditor();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && modal.classList.contains('show')) closeTextEditor();
        });
        expandedTextarea.addEventListener('input', updateModalWordCount);
        document.addEventListener('click', event => {
            const expandButton = event.target.closest('.expand-text-btn');
            const fieldId = expandButton?.getAttribute('data-field');
            if (fieldId) openTextEditor(fieldId);
        });

        console.log('✅ Universal text editor modal initialized');
    }

    return { initializeTextEditorModal };
}
