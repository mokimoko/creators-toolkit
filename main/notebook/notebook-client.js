// Network boundary for Notebook notes and snippets.

class NotebookClient {
    constructor(getUserContext) {
        this.getUserContext = getUserContext;
    }

    async request(path, { method = 'POST', body = {} } = {}) {
        const response = await fetch(path, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userContext: this.getUserContext(),
                ...body
            })
        });

        let result;
        try {
            result = await response.json();
        } catch (_error) {
            throw new Error(`Notebook request failed (${response.status})`);
        }

        if (!response.ok || !result.success) {
            throw new Error(result.error || `Notebook request failed (${response.status})`);
        }
        return result;
    }

    async loadNotes(notebookId, userContext = this.getUserContext()) {
        const result = await this.request('/api/notebook/notes', {
            body: { userContext, notebookId }
        });
        return result.notes || [];
    }

    async loadSnippets(notebookId, userContext = this.getUserContext()) {
        const result = await this.request('/api/notebook/snippets', {
            body: { userContext, notebookId }
        });
        return result.snippets || [];
    }

    async saveNote(noteData, notebookId) {
        const result = await this.request('/api/notebook/notes/save', {
            body: { notebookId, noteData }
        });
        return result.note;
    }

    async loadNote(noteId, notebookId) {
        const result = await this.request('/api/notebook/notes/get', {
            body: { notebookId, noteId }
        });
        return result.note;
    }

    async deleteNote(noteId, notebookId) {
        await this.request(`/api/notebook/notes/${encodeURIComponent(noteId)}`, {
            method: 'DELETE',
            body: { notebookId }
        });
        return true;
    }

    async saveSnippet(snippetData, notebookId) {
        const result = await this.request('/api/notebook/snippets/save', {
            body: { notebookId, snippetData, chatSessionId: null }
        });
        return result.snippet;
    }

    async deleteSnippet(snippetId, notebookId) {
        await this.request(`/api/notebook/snippets/${encodeURIComponent(snippetId)}`, {
            method: 'DELETE',
            body: { notebookId }
        });
        return true;
    }
}

window.NotebookClient = NotebookClient;
