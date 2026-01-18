import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';
import { Schema } from '../../schema';

const MVU_SCHEMA_VERSION = '1.2';

$(() => {
  registerMvuSchema(Schema);
  console.info(`[变量结构] 已加载 v${MVU_SCHEMA_VERSION}`);
});
