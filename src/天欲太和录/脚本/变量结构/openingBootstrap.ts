import _ from 'lodash';

import { RUNTIME_OPENING_CHARACTER_PATH } from '../../../寒冬末日/界面同层版/shared/runtimeOpeningPreset';
import {
  RuntimeOpeningPresetSchema,
  type RuntimeOpeningPreset,
} from '../../../寒冬末日/界面同层版/shared/runtimeOpeningPreset.schema';

export type TianyuOpeningPresetDependencies = {
  getCharacterVariables: () => Record<string, unknown>;
  replaceCharacterVariables: (variables: Record<string, unknown>) => void;
};

export function parseTianyuOpeningPreset(raw: unknown): RuntimeOpeningPreset {
  return RuntimeOpeningPresetSchema.parse(raw);
}

export function installTianyuOpeningPreset(
  preset: RuntimeOpeningPreset,
  dependencies: TianyuOpeningPresetDependencies,
): 'installed' | 'unchanged' {
  const current = dependencies.getCharacterVariables();
  const installed = _.get(current, RUNTIME_OPENING_CHARACTER_PATH);
  if (_.isEqual(installed, preset)) return 'unchanged';

  const next = _.cloneDeep(current);
  _.set(next, RUNTIME_OPENING_CHARACTER_PATH, _.cloneDeep(preset));
  dependencies.replaceCharacterVariables(next);
  return 'installed';
}
