// notebook-export.js - Handle all export functionality for Notebook

class NotebookExportManager {
    constructor(notebookManager) {
        this.notebookManager = notebookManager;
        console.log('📤 Notebook Export Manager initialized');
    }

    // Export individual note as markdown
    async exportNote(noteId) {
        if (!noteId) {
            this.showToast('No note selected for export', 'error');
            return;
        }

        // Find the note to get its name for the filename
        const note = this.notebookManager.savedNotes.find(n => n.id === noteId);
        if (!note) {
            this.showToast('Note not found', 'error');
            return;
        }

        console.log(`📤 Exporting note: "${note.name}"`);
        
        try {
            // Show loading indicator
            this.showExportLoading(`Exporting "${note.name}"...`);

            const response = await fetch(`/api/notebook/notes/${noteId}/export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userContext: this.notebookManager.getUserContext(),
                    notebookId: this.notebookManager.currentNotebookId
                })
            });

            this.hideExportLoading();

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || 'Export failed');
            }

            // Download the file
            const blob = await response.blob();
            const filename = this.getFilenameFromResponse(response) || `${this.sanitizeFilename(note.name)}.md`;
            this.downloadBlob(blob, filename);
            
            this.showToast(`Note exported: ${filename}`, 'success');
            console.log(`✅ Note exported successfully: ${filename}`);

        } catch (error) {
            this.hideExportLoading();
            console.error('❌ Error exporting note:', error);
            this.showToast(`Export failed: ${error.message}`, 'error');
        }
    }

    // Export entire notebook as ZIP
    async exportNotebook(notebookId) {
        if (!notebookId) {
            this.showToast('No notebook selected for export', 'error');
            return;
        }

        // Get notebook name for display
        let notebookName = 'Notebook';
        if (this.notebookManager.workspaceManager && this.notebookManager.workspaceManager.availableNotebooks) {
            const notebook = this.notebookManager.workspaceManager.availableNotebooks.find(nb => nb.id === notebookId);
            if (notebook) {
                notebookName = notebook.name;
            }
        }

        console.log(`📦 Exporting full notebook: "${notebookName}" (${notebookId})`);
        
        try {
            // Show loading indicator
            this.showExportLoading(`Exporting "${notebookName}" notebook...`);

            const response = await fetch(`/api/notebook/${notebookId}/export`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userContext: this.notebookManager.getUserContext()
                })
            });

            this.hideExportLoading();

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || 'Export failed');
            }

            // Download the ZIP file
            const blob = await response.blob();
            const filename = this.getFilenameFromResponse(response) || `${this.sanitizeFilename(notebookName)}_Export.zip`;
            this.downloadBlob(blob, filename);
            
            this.showToast(`Notebook exported: ${filename}`, 'success');
            console.log(`✅ Notebook exported successfully: ${filename}`);

        } catch (error) {
            this.hideExportLoading();
            console.error('❌ Error exporting notebook:', error);
            this.showToast(`Export failed: ${error.message}`, 'error');
        }
    }

    // Show loading overlay for export operations
    showExportLoading(message) {
        // Remove any existing loading overlay
        this.hideExportLoading();
        
        const overlay = document.createElement('div');
        overlay.id = 'export-loading-overlay';
        overlay.className = 'shell-loading-overlay notebook-export-loading';
        
        overlay.innerHTML = `
            <div class="shell-loading-panel">
                <div class="notebook-export-icon">
                    <i class="fas fa-download fa-spin"></i>
                </div>
                <div class="shell-loading-message">Exporting…</div>
                <div class="shell-loading-helper">${this.escapeHtml(message)}</div>
            </div>
        `;
        
        document.body.appendChild(overlay);
    }

    // Hide loading overlay
    hideExportLoading() {
        const overlay = document.getElementById('export-loading-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    // Download blob as file
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        
        // Add to DOM temporarily and click
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up the URL
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // Extract filename from response headers
    getFilenameFromResponse(response) {
        const contentDisposition = response.headers.get('Content-Disposition');
        if (contentDisposition) {
            const encodedFilenameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
            if (encodedFilenameMatch) {
                try {
                    return decodeURIComponent(encodedFilenameMatch[1]);
                } catch (error) {
                    console.warn('Could not decode exported filename:', error);
                }
            }

            const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);
            if (filenameMatch) {
                return filenameMatch[1];
            }
        }
        return null;
    }

    // Sanitize filename for download
    sanitizeFilename(filename) {
        return filename
            .replace(/[^a-zA-Z0-9\s\-_]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase();
    }

    // Show toast notification
    showToast(message, type = 'info') {
        if (this.notebookManager && this.notebookManager.showToast) {
            this.notebookManager.showToast(message, type);
        } else if (window.authManager && window.authManager.showToast) {
            window.authManager.showToast(message, type);
        } else {
            console.log(`Toast (${type}): ${message}`);
        }
    }

    // Escape HTML for safety
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

}
