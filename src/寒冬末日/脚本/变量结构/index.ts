import { registerMvuSchema } from 'https://cdn.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';
import { Schema } from '../../schema';

const MVU_SCHEMA_VERSION = '1.5';

$(() => {
  registerMvuSchema(Schema);
  console.info(`[变量结构] 已加载 v${MVU_SCHEMA_VERSION}`);
});
