'use strict';

const { writeJsonAtomic } = require('./cowriter-storage');
const { normalizeNoteDocument } = require('./notebook-schemas');

class NotebookCollectionMutationError extends Error {
    constructor(message, statusCode = 500, cause = undefined) {
        super(message, { cause });
        this.name = 'NotebookCollectionMutationError';
        this.statusCode = statusCode;
    }
}

async function restoreSnapshot(fs, snapshot, writeJson) {
    if (snapshot.existed) {
        await writeJson(snapshot.path, snapshot.value);
    } else {
        await fs.remove(snapshot.path);
    }
}

async function applyCollectionMutationTransaction({
    fs,
    collectionsPath,
    collections,
    noteAssignments,
    timestamp = Date.now(),
    writeJson = writeJsonAtomic
}) {
    const collectionSnapshot = {
        path: collectionsPath,
        existed: await fs.pathExists(collectionsPath),
        value: null
    };
    if (collectionSnapshot.existed) {
        collectionSnapshot.value = await fs.readJson(collectionsPath);
    }

    const noteSnapshots = [];
    for (const assignment of noteAssignments) {
        if (!(await fs.pathExists(assignment.path))) {
            throw new NotebookCollectionMutationError(`Note not found: ${assignment.noteId}`, 404);
        }
        noteSnapshots.push({
            path: assignment.path,
            existed: true,
            value: await fs.readJson(assignment.path),
            collection: assignment.collection
        });
    }

    const updatedNotes = noteSnapshots.map(snapshot => normalizeNoteDocument({
        ...snapshot.value,
        collection: snapshot.collection,
        lastModified: timestamp
    }));

    try {
        for (let index = 0; index < noteSnapshots.length; index += 1) {
            await writeJson(noteSnapshots[index].path, updatedNotes[index]);
        }
        await writeJson(collectionsPath, {
            collections,
            lastModified: timestamp
        });
        return updatedNotes;
    } catch (error) {
        const rollbackErrors = [];
        for (const snapshot of [...noteSnapshots, collectionSnapshot]) {
            try {
                await restoreSnapshot(fs, snapshot, writeJson);
            } catch (rollbackError) {
                rollbackErrors.push(rollbackError);
            }
        }

        if (rollbackErrors.length > 0) {
            throw new AggregateError(
                [error, ...rollbackErrors],
                'Collection update failed and could not be fully rolled back'
            );
        }
        throw new NotebookCollectionMutationError('Collection update failed and was rolled back', 500, error);
    }
}

module.exports = {
    NotebookCollectionMutationError,
    applyCollectionMutationTransaction
};
