import { ref } from 'vue';
import type { UI_Message } from '../types/message';
import { LONGFORM_STRESS_TEXT } from './longformStressFixture';

const DEMO_LONGFORM_STRESS_STORAGE_KEY = 'demo.longform.stress';

function shouldUseLongformStress(): boolean {
  try {
    return (
      window.localStorage.getItem('demo.longform.stress') === '1' ||
      window.localStorage.getItem(DEMO_LONGFORM_STRESS_STORAGE_KEY) === '1'
    );
  } catch {
    return false;
  }
}

function buildLongformStressMessages(): UI_Message[] {
  return [
    {
      id: 'stress-user',
      role: 'user',
      content: '继续推进剧情，把当前楼层内的变化、人物状态和环境细节完整写出来。',
      timestamp: Date.now() - 1000,
    },
    {
      id: 'stress-assistant',
      role: 'assistant',
      content: LONGFORM_STRESS_TEXT,
      timestamp: Date.now(),
    },
  ];
}

export class TranscriptManager {
  private messages = ref<UI_Message[]>([]);
  private streamingMessageId = ref<number | null>(null);
  private unsubscribe: (() => void) | null = null;

  async loadChatMessages() {
    if (shouldUseLongformStress()) {
      this.messages.value = buildLongformStressMessages();
      return;
    }

    const lastId = getLastMessageId();
    if (lastId <= 0) {
      this.messages.value = [];
      return;
    }

    const chatMessages = getChatMessages(`1-${lastId}`, {
      include_swipes: false
    });

    this.messages.value = chatMessages.map(msg => ({
      id: `msg-${msg.message_id}`,
      role: msg.role === 'user' ? 'user' : msg.role === 'system' ? 'system' : 'assistant',
      content: msg.mes || '',
      timestamp: msg.send_date || Date.now(),
      mesId: msg.message_id,
    }));

    if (this.messages.value.length === 0 && shouldUseLongformStress()) {
      this.messages.value = buildLongformStressMessages();
    }
  }

  setupNewMessageListener() {
    if (shouldUseLongformStress()) return;

    eventOn(tavern_events.MESSAGE_RECEIVED, async (messageId: number) => {
      if (this.streamingMessageId.value === messageId) return;
      
      const msg = getChatMessages([messageId], { include_swipes: false })[0];
      if (msg) {
        const existingIndex = this.messages.value.findIndex(m => m.mesId === messageId);
        if (existingIndex === -1) {
          this.messages.value.push({
            id: `msg-${msg.message_id}`,
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.mes || '',
            timestamp: msg.send_date || Date.now(),
            mesId: msg.message_id,
          });
        }
      }
    });
  }

  setupStreamingListener() {
    if (shouldUseLongformStress()) return;

    eventOn(tavern_events.MESSAGE_UPDATED, (messageId: number) => {
      const index = this.messages.value.findIndex(m => m.mesId === messageId);
      if (index !== -1) {
        const msg = getChatMessages([messageId])[0];
        if (msg) {
          this.messages.value[index] = {
            ...this.messages.value[index],
            content: msg.mes || '',
            isStreaming: false,
          };
        }
      }
    });

    eventOn(tavern_events.MESSAGE_SWIPED, (messageId: number) => {
      this.loadChatMessages();
    });
  }

  startStreaming(messageId: number) {
    this.streamingMessageId.value = messageId;
    const index = this.messages.value.findIndex(m => m.mesId === messageId);
    if (index !== -1) {
      this.messages.value[index] = {
        ...this.messages.value[index],
        isStreaming: true,
      };
    }
  }

  updateStreamingContent(messageId: number, content: string) {
    const index = this.messages.value.findIndex(m => m.mesId === messageId);
    if (index !== -1) {
      this.messages.value[index] = {
        ...this.messages.value[index],
        content,
      };
    }
  }

  stopStreaming(messageId: number) {
    this.streamingMessageId.value = null;
    const index = this.messages.value.findIndex(m => m.mesId === messageId);
    if (index !== -1) {
      this.messages.value[index] = {
        ...this.messages.value[index],
        isStreaming: false,
      };
    }
  }

  getMessages() {
    return this.messages;
  }

  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }
}

export const transcriptManager = new TranscriptManager();
