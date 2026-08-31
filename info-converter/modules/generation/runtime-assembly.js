export function assembleRuntimeFragments(fragments) {
    return fragments.filter(Boolean).join('\n');
}
