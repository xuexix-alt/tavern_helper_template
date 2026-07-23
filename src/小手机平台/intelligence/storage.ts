import type { PersonProfile, SmartTask } from './profileTypes';

/**
 * 档案存储接口
 */
export interface ProfileStore {
  /** 保存或更新人员档案 */
  saveProfile(sessionKey: string, profile: PersonProfile): Promise<void>;
  /** 获取人员档案 */
  getProfile(sessionKey: string, personId: string): Promise<PersonProfile | null>;
  /** 列出所有档案 */
  listProfiles(sessionKey: string): Promise<PersonProfile[]>;
  /** 删除档案 */
  deleteProfile(sessionKey: string, personId: string): Promise<void>;
}

/**
 * 任务存储接口
 */
export interface TaskStore {
  /** 保存任务 */
  saveTask(sessionKey: string, task: SmartTask): Promise<void>;
  /** 获取任务 */
  getTask(sessionKey: string, taskId: string): Promise<SmartTask | null>;
  /** 列出所有任务 */
  listTasks(sessionKey: string): Promise<SmartTask[]>;
  /** 删除任务 */
  deleteTask(sessionKey: string, taskId: string): Promise<void>;
  /** 清理过期任务（超过指定时间） */
  cleanExpiredTasks(sessionKey: string, expiryMs: number): Promise<void>;
}

/**
 * 基于内存的档案存储（简单实现）
 */
export class MemoryProfileStore implements ProfileStore {
  private readonly profiles = new Map<string, Map<string, PersonProfile>>();

  private getSessionStore(sessionKey: string): Map<string, PersonProfile> {
    let store = this.profiles.get(sessionKey);
    if (!store) {
      store = new Map();
      this.profiles.set(sessionKey, store);
    }
    return store;
  }

  async saveProfile(sessionKey: string, profile: PersonProfile): Promise<void> {
    const store = this.getSessionStore(sessionKey);
    store.set(profile.id, { ...profile });
  }

  async getProfile(sessionKey: string, personId: string): Promise<PersonProfile | null> {
    const store = this.getSessionStore(sessionKey);
    const profile = store.get(personId);
    return profile ? { ...profile } : null;
  }

  async listProfiles(sessionKey: string): Promise<PersonProfile[]> {
    const store = this.getSessionStore(sessionKey);
    return Array.from(store.values()).map(p => ({ ...p }));
  }

  async deleteProfile(sessionKey: string, personId: string): Promise<void> {
    const store = this.getSessionStore(sessionKey);
    store.delete(personId);
  }

  /** 清理指定 session 的所有数据 */
  clearSession(sessionKey: string): void {
    this.profiles.delete(sessionKey);
  }
}

/**
 * 基于内存的任务存储（简单实现）
 */
export class MemoryTaskStore implements TaskStore {
  private readonly tasks = new Map<string, Map<string, SmartTask>>();

  private getSessionStore(sessionKey: string): Map<string, SmartTask> {
    let store = this.tasks.get(sessionKey);
    if (!store) {
      store = new Map();
      this.tasks.set(sessionKey, store);
    }
    return store;
  }

  async saveTask(sessionKey: string, task: SmartTask): Promise<void> {
    const store = this.getSessionStore(sessionKey);
    store.set(task.id, { ...task });
  }

  async getTask(sessionKey: string, taskId: string): Promise<SmartTask | null> {
    const store = this.getSessionStore(sessionKey);
    const task = store.get(taskId);
    return task ? { ...task } : null;
  }

  async listTasks(sessionKey: string): Promise<SmartTask[]> {
    const store = this.getSessionStore(sessionKey);
    return Array.from(store.values())
      .map(t => ({ ...t }))
      .sort((a, b) => {
        // 优先级排序: high > medium > low
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        // 相同优先级按创建时间倒序
        return b.createdAt - a.createdAt;
      });
  }

  async deleteTask(sessionKey: string, taskId: string): Promise<void> {
    const store = this.getSessionStore(sessionKey);
    store.delete(taskId);
  }

  async cleanExpiredTasks(sessionKey: string, expiryMs: number): Promise<void> {
    const store = this.getSessionStore(sessionKey);
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [id, task] of store) {
      if (now - task.createdAt > expiryMs) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      store.delete(id);
    }
  }

  /** 清理指定 session 的所有数据 */
  clearSession(sessionKey: string): void {
    this.tasks.delete(sessionKey);
  }
}

/**
 * 基于 PhoneDb 的档案存储（持久化实现）
 */
export class PhoneDbProfileStore implements ProfileStore {
  constructor(private readonly db: { putRecord: any; listRecords: any }) {}

  async saveProfile(sessionKey: string, profile: PersonProfile): Promise<void> {
    await this.db.putRecord('contactPrefs', {
      id: `profile:${profile.id}`,
      sessionKey,
      profileData: profile,
    });
  }

  async getProfile(sessionKey: string, personId: string): Promise<PersonProfile | null> {
    const records = await this.db.listRecords('contactPrefs', sessionKey);
    const record = records.find((r: any) => r.id === `profile:${personId}`);
    return record?.profileData || null;
  }

  async listProfiles(sessionKey: string): Promise<PersonProfile[]> {
    const records = await this.db.listRecords('contactPrefs', sessionKey);
    return records.filter((r: any) => r.id.startsWith('profile:')).map((r: any) => r.profileData);
  }

  async deleteProfile(sessionKey: string, personId: string): Promise<void> {
    // PhoneDb 没有 delete 方法，暂时不实现
    throw new Error('PhoneDbProfileStore does not support deletion');
  }
}

/**
 * 基于 PhoneDb 的任务存储（持久化实现）
 */
export class PhoneDbTaskStore implements TaskStore {
  constructor(private readonly db: { putRecord: any; listRecords: any }) {}

  async saveTask(sessionKey: string, task: SmartTask): Promise<void> {
    await this.db.putRecord('proactiveJobs', {
      id: task.id,
      sessionKey,
      taskData: task,
    });
  }

  async getTask(sessionKey: string, taskId: string): Promise<SmartTask | null> {
    const records = await this.db.listRecords('proactiveJobs', sessionKey);
    const record = records.find((r: any) => r.id === taskId);
    return record?.taskData || null;
  }

  async listTasks(sessionKey: string): Promise<SmartTask[]> {
    const records = await this.db.listRecords('proactiveJobs', sessionKey);
    return records
      .filter((r: any) => r.taskData)
      .map((r: any) => r.taskData)
      .sort((a: SmartTask, b: SmartTask) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.createdAt - a.createdAt;
      });
  }

  async deleteTask(sessionKey: string, taskId: string): Promise<void> {
    // PhoneDb 没有 delete 方法，暂时不实现
    throw new Error('PhoneDbTaskStore does not support deletion');
  }

  async cleanExpiredTasks(sessionKey: string, expiryMs: number): Promise<void> {
    // PhoneDb 没有批量删除，暂时不实现
    console.warn('[PhoneDbTaskStore] cleanExpiredTasks not implemented');
  }
}
