import { shopStoreMvu } from '../../../APP后台版/shared/shopStoreMvu';
import { InteractionAdapter } from '../types';

// 声明全局变量
declare const Mvu: any;
declare const waitGlobalInitialized: (name: string) => Promise<void>;
declare const injectPrompts: any;
declare const uninjectPrompts: any;

interface ShopGenerationInput {
  keyword: string;
}

interface ShopGenerationParsedData {
  jsonPatch?: any[];
  analysis?: string;
}

export class ShopGenerationAdapter implements InteractionAdapter<ShopGenerationInput, ShopGenerationParsedData> {
  async buildPrompt(input: ShopGenerationInput): Promise<string> {
    // 注入提示词以激活世界书条目
    // 这些提示词不会发送给AI，但会触发世界书的关键词扫描
    const injectionId = `shop-generation-${Date.now()}`;

    injectPrompts(
      [
        {
          id: injectionId,
          position: 'none', // 不发送给AI，仅用于激活世界书
          depth: 0,
          role: 'system',
          content: '【后台系统触发指南】[mvu_update]变量列表 [mvu_update]变量更新格式',
          should_scan: true, // 作为扫描文本激活世界书
        },
      ],
      { once: true },
    ); // 仅在下一次生成中有效

    // 返回用户搜索指令
    return `用户搜索：${input.keyword}\n\n请根据世界书规则生成店铺数据。`;
  }

  async parseResponse(rawText: string): Promise<ShopGenerationParsedData> {
    console.log('[ShopGenerationAdapter] 开始解析响应，原始文本长度:', rawText.length);
    console.log('[ShopGenerationAdapter] 原始文本前500字:', rawText.substring(0, 500));

    const startTag = '[手机界面开始]';
    const endTag = '[手机界面结束]';

    const startIndex = rawText.indexOf(startTag);
    const endIndex = rawText.indexOf(endTag);

    console.log('[ShopGenerationAdapter] 标签位置 - 开始:', startIndex, '结束:', endIndex);

    if (startIndex === -1 || endIndex === -1) {
      console.warn('[ShopGenerationAdapter] 无法找到[手机界面开始]或[手机界面结束]标签');
      console.warn('[ShopGenerationAdapter] 完整响应文本:', rawText);
      return {};
    }

    const content = rawText.substring(startIndex + startTag.length, endIndex);
    console.log('[ShopGenerationAdapter] 提取的内容长度:', content.length);
    console.log('[ShopGenerationAdapter] 提取的内容:', content);

    // 提取 json_patch
    const jsonPatchMatch = content.match(/<json_patch>([\s\S]*?)<\/json_patch>/);
    console.log('[ShopGenerationAdapter] JSON Patch 匹配结果:', jsonPatchMatch ? '找到' : '未找到');

    let jsonPatch = null;

    if (jsonPatchMatch && jsonPatchMatch[1]) {
      console.log('[ShopGenerationAdapter] JSON Patch 原始字符串:', jsonPatchMatch[1]);
      try {
        jsonPatch = JSON.parse(jsonPatchMatch[1].trim());
        console.log('[ShopGenerationAdapter] JSON Patch 解析成功:', jsonPatch);
      } catch (e) {
        console.error('[ShopGenerationAdapter] JSON Patch 解析失败', e);
        console.error('[ShopGenerationAdapter] 失败的 JSON 字符串:', jsonPatchMatch[1]);
      }
    }

    // 提取分析内容
    const analysisMatch = content.match(/<update_analysis>([\s\S]*?)<\/update_analysis>/);
    const analysis = analysisMatch ? analysisMatch[1].trim() : undefined;

    return {
      jsonPatch,
      analysis,
    };
  }

  async handleSideEffects(parsedData: ShopGenerationParsedData): Promise<void> {
    // 由 MVU 引擎根据 <json_patch> 自动写入 stat_data；这里仅在写入后拉取最新店铺并通知前端
    if (!parsedData.jsonPatch || !Array.isArray(parsedData.jsonPatch)) {
      console.warn('[ShopGenerationAdapter] 未找到有效的 JSON Patch');
      return;
    }

    // 等待 MVU 应用 patch（assistant 楼层使用 refresh:'affected' 会触发变量扫描）
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      const shops = shopStoreMvu.getShops();
      window.dispatchEvent(new CustomEvent('shop:cache:updated', { detail: { shops } }));
      (window as any).__DEMO_SHOP_DATA__ = parsedData.jsonPatch;
      console.log('[ShopGenerationAdapter] 已从 MVU 读取最新店铺并触发 UI 刷新');
    } catch (e) {
      console.error('[ShopGenerationAdapter] 读取 MVU 店铺失败', e);
    }
  }
}
