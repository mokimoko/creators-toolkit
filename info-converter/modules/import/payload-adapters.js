export function createLorePayloadAdapters(dependencies) {
    function migrateEmbeddedLorePayload(data, format) {
        const result = dependencies.contract.migrateLoreProject(data, {
            availableTimeSystemIds: dependencies.getAvailableTimeSystemIds()
        });
        const report = { format, ...result.report };
        dependencies.setImportResult(result.project, report);
        return dependencies.contract.toLegacyInfoData(result.project);
    }

    function parseSchemaJsonAdapter(scriptContent) {
        return migrateEmbeddedLorePayload(JSON.parse(scriptContent), 'schema-json');
    }

    function parseFullInfoDataLegacyAdapter(scriptContent) {
        let match = scriptContent.match(/var fullInfoData = (\{[\s\S]*?\});(?:\s|$)/);
        if (!match) match = scriptContent.match(/fullInfoData\s*=\s*(\{[\s\S]*?\});/);
        return match ? migrateEmbeddedLorePayload(JSON.parse(match[1]), 'legacy-fullInfoData') : null;
    }

    function parseDomLegacyAdapter(doc) {
        dependencies.extractDomProject(doc);
        dependencies.setImportResult(null, {
            format: 'legacy-dom',
            sourceVersion: 0,
            targetVersion: dependencies.contract.CURRENT_SCHEMA_VERSION,
            steps: ['dom->1'],
            defaultsUsed: [],
            warnings: ['DOM-only import cannot recover author-only data'],
            unrecoverableFields: [
                'hidden entries',
                'notes',
                'linked lorebook source data',
                'editor-only settings'
            ]
        });
    }

    function formatLoreImportReport(report) {
        if (!report) return 'Import complete';
        const details = [`Imported ${report.format}`];
        if (report.sourceVersion !== report.targetVersion) {
            details.push(`v${report.sourceVersion}→v${report.targetVersion}`);
        }
        if (report.defaultsUsed?.length) details.push(`${report.defaultsUsed.length} default block(s)`);
        if (report.warnings?.length) details.push(`${report.warnings.length} warning(s)`);
        if (report.unrecoverableFields?.length) {
            details.push(`${report.unrecoverableFields.length} unrecoverable field group(s)`);
        }
        return details.join(' · ');
    }

    return {
        formatLoreImportReport,
        parseDomLegacyAdapter,
        parseFullInfoDataLegacyAdapter,
        parseSchemaJsonAdapter
    };
}
