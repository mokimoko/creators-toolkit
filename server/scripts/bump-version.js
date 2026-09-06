'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SERVER_ROOT = path.resolve(__dirname, '..');
const TOOLKIT_ROOT = path.resolve(SERVER_ROOT, '..');
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function usage() {
    console.log('Usage: npm run bump-version -- <version>');
    console.log('Example: npm run bump-version -- 4.0.3');
}

function readText(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function writeIfChanged(filePath, content) {
    const current = readText(filePath);
    if (current === content) return false;
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
}

function updateJsonVersion(filePath, version, mutate) {
    const source = readText(filePath);
    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    const data = JSON.parse(source);
    const before = JSON.stringify(data);
    mutate(data, version);
    if (JSON.stringify(data) === before) return false;
    return writeIfChanged(filePath, `${JSON.stringify(data, null, 2)}${eol}`);
}

function releaseDate() {
    const now = new Date();
    return [
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        now.getFullYear()
    ].join('/');
}

function updateReadme(filePath, version) {
    const source = readText(filePath);
    const next = source.replace(
        /^# Creator's Toolkit v[^\r\n]+/m,
        `# Creator's Toolkit v${version}`
    );
    if (next === source && !source.includes(`# Creator's Toolkit v${version}`)) {
        throw new Error('Could not find the Creator\'s Toolkit version heading in README.md');
    }
    return writeIfChanged(filePath, next);
}

function updateChangelog(filePath, version) {
    const source = readText(filePath);
    if (new RegExp(`^## v${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'm').test(source)) {
        return false;
    }

    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    const marker = `# Changelog${eol}`;
    if (!source.startsWith(marker)) throw new Error('CHANGELOG.md must begin with "# Changelog"');
    const section = [
        '',
        `## v${version} - ${releaseDate()}`,
        '',
        '<!-- Describe the release here before publishing. -->',
        '',
        '---',
        ''
    ].join(eol);
    return writeIfChanged(filePath, `${marker}${section}${source.slice(marker.length)}`);
}

function main() {
    const version = process.argv[2]?.trim();
    if (!version || version === '--help' || version === '-h') {
        usage();
        process.exitCode = version ? 0 : 1;
        return;
    }
    if (!VERSION_PATTERN.test(version)) {
        throw new Error(`Invalid semantic version: ${version}`);
    }

    const changed = [];
    const packagePath = path.join(SERVER_ROOT, 'package.json');
    const lockPath = path.join(SERVER_ROOT, 'package-lock.json');
    const readmePath = path.join(TOOLKIT_ROOT, 'README.md');
    const changelogPath = path.join(TOOLKIT_ROOT, 'CHANGELOG.md');

    if (updateJsonVersion(packagePath, version, data => { data.version = version; })) {
        changed.push(path.relative(TOOLKIT_ROOT, packagePath));
    }
    if (updateJsonVersion(lockPath, version, data => {
        data.version = version;
        if (!data.packages?.['']) throw new Error('package-lock.json is missing its root package');
        data.packages[''].version = version;
    })) {
        changed.push(path.relative(TOOLKIT_ROOT, lockPath));
    }
    if (updateReadme(readmePath, version)) changed.push('README.md');
    if (updateChangelog(changelogPath, version)) changed.push('CHANGELOG.md');

    if (changed.length) {
        console.log(`Creator's Toolkit version set to ${version}.`);
        console.log(`Updated: ${changed.join(', ')}`);
    } else {
        console.log(`Creator's Toolkit is already version ${version}; no files changed.`);
    }
}

try {
    main();
} catch (error) {
    console.error(`Version update failed: ${error.message}`);
    process.exitCode = 1;
}
