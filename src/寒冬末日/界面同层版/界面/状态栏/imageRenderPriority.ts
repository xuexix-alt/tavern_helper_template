type ImageRenderModeInput = {
  hasPluginNativeDom: boolean;
  pluginNativeCount: number;
  compatibilityCount: number;
};

export function chooseImageRenderMode(
  input: ImageRenderModeInput,
): 'plugin-native' | 'plugin-native-data' | 'compatibility' | 'none' {
  if (input.hasPluginNativeDom) return 'plugin-native';
  if (Number(input.pluginNativeCount) > 0) return 'plugin-native-data';
  if (Number(input.compatibilityCount) > 0) return 'compatibility';
  return 'none';
}
