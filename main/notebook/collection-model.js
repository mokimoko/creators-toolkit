(function initializeNotebookCollectionModel(root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.NotebookCollectionModel = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function createNotebookCollectionModel() {
    'use strict';

    function slugifyCollectionName(name) {
        const slug = String(name ?? '')
            .normalize('NFKC')
            .trim()
            .toLocaleLowerCase('en-US')
            .replace(/[\u0000-\u001F\u007F/\\]+/g, '-')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        if (!slug) throw new Error('Collection name must contain a usable character');
        return slug;
    }

    function cloneCollection(collection) {
        return {
            ...collection,
            notes: Array.isArray(collection?.notes) ? [...collection.notes] : []
        };
    }

    function planRename(collections, notes, oldKey, newName, newColor) {
        const source = collections.map(cloneCollection);
        const root = source.find(collection => collection.key === oldKey);
        if (!root) throw new Error('Collection not found');

        const parentKey = root.parent || '';
        const newSegment = slugifyCollectionName(newName);
        const newRootKey = parentKey ? `${parentKey}/${newSegment}` : newSegment;
        const subtree = source
            .filter(collection => collection.key === oldKey || collection.key.startsWith(`${oldKey}/`))
            .sort((a, b) => a.key.length - b.key.length);
        const subtreeKeys = new Set(subtree.map(collection => collection.key));
        const keyMap = new Map(
            subtree.map(collection => [
                collection.key,
                `${newRootKey}${collection.key.slice(oldKey.length)}`
            ])
        );

        for (const newKey of keyMap.values()) {
            if (source.some(collection => collection.key === newKey && !subtreeKeys.has(collection.key))) {
                throw new Error('A collection with this name already exists at this level');
            }
        }

        const updatedCollections = source.map(collection => {
            if (!keyMap.has(collection.key)) return collection;
            const updatedKey = keyMap.get(collection.key);
            return {
                ...collection,
                key: updatedKey,
                name: collection.key === oldKey ? newName : collection.name,
                color: collection.key === oldKey ? newColor : collection.color,
                parent: keyMap.get(collection.parent) || collection.parent || null,
                level: updatedKey.split('/').length
            };
        });
        const assignments = notes
            .filter(note => keyMap.has(note.collection) && keyMap.get(note.collection) !== note.collection)
            .map(note => ({ noteId: note.id, collection: keyMap.get(note.collection) }));

        return { assignments, collections: updatedCollections, keyMap, newRootKey };
    }

    function collectDescendantKeys(collections, rootKey) {
        const children = new Map();
        for (const collection of collections) {
            const parent = collection?.parent || '';
            if (!children.has(parent)) children.set(parent, []);
            children.get(parent).push(collection.key);
        }

        const affected = new Set();
        const visit = key => {
            if (affected.has(key)) return;
            affected.add(key);
            for (const childKey of children.get(key) || []) visit(childKey);
        };
        visit(rootKey);
        return affected;
    }

    function planDelete(collections, notes, collectionKey) {
        if (!collectionKey) throw new Error('Uncategorized cannot be deleted');
        if (!collections.some(collection => collection.key === collectionKey)) {
            throw new Error('Collection not found');
        }

        const affectedKeys = collectDescendantKeys(collections, collectionKey);
        return {
            affectedKeys,
            assignments: notes
                .filter(note => affectedKeys.has(note.collection))
                .map(note => ({ noteId: note.id, collection: '' })),
            collections: collections
                .filter(collection => !affectedKeys.has(collection.key))
                .map(cloneCollection)
        };
    }

    function remapKeySet(values, keyMap) {
        return new Set([...values].map(value => keyMap.get(value) || value));
    }

    return Object.freeze({
        planDelete,
        planRename,
        remapKeySet,
        slugifyCollectionName
    });
}));
