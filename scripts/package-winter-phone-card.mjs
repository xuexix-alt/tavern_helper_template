/* eslint-disable import-x/no-nodejs-modules */
import { open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CARD_KEYWORD = 'chara';
const EXPECTED_CARD_NAME = '末世寒冬 - 星穹秩序';

export const PHONE_SCRIPT_DEFINITIONS = Object.freeze([
  {
    id: '76a4249a-e849-5f5b-8bd5-a6f89b640001',
    name: '小手机-00运行时管理器',
    distPath: '小手机平台/脚本/00运行时管理器/index.js',
  },
  {
    id: '76a4249a-e849-5f5b-8bd5-a6f89b640010',
    name: '小手机-10平台服务',
    distPath: '小手机平台/脚本/10平台服务/index.js',
  },
  {
    id: '76a4249a-e849-5f5b-8bd5-a6f89b640020',
    name: '小手机-20数据与同步',
    distPath: '小手机平台/脚本/20数据与同步/index.js',
  },
  {
    id: '76a4249a-e849-5f5b-8bd5-a6f89b640030',
    name: '小手机-30AI与调度',
    distPath: '小手机平台/脚本/30AI与调度/index.js',
  },
  {
    id: '76a4249a-e849-5f5b-8bd5-a6f89b640040',
    name: '小手机-40手机外壳',
    distPath: '小手机平台/脚本/40手机外壳/index.js',
  },
  {
    id: '76a4249a-e849-5f5b-8bd5-a6f89b640050',
    name: '小手机-50通信与情报APP',
    distPath: '小手机平台/脚本/50通信与情报APP/index.js',
  },
  {
    id: '76a4249a-e849-5f5b-8bd5-a6f89b640090',
    name: '小手机-90寒冬适配器',
    distPath: '寒冬末日/脚本/小手机-90寒冬适配器/index.js',
  },
]);

let crcTable;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    crcTable[value] = crc >>> 0;
  }
  return crcTable;
}

function crc32(buffer) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function parsePng(buffer) {
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('输入文件不是有效 PNG');
  }
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length) throw new Error('PNG chunk 越界或文件不完整');
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = buffer.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
    if (actualCrc !== expectedCrc) throw new Error(`PNG ${type} chunk CRC 校验失败`);
    chunks.push({ type, data: Buffer.from(data) });
    offset = end;
    if (type === 'IEND') break;
  }
  if (chunks.at(-1)?.type !== 'IEND' || offset !== buffer.length) throw new Error('PNG 缺少 IEND 或含尾随损坏数据');
  return chunks;
}

function encodeChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const output = Buffer.allocUnsafe(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return output;
}

function textChunkParts(chunk) {
  if (chunk.type !== 'tEXt') return null;
  const separator = chunk.data.indexOf(0);
  if (separator <= 0) return null;
  return {
    keyword: chunk.data.toString('latin1', 0, separator),
    text: chunk.data.toString('latin1', separator + 1),
  };
}

function decodeCard(chunks) {
  const cardChunk = chunks.find(chunk => textChunkParts(chunk)?.keyword === CARD_KEYWORD);
  const parts = cardChunk && textChunkParts(cardChunk);
  if (!parts) throw new Error('PNG 中不存在 chara 角色卡数据');
  try {
    return JSON.parse(Buffer.from(parts.text, 'base64').toString('utf8'));
  } catch (error) {
    throw new Error('chara 数据不是有效的 base64 JSON', { cause: error });
  }
}

function encodeCardChunk(card) {
  const payload = Buffer.from(JSON.stringify(card), 'utf8').toString('base64');
  return {
    type: 'tEXt',
    data: Buffer.from(`${CARD_KEYWORD}\0${payload}`, 'latin1'),
  };
}

function encodePng(chunks) {
  return Buffer.concat([PNG_SIGNATURE, ...chunks.map(chunk => encodeChunk(chunk.type, chunk.data))]);
}

export async function readCharacterCardPng(filename) {
  return decodeCard(parsePng(await readFile(filename)));
}

function toCharacterBookEntry(entry) {
  return {
    id: entry.uid,
    keys: entry.key ?? [],
    secondary_keys: entry.keysecondary ?? [],
    comment: entry.comment ?? '',
    content: entry.content ?? '',
    constant: Boolean(entry.constant),
    selective: Boolean(entry.selective),
    insertion_order: entry.order ?? 0,
    enabled: !entry.disable,
    position: entry.position === 0 ? 'before_char' : 'after_char',
    use_regex: true,
    extensions: {
      ...(entry.extensions ?? {}),
      position: entry.position,
      exclude_recursion: entry.excludeRecursion ?? false,
      display_index: entry.displayIndex,
      probability: entry.probability ?? null,
      useProbability: entry.useProbability ?? false,
      depth: entry.depth ?? 4,
      selectiveLogic: entry.selectiveLogic ?? 0,
      outlet_name: entry.outletName ?? '',
      group: entry.group ?? '',
      group_override: entry.groupOverride ?? false,
      group_weight: entry.groupWeight ?? null,
      prevent_recursion: entry.preventRecursion ?? false,
      delay_until_recursion: entry.delayUntilRecursion ?? false,
      scan_depth: entry.scanDepth ?? null,
      match_whole_words: entry.matchWholeWords ?? null,
      use_group_scoring: entry.useGroupScoring ?? false,
      case_sensitive: entry.caseSensitive ?? null,
      automation_id: entry.automationId ?? '',
      role: entry.role ?? 0,
      vectorized: entry.vectorized ?? false,
      sticky: entry.sticky ?? null,
      cooldown: entry.cooldown ?? null,
      delay: entry.delay ?? null,
      match_persona_description: entry.matchPersonaDescription ?? false,
      match_character_description: entry.matchCharacterDescription ?? false,
      match_character_personality: entry.matchCharacterPersonality ?? false,
      match_character_depth_prompt: entry.matchCharacterDepthPrompt ?? false,
      match_scenario: entry.matchScenario ?? false,
      match_creator_notes: entry.matchCreatorNotes ?? false,
      triggers: entry.triggers ?? [],
      ignore_budget: entry.ignoreBudget ?? false,
    },
  };
}

