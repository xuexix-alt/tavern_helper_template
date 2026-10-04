import { registerMvuSchema } from 'https://cdn.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';
import { Schema } from '../../schema';
import openingPresetRaw from '../../opening-preset.yaml?raw';
import { installTianyuOpeningPreset, parseTianyuOpeningPreset } from './openingBootstrap';

const openingPreset = parseTianyuOpeningPreset(YAML.parse(openingPresetRaw));

$(() => {
  registerMvuSchema(Schema);
  const result = installTianyuOpeningPreset(openingPreset, {
    getCharacterVariables: () => getVariables({ type: 'character' }),
    replaceCharacterVariables: variables => replaceVariables(variables, { type: 'character' }),
  });
  console.info(`[天欲太和录] opening preset ${result}`);
});
