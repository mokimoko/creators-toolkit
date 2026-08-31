(function definePreviewExport(root) {
    'use strict';

    async function updatePreview(html) {
        const iframe = document.getElementById('preview-frame');
        const previewContainer = document.querySelector('.preview-container');
        
        // Get the selected CSS template
        const cssTemplate = document.getElementById('css-template')?.value || 'generated.css';
        
        try {
            // Fetch the CSS template content
            const response = await fetch(`/api/templates/${encodeURIComponent(cssTemplate)}`);
            if (!response.ok) throw new Error(`Template request failed (${response.status})`);
            const cssContent = await response.text();
            
            // Inject the CSS into the HTML
            let htmlWithCSS = html.replace(
                '</style>',
                cssContent + '\n    </style>'
            );
            const previewIsolationCSS = '<style id="rp-preview-isolation">a{pointer-events:none!important;cursor:default!important}</style>';
            htmlWithCSS = htmlWithCSS.includes('</head>')
                ? htmlWithCSS.replace('</head>', `${previewIsolationCSS}</head>`)
                : `${previewIsolationCSS}${htmlWithCSS}`;
            iframe.setAttribute('sandbox', 'allow-scripts');
            iframe.srcdoc = htmlWithCSS;
            
        } catch (error) {
            window.RPLogger?.error('Error loading CSS template for preview:', error);
            iframe.setAttribute('sandbox', 'allow-scripts');
            iframe.srcdoc = html;
        }
        
        // Add 'has-content' class to hide the empty state placeholder
        if (previewContainer && html && html.trim()) {
            previewContainer.classList.add('has-content');
        } else if (previewContainer) {
            previewContainer.classList.remove('has-content');
        }
    }
    
    // Status message helper functions for RP Archiver
    function showStatusMessage(message, type = 'info', duration = 5000) {
        const statusContainer = document.getElementById('status-container');
        if (!statusContainer) return;
        
        // Clear existing classes
        statusContainer.className = 'status-container';
        statusContainer.innerHTML = '';
        
        // Add appropriate class and message
        statusContainer.classList.add(type);
        statusContainer.textContent = message;
        
        // Auto-clear after duration (except for errors, keep them longer)
        if (type !== 'error') {
            setTimeout(() => {
                clearStatusMessage();
            }, duration);
        }
    }
    
    function clearStatusMessage() {
        const statusContainer = document.getElementById('status-container');
        if (statusContainer) {
            statusContainer.className = 'status-container';
            statusContainer.innerHTML = '';
        }
    }
    
    // Function to copy HTML to clipboard
    async function copyHTML() {
        const htmlOutput = document.getElementById('html-output');
        if (!htmlOutput.value) {
            showStatusMessage('Please generate HTML first', 'error');
            return;
        }
        
        try {
            const copied = await root.RPArchiver.get('security').copyText(htmlOutput.value);
            if (!copied) throw new Error('Clipboard access is unavailable');
            showStatusMessage('✅ HTML copied to clipboard!', 'success');
        } catch (error) {
            showStatusMessage(`Could not copy HTML: ${error.message}`, 'error');
        }
    }
    
    // Load available CSS templates
    async function loadCSSTemplates() {
        try {
            const response = await fetch('/api/roleplay/templates');
            if (!response.ok) throw new Error(`Template list request failed (${response.status})`);
            const templates = await response.json();
            if (!Array.isArray(templates)) throw new Error('Template list response was invalid');
            
            const templateSelect = document.getElementById('css-template');
            if (templateSelect) {
                // Clear existing options except the first (default)
                templateSelect.innerHTML = '';
                
                // Add all templates
                templates.forEach(template => {
                    const option = document.createElement('option');
                    option.value = template.value;
                    option.textContent = template.label;
                    templateSelect.appendChild(option);
                });
                
                window.RPLogger?.debug(`Loaded ${templates.length} CSS templates`);
            }
        } catch (error) {
            window.RPLogger?.error('Error loading CSS templates:', error);
            // If loading fails, just keep the default option
        }
    }
    
    // Function to convert roleplay text to HTML
    async function convertToHTML() {
        const saveExport = root.RPArchiver.get('saveExport');
        const convertButton = document.getElementById('convert-btn');
        saveExport.invalidate();
        saveExport.setGenerationInProgress(true);
        if (convertButton) {
            convertButton.disabled = true;
            convertButton.setAttribute('aria-busy', 'true');
            convertButton.classList.add('is-generating');
        }
        // Let the busy state paint before synchronous parsing and rendering begins.
        await new Promise(resolve => requestAnimationFrame(() => resolve()));
        root.RPArchiver.get('notifications').show('info', 'Generating HTML...');
        showStatusMessage('🔄 Generating HTML...', 'info');

        try {
            // Inline the shared read-through runtime so exported roleplays stay portable.
            if (document.getElementById('read-through-enabled')?.checked) {
                await root.RPArchiver.get('readThroughIntegration').prepare();
            }

            const characterData = [];
            document.querySelectorAll('.character-info').forEach(div => {
                const name = div.querySelector('.char-name').value;
                const color = div.querySelector('.char-color').value;
                if (name.trim()) characterData.push({ name, color });
            });

            const convertedBreaks = typeof normalizeLegacyMarkersInPartEditor === 'function'
                ? normalizeLegacyMarkersInPartEditor()
                : 0;
            if (convertedBreaks) {
                showStatusMessage(`Converted ${convertedBreaks} legacy part break${convertedBreaks === 1 ? '' : 's'} in memory.`, 'info');
            }

            const editorParts = typeof getStoryPartsFromEditor === 'function'
                ? getStoryPartsFromEditor()
                : [{ id: 'part-1', title: 'Story', sourceText: document.getElementById('rp-text').value }];
            const rpText = editorParts.map(part => part.sourceText).join('\n\n');
            if (!rpText.trim()) throw new Error('Enter some roleplay text before generating the preview.');

            const noCharacters = document.getElementById('no-characters').checked;
            rpProjectState.parsedParts = editorParts.map(part => ({
                ...part,
                entries: parseRoleplayText(part.sourceText, characterData, {
                    usePartMarkers: false,
                    noCharacters
                })
            }));
            rpProjectState.parsedEntries = [];
            rpProjectState.parsedParts.forEach((part, index) => {
                if (index > 0) rpProjectState.parsedEntries.push({ type: 'partBreak', partIndex: index });
                rpProjectState.parsedEntries.push(...part.entries);
            });
            if (typeof syncLegacySourceField === 'function') syncLegacySourceField();
            updateWordCount();

            const html = root.RPArchiver.get('htmlRenderer').render();
            document.getElementById('html-output').value = html;
            if (document.querySelector('.tab[data-tab="preview"]').classList.contains('active')) {
                await updatePreview(html);
            }

            saveExport.markGenerated(html);
            showStatusMessage('Preview generated. Save project and Export HTML are ready.', 'success');
            root.RPArchiver.get('notifications').show('success', 'Preview generated successfully');
            return html;
        } catch (error) {
            saveExport.invalidate();
            window.RPLogger?.error('Preview generation failed:', error);
            showStatusMessage(`Preview generation failed: ${error.message}`, 'error');
            root.RPArchiver.get('notifications').show('error', 'Preview generation failed');
            return null;
        } finally {
            saveExport.setGenerationInProgress(false);
            if (convertButton) {
                convertButton.disabled = false;
                convertButton.setAttribute('aria-busy', 'false');
                convertButton.classList.remove('is-generating');
            }
        }
    }

    root.RPArchiver.define('previewExport', {
        clearStatus: clearStatusMessage,
        copyHTML,
        convertToHTML,
        loadCSSTemplates,
        showStatus: showStatusMessage,
        updatePreview
    });
})(window);