function buildPhoneScript(definition) {
  return {
    type: 'script',
    enabled: true,
    name: definition.name,
    id: definition.id,
    content: `import\n'http://localhost:5500/dist/${definition.distPath}'`,
    info: '寒冬小手机本地构建产物；远端 CDN 发布为独立流程。',
    button: { enabled: true, buttons: [] },
    data: {},
    export_with: { data: true, button: true },
  };
}

function applyWorldbook(card, worldbook) {
  if (!worldbook || typeof worldbook !== 'object' || !worldbook.entries || typeof worldbook.entries !== 'object') {
    throw new Error('世界书 JSON 缺少 entries');
  }
  const entries = Object.values(worldbook.entries)
    .sort((left, right) => (left.displayIndex ?? left.uid ?? 0) - (right.displayIndex ?? right.uid ?? 0))
    .map(toCharacterBookEntry);
  card.data.character_book = {
    ...(card.data.character_book ?? {}),
    name: card.data.character_book?.name ?? card.data.extensions?.world ?? EXPECTED_CARD_NAME,
    entries,
  };
}

function applyPhoneScripts(card) {
  const extensions = (card.data.extensions ??= {});
  const helper = (extensions.tavern_helper ??= { scripts: [], variables: {} });
  const existingScripts = Array.isArray(helper.scripts) ? helper.scripts : [];
  const phoneIds = new Set(PHONE_SCRIPT_DEFINITIONS.map(script => script.id));
  helper.scripts = [
    ...existingScripts.filter(script => !phoneIds.has(script?.id)),
    ...PHONE_SCRIPT_DEFINITIONS.map(buildPhoneScript),
  ];
  helper.variables ??= {};
}

function validatePackagedCard(card) {
  if (card?.data?.name !== EXPECTED_CARD_NAME) {
    throw new Error(`角色卡名称必须精确为 ${EXPECTED_CARD_NAME}`);
  }
  const entries = card.data.character_book?.entries;
  if (!Array.isArray(entries) || !entries.some(entry => entry.comment === '变量列表' && entry.content.includes('通讯网络'))) {
    throw new Error('角色卡世界书未包含带通讯网络的变量列表');
  }
  const scripts = card.data.extensions?.tavern_helper?.scripts;
  const ids = new Set(PHONE_SCRIPT_DEFINITIONS.map(script => script.id));
  const phoneScripts = Array.isArray(scripts) ? scripts.filter(script => ids.has(script?.id)) : [];
  if (phoneScripts.length !== PHONE_SCRIPT_DEFINITIONS.length || new Set(phoneScripts.map(script => script.id)).size !== ids.size) {
    throw new Error('角色卡未包含七个唯一的小手机脚本');
  }
}

async function writeAtomically(filename, buffer) {
  const tempName = path.join(path.dirname(filename), `.${path.basename(filename)}.${process.pid}.${Date.now()}.tmp`);
  let handle;
  try {
    handle = await open(tempName, 'wx');
    await handle.writeFile(buffer);
    await handle.sync();
    await handle.close();
    handle = undefined;
    const verified = await readCharacterCardPng(tempName);
    validatePackagedCard(verified);
    await rename(tempName, filename);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(tempName, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function packageWinterPhoneCard({ input, worldbook, write = false }) {
  const inputBuffer = await readFile(input);
  const chunks = parsePng(inputBuffer);
  const card = structuredClone(decodeCard(chunks));
  if (card?.data?.name !== EXPECTED_CARD_NAME) throw new Error(`拒绝打包其他角色卡：${card?.data?.name ?? '未知'}`);
  const worldbookData = JSON.parse(await readFile(worldbook, 'utf8'));
  applyWorldbook(card, worldbookData);
  applyPhoneScripts(card);
  validatePackagedCard(card);

  const cardChunk = encodeCardChunk(card);
  const nextChunks = chunks.map(chunk => (textChunkParts(chunk)?.keyword === CARD_KEYWORD ? cardChunk : chunk));
  const output = encodePng(nextChunks);
  if (write) await writeAtomically(input, output);
  return { card, output, scriptCount: PHONE_SCRIPT_DEFINITIONS.length };
}

function parseCli(argv) {
  const values = { write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--write') values.write = true;
    else if (argument === '--input' || argument === '--worldbook') {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} 需要路径`);
      values[argument.slice(2)] = value;
      index += 1;
    } else throw new Error(`未知参数：${argument}`);
  }
  if (!values.input || !values.worldbook) throw new Error('用法：--input <png> --worldbook <json> [--write]');
  return values;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  packageWinterPhoneCard(parseCli(process.argv.slice(2)))
    .then(result => {
      console.log(
        result.output
          ? `验证通过：${result.scriptCount} 个小手机脚本；${process.argv.includes('--write') ? '已原子写入' : '未写入'}`
          : '验证通过',
      );
    })
    .catch(error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
