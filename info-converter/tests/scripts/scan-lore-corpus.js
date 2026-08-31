'use strict';

const fs = require('fs');
const path = require('path');
const { migrateLoreProject, validateLoreProject } = require('../../modules/project-contract');
const { extractProjectPayload } = require('../helpers/project-payload');

function parseArguments(argv) {
    const options = { root: path.resolve(__dirname, '../../../users'), showPaths: false };
    for (const argument of argv) {
        if (argument === '--show-paths') {
            options.showPaths = true;
        } else if (!argument.startsWith('--')) {
            options.root = path.resolve(argument);
        }
    }
    return options;
}

function findHtmlFiles(root) {
    const files = [];
    const pending = [root];
    while (pending.length > 0) {
        const directory = pending.pop();
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const fullPath = path.join(directory, entry.name);
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) pending.push(fullPath);
            if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.html') files.push(fullPath);
        }
    }
    return files.sort();
}

function censusPrivateFields(value, census = { hiddenObjects: 0, nonEmptyNotes: 0 }) {
    if (Array.isArray(value)) {
        for (const item of value) censusPrivateFields(item, census);
        return census;
    }
    if (!value || typeof value !== 'object') return census;

    if (value.hidden === true) census.hiddenObjects += 1;
    if (typeof value.notes === 'string' && value.notes.trim()) census.nonEmptyNotes += 1;
    for (const child of Object.values(value)) censusPrivateFields(child, census);
    return census;
}

function scanCorpus(options) {
    if (!fs.existsSync(options.root)) throw new Error(`Corpus folder does not exist: ${options.root}`);

    const report = {
        htmlFiles: 0,
        formats: {},
        embeddedShapes: {},
        parseFailures: 0,
        invariantFailures: 0,
        migratedProjects: 0,
        migrationWarnings: 0,
        hiddenObjects: 0,
        nonEmptyNotes: 0,
        linkedLorebooks: 0
    };
    if (options.showPaths) report.failures = [];

    const files = findHtmlFiles(options.root);
    report.htmlFiles = files.length;

    for (const file of files) {
        try {
            const html = fs.readFileSync(file, 'utf8');
            const extracted = extractProjectPayload(html);
            report.formats[extracted.format] = (report.formats[extracted.format] || 0) + 1;
            if (!extracted.data) continue;

            const shape = Object.keys(extracted.data).sort().join('|') || '(empty)';
            report.embeddedShapes[shape] = (report.embeddedShapes[shape] || 0) + 1;

            const migration = migrateLoreProject(extracted.data);
            const errors = validateLoreProject(migration.project);
            if (migration.report.steps.length > 0) report.migratedProjects += 1;
            report.migrationWarnings += migration.report.warnings.length;
            if (errors.length > 0) {
                report.invariantFailures += 1;
                if (options.showPaths) report.failures.push({ file: path.relative(options.root, file), errors });
            }

            const privateFields = censusPrivateFields(extracted.data);
            report.hiddenObjects += privateFields.hiddenObjects;
            report.nonEmptyNotes += privateFields.nonEmptyNotes;
            if (extracted.data.linkedLorebook || extracted.data.integrations?.linkedLorebook) {
                report.linkedLorebooks += 1;
            }
        } catch (error) {
            report.parseFailures += 1;
            if (options.showPaths) {
                report.failures.push({ file: path.relative(options.root, file), errors: [error.message] });
            }
        }
    }

    return report;
}

try {
    const options = parseArguments(process.argv.slice(2));
    const report = scanCorpus(options);
    console.log(JSON.stringify(report, null, 2));
    if (report.parseFailures > 0 || report.invariantFailures > 0) process.exitCode = 1;
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
