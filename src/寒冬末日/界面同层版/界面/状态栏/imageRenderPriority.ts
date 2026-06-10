type ImageRenderModeInput = {
  hasPluginNativeDom: boolean;
  hostPluginNativeDomArtifactCount?: number;
  pluginNativeCount: number;
  compatibilityCount: number;
};

export function chooseImageRenderMode(
  input: ImageRenderModeInput,
): 'plugin-native' | 'plugin-native-data' | 'compatibility' | 'none' {
  const pluginNativeCount = Math.max(0, Number(input.pluginNativeCount) || 0);
  const hostPluginNativeDomArtifactCount = Math.max(0, Number(input.hostPluginNativeDomArtifactCount) || 0);
  const compatibilityCount = Math.max(0, Number(input.compatibilityCount) || 0);

  if (input.hasPluginNativeDom && pluginNativeCount <= hostPluginNativeDomArtifactCount) return 'plugin-native';
  if (pluginNativeCount > 0) return 'plugin-native-data';
  if (compatibilityCount > 0) return 'compatibility';
  return 'none';
}
