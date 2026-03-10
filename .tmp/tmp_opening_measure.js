const fs = require('fs');
const YAML = require('yaml');
const worldDoc = YAML.parse(fs.readFileSync('src/寒冬末日/世界书/寒冬末日/世界观配置集.yaml', 'utf8'));
const routeDoc = YAML.parse(fs.readFileSync('src/寒冬末日/世界书/寒冬末日/主流派起始偏置表.yaml', 'utf8'));
const preset = JSON.parse(fs.readFileSync('src/流式最小Demo/shared/opening-preset.default.json', 'utf8'));
const world = (((worldDoc || {}).profiles || {})['B']) || {};
const route = (((routeDoc || {}).profiles || {})['养']) || {};
function stringifyValue(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(v => String(v ?? '').trim()).filter(Boolean).join(' / ');
  if (typeof value === 'object') return Object.entries(value).map(([k,v]) => `${k}: ${stringifyValue(v)}`).filter(Boolean).join('；');
  return String(value ?? '').trim();
}
function buildWorldModePromptBlock(worldMode) {
  if (!worldMode) return ['<world_mode_profile>', '未选择世界观档位', '</world_mode_profile>'];
  return [
    '<world_mode_profile>',
    `<id>${worldMode.id}</id>`,
    `<name>${worldMode.name}</name>`,
    `<slogan>${worldMode.slogan}</slogan>`,
    `<core_pleasure>${worldMode.core_pleasure}</core_pleasure>`,
    `<recommended_main_route>${worldMode.recommended_main_route}</recommended_main_route>`,
    '<environment>',
    ...Object.entries(worldMode.environment || {}).map(([key, value]) => `- ${key}: ${stringifyValue(value)}`),
    '</environment>',
    '<axes>',
    ...Object.entries(worldMode.axes || {}).map(([key, value]) => `- ${key}: ${stringifyValue(value)}`),
    '</axes>',
    `<environment_summary>${worldMode.environment_summary}</environment_summary>`,
    `<threat_summary>${worldMode.threat_summary}</threat_summary>`,
    `<society_summary>${worldMode.society_summary}</society_summary>`,
    `<route_hint>${worldMode.route_hint}</route_hint>`,
    '</world_mode_profile>',
  ];
}
function buildRoutePromptBlock(route) {
  if (!route) return ['<route_profile>', '未选择主流派', '</route_profile>'];
  return [
    '<route_profile>',
    `<id>${route.id}</id>`,
    `<name>${route.name}</name>`,
    `<core_fantasy>${route.core_fantasy}</core_fantasy>`,
    `<world_lens>${route.world_lens}</world_lens>`,
    '<recommended_world_modes>',
    route.recommended_world_modes?.length ? route.recommended_world_modes.map(item => `- ${item}`).join('\n') : '- 无',
    '</recommended_world_modes>',
    '<guaranteed_opening_elements>',
    route.guaranteed_opening_elements?.length ? route.guaranteed_opening_elements.map(item => `- ${item}`).join('\n') : '- 无',
    '</guaranteed_opening_elements>',
    '<starting_liabilities>',
    route.starting_liabilities?.length ? route.starting_liabilities.map(item => `- ${item}`).join('\n') : '- 无',
    '</starting_liabilities>',
    '<opening_conflict_sources>',
    route.opening_conflict_sources?.length ? route.opening_conflict_sources.map(item => `- ${item}`).join('\n') : '- 无',
    '</opening_conflict_sources>',
    '<forbidden_drift>',
    route.forbidden_drift?.length ? route.forbidden_drift.map(item => `- ${item}`).join('\n') : '- 无',
    '</forbidden_drift>',
    '</route_profile>',
  ];
}
const worldBlock = buildWorldModePromptBlock(world).join('\n');
const routeBlock = buildRoutePromptBlock(route).join('\n');
console.log(JSON.stringify({
  worldBlockChars: worldBlock.length,
  routeBlockChars: routeBlock.length,
  totalStructuredChars: worldBlock.length + routeBlock.length,
  worldEnvKeys: Object.keys(world.environment || {}).length,
  worldAxesKeys: Object.keys(world.axes || {}).length,
  routeGuaranteedCount: (route.guaranteed_opening_elements || []).length,
  routeLiabilityCount: (route.starting_liabilities || []).length,
  routeConflictCount: (route.opening_conflict_sources || []).length,
  routeForbiddenCount: (route.forbidden_drift || []).length,
  fieldCount: (preset.form_schema || []).length
}, null, 2));
