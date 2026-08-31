'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE_ROOT = path.join(__dirname, 'fixtures');
const DEFAULT_CORPUS_ROOT = path.join(PROJECT_ROOT, 'users');

function countMatches(source, pattern) {
    return (source.match(pattern) || []).length;
}

function extractTemplateId(source) {
    const meta = source.match(/<meta\b[^>]*\bname=["']rp-archiver-template["'][^>]*\bcontent=["']([^"']+)["']/i);
    return meta ? meta[1] : null;
}

function inspectHtml(source) {
    return {
        hasTemplateMeta: /<meta\b[^>]*\bname=["']rp-archiver-template["']/i.test(source),
        hasMarkedRpStyle: /<style\b[^>]*\bid=["']rp-archiver-generated-styles["']/i.test(source),
        hasDataOriginal: /\bdata-original\s*=/i.test(source),
        hasPartContainers: /\bid=["']part-[a-z0-9_-]+(?:-content)?["']/i.test(source),
        hasPartHeaders: /\bclass=["'][^"']*\bpart-header\b/i.test(source),
        hasReadThrough: /<meta\b[^>]*\bname=["']rp-read-through-enabled["'][^>]*\bcontent=["']true["']/i.test(source),
        hasStructuredProjectData: /\bid=["']rp-archiver-project-data["']|\brp-archiver-schema\b/i.test(source),
        styleTags: countMatches(source, /<style\b/gi),
        scriptTags: countMatches(source, /<script\b/gi)
    };
}

function structureSignature(result) {
    return [
        result.hasTemplateMeta,
        result.hasMarkedRpStyle,
        result.hasDataOriginal,
        result.hasPartContainers,
        result.hasReadThrough,
        result.hasStructuredProjectData
    ].join('|');
}

function listHtmlFiles(root) {
    if (!fs.existsSync(root)) return [];

    const files = [];
    const pending = [root];

    while (pending.length) {
        const current = pending.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const entryPath = path.join(current, entry.name);
            if (entry.isDirectory()) pending.push(entryPath);
            else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) files.push(entryPath);
        }
    }

    return files.sort();
}

function isRoleplayCorpusFile(filePath) {
    const segments = path.resolve(filePath).split(path.sep).map(segment => segment.toLowerCase());
    return segments.includes('roleplays');
}

function scanFiles(files) {
    const variants = new Map();
    const sizeBands = { '<100KB': 0, '100-500KB': 0, '>=500KB': 0 };
    let structuredProjectFiles = 0;

    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        const result = inspectHtml(source);
        const signature = structureSignature(result);
        variants.set(signature, (variants.get(signature) || 0) + 1);
        if (result.hasStructuredProjectData) structuredProjectFiles += 1;

        const size = fs.statSync(file).size;
        if (size < 100 * 1024) sizeBands['<100KB'] += 1;
        else if (size < 500 * 1024) sizeBands['100-500KB'] += 1;
        else sizeBands['>=500KB'] += 1;
    }

    return {
        files: files.length,
        structuredProjectFiles,
        variants: [...variants.entries()]
            .map(([signature, count]) => ({ signature, count }))
            .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature)),
        sizeBands
    };
}

function scanFixtures() {
    const manifestPath = path.join(FIXTURE_ROOT, 'fixture-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const results = manifest.fixtures.map(fixture => {
        const fixturePath = path.join(FIXTURE_ROOT, fixture.file);
        return {
            file: fixture.file,
            actual: inspectHtml(fs.readFileSync(fixturePath, 'utf8')),
            expected: fixture.expected
        };
    });
    return { manifest, results };
}

function scanCorpus(corpusRoot = DEFAULT_CORPUS_ROOT) {
    const files = listHtmlFiles(corpusRoot).filter(isRoleplayCorpusFile);
    return scanFiles(files);
}

function formatReport(fixtures, corpus) {
    const lines = [
        'RP Archiver compatibility audit (read-only)',
        `Synthetic fixtures: ${fixtures.results.length}`,
        `Corpus HTML files: ${corpus.files}`,
        `Corpus files with structured project data: ${corpus.structuredProjectFiles}`,
        '',
        'Corpus structure variants:'
    ];

    for (const variant of corpus.variants) lines.push(`  ${variant.count}  ${variant.signature}`);
    lines.push('', 'Corpus size bands:');
    for (const [band, count] of Object.entries(corpus.sizeBands)) lines.push(`  ${band}: ${count}`);
    return lines.join('\n');
}

if (require.main === module) {
    const fixtures = scanFixtures();
    const corpus = scanCorpus();
    const useJson = process.argv.includes('--json');
    process.stdout.write(useJson
        ? `${JSON.stringify({ fixtures, corpus }, null, 2)}\n`
        : `${formatReport(fixtures, corpus)}\n`);
}

module.exports = {
    FIXTURE_ROOT,
    PROJECT_ROOT,
    extractTemplateId,
    inspectHtml,
    listHtmlFiles,
    scanCorpus,
    scanFiles,
    scanFixtures,
    structureSignature
};
