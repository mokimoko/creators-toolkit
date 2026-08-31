'use strict';

const path = require('node:path');
const {
    listLegacyDefaultNotes,
    migrateLegacyDefaultCollections
} = require('../notebook-migrations');

async function main() {
    const apply = process.argv.includes('--apply');
    const repositoryRoot = path.resolve(__dirname, '..', '..');
    const usersFolder = path.join(repositoryRoot, 'users');
    const backupRoot = path.join(repositoryRoot, '_backups');
    const candidates = await listLegacyDefaultNotes(usersFolder);

    if (!apply) {
        console.log(JSON.stringify({
            mode: 'dry-run',
            candidateCount: candidates.length,
            paths: candidates.map(candidate => path.relative(usersFolder, candidate.path).replace(/\\/g, '/'))
        }, null, 2));
        return;
    }

    const result = await migrateLegacyDefaultCollections({ usersFolder, backupRoot });
    console.log(JSON.stringify({
        mode: 'apply',
        migratedCount: result.migrated.length,
        alreadyCurrent: result.alreadyCurrent,
        backupFolder: result.backupFolder
            ? path.relative(repositoryRoot, result.backupFolder).replace(/\\/g, '/')
            : null
    }, null, 2));
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
