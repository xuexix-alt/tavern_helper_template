import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';
import { Schema } from '../../schema';
import { ensureTianyuPrologue } from './openingBootstrap';

async function createAutomaticPrologue() {
  await waitGlobalInitialized('Mvu');
  await ensureTianyuPrologue({
    getLastMessageId,
    getMvuData: messageId => Mvu.getMvuData({ type: 'message', message_id: messageId }),
    createMessage: message => createChatMessages([message], { refresh: 'all' }),
  });
}

function scheduleAutomaticPrologue() {
  void createAutomaticPrologue().catch(error => {
    console.error('[天欲太和录] 自动序章创建失败', error);
  });
}

$(() => {
  registerMvuSchema(Schema);
  eventOn(tavern_events.CHAT_CHANGED, scheduleAutomaticPrologue);
  scheduleAutomaticPrologue();
});
