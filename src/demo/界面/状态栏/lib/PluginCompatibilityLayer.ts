import { ref } from 'vue';

export interface GeneratedImage {
  id: string;
  requestId: string;
  imageData: string;
  mesId: number;
  timestamp: number;
  prompt: string;
}

interface ImageCacheEntry {
  id: string;
  requestId: string;
  imageData: string;
  mesId: number;
  timestamp: number;
  prompt: string;
}

export class PluginCompatibilityLayer {
  private processedIds = new Set<string>();
  private images = ref<GeneratedImage[]>([]);
  private isInitialized = false;

  async initialize() {
    if (this.isInitialized) return;
    
    this.setupImageResponseListener();
    
    this.isInitialized = true;
  }

  private setupImageResponseListener() {
    eventOn('generate-image-response' as any, (response: any) => {
      if (this.processedIds.has(response.id)) return;
      
      this.processedIds.add(response.id);
      
      const imageRef: ImageCacheEntry = {
        id: this.generateUniqueId(),
        requestId: response.id,
        imageData: response.imageData,
        mesId: getCurrentMessageId(),
        timestamp: Date.now(),
        prompt: response.prompt || '',
      };

      this.images.value.push(imageRef);
    });
  }

  private generateUniqueId(): string {
    return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getImages() {
    return this.images;
  }

  getImageByRequestId(requestId: string): GeneratedImage | undefined {
    return this.images.value.find(img => img.requestId === requestId);
  }

  async sendGenerateRequest(prompt: string, options?: {
    width?: number;
    height?: number;
    negativePrompt?: string;
  }): Promise<string> {
    const requestId = this.generateUniqueId();
    
    const requestData = {
      id: requestId,
      prompt,
      width: options?.width || 512,
      height: options?.height || 512,
      ...(options?.negativePrompt && { negative_prompt: options.negativePrompt }),
    };

    await eventEmit('generate-image-request', requestData);
    return requestId;
  }
}

export const pluginCompatibilityLayer = new PluginCompatibilityLayer();
