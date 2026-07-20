function normalizeBuildPath(value) {
  return value.trim().replaceAll('\\', '/').replace(/\/+$/, '');
}

function selectBuildFiles(files, configuredPrefixes) {
  if (configuredPrefixes === undefined) return [...files];

  const prefixes = configuredPrefixes.split(';').map(normalizeBuildPath).filter(Boolean);
  if (prefixes.length === 0) {
    throw new Error('TAVERN_BUILD_PREFIXES is set but contains no valid path prefixes');
  }

  return files.filter(file => {
    const normalizedFile = normalizeBuildPath(file);
    return prefixes.some(prefix => normalizedFile === prefix || normalizedFile.startsWith(`${prefix}/`));
  });
}

module.exports = { selectBuildFiles };
