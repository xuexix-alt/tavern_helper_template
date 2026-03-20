#!/usr/bin/env python3
"""
JavaScript 混淆代码还原工具 v2
支持 javascript-obfuscator 生成的混淆代码

用法:
    python js_deobfuscator_v2.py <input.js> [output.js]

输出:
    - 控制台打印完整字符串映射表
    - 如果指定 output.js，生成字符串全部替换后的可读代码
"""

import re
import sys
import urllib.parse
from pathlib import Path


# ─────────────────────────────────────────────
# 核心解码算法
# 与 javascript-obfuscator 的 _0x???b 函数完全匹配
# ─────────────────────────────────────────────

def decode_obfuscated_string(encoded_str: str) -> str:
    """
    实现与混淆代码中 _0x22be / _0x539b 等函数完全相同的解码逻辑。
    算法：自定义 base64（charset 包含 '='）-> 每字节转 %XX -> decodeURIComponent
    """
    charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/='
    raw = ''
    buf = 0
    buf_len = 0

    for char in encoded_str:
        idx = charset.find(char)
        if idx == -1:
            continue
        buf = buf * 64 + idx
        buf_len += 6
        if buf_len >= 8:
            buf_len -= 8
            byte_val = (buf >> buf_len) & 0xFF
            raw += chr(byte_val)
            buf &= (1 << buf_len) - 1

    percent_encoded = ''.join('%' + format(ord(c), '02X') for c in raw)
    try:
        return urllib.parse.unquote(percent_encoded)
    except Exception:
        return raw


# ─────────────────────────────────────────────
# 字符串数组提取
# ─────────────────────────────────────────────

def extract_string_array(code: str) -> tuple[list[str], str]:
    """
    从混淆代码中提取字符串数组。
    返回 (strings, array_var_name)

    支持的模式：
      function _0xXXXX() { const _0xYYYY = ['...', '...']; ... return _0xYYYY; }
    """
    # 找到形如 ['...', '...'] 的最长数组
    # 使用贪婪匹配找字符串数组定义
    pattern = re.compile(
        r"const\s+(\w+)\s*=\s*\[((?:'[^']*'|\"[^\"]*\")(?:\s*,\s*(?:'[^']*'|\"[^\"]*\"))*)\]",
        re.DOTALL
    )

    best_match = None
    best_count = 0
    array_var = ''

    for m in pattern.finditer(code):
        items = re.findall(r"['\"]([^'\"]*)['\"]", m.group(2))
        if len(items) > best_count:
            best_count = len(items)
            best_match = items
            array_var = m.group(1)

    return (best_match or [], array_var)


# ─────────────────────────────────────────────
# 函数调用替换
# 找到所有 _0x22be(0xNN, 'KEY') 形式的调用并替换为真实字符串
# ─────────────────────────────────────────────

def find_decoder_function_name(code: str) -> str | None:
    """找到解码函数名（形如 _0x22be、_0x539b 等）"""
    # 特征：函数体内有 'abcdefghijklmnopqrstuvwxyz...+/=' 字符表
    pattern = re.compile(r"function\s+(\w+)\s*\([^)]*\)[^{]*\{[^}]*abcdefghijklmnopqrstuvwxyz[^}]*\}")
    m = pattern.search(code)
    if m:
        return m.group(1)

    # 备用：找包含 decodeURIComponent 的函数
    pattern2 = re.compile(r"(\w+)\['MVmoVC'\]|(\w+)\['TfNCho'\]|(\w+)\['zuxoAy'\]")
    m2 = pattern2.search(code)
    if m2:
        return next(g for g in m2.groups() if g)

    return None


def build_index_map(code: str, decoder_fn: str, strings: list[str]) -> dict[str, str]:
    """
    找到所有 decoder_fn(0xINDEX - OFFSET, KEY) 调用。
    由于偏移计算复杂，直接枚举所有可能的 index 值并解码。
    返回 {encoded_string: decoded_string}
    """
    result = {}
    for s in strings:
        decoded = decode_obfuscated_string(s)
        result[s] = decoded
    return result


def replace_calls_in_code(code: str, string_map: dict[str, str], strings: list[str],
                           array_var: str, decoder_fn: str | None) -> str:
    """
    在代码中替换所有解码函数调用为真实字符串字面量。

    这里采用两步策略：
    1. 直接替换数组索引访问 array_var[N] → 真实字符串
    2. 查找 decoder_fn(...) 调用 → 真实字符串（按索引）
    """
    result = code

    # 策略1: _0x27f022[N] 或 _0x24c1d5[N] → 替换
    def replace_array_access(m):
        idx = int(m.group(2))
        if 0 <= idx < len(strings):
            val = string_map.get(strings[idx], strings[idx])
            return repr(val)  # 加引号
        return m.group(0)

    result = re.sub(
        r'\b(' + re.escape(array_var) + r')\[(\d+)\]',
        replace_array_access,
        result
    )

    return result


# ─────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────

def deobfuscate(input_path: str, output_path: str | None = None, verbose: bool = True):
    code = Path(input_path).read_text(encoding='utf-8')

    # 1. 提取字符串数组
    strings, array_var = extract_string_array(code)
    if not strings:
        print("[ERROR] No string array found. Is this javascript-obfuscator code?")
        return

    # 2. 解码所有字符串
    string_map = {}
    for s in strings:
        string_map[s] = decode_obfuscated_string(s)

    # 3. 找解码函数名
    decoder_fn = find_decoder_function_name(code)

    if verbose:
        print(f"\n[OK] String array variable: {array_var}")
        print(f"[OK] Total strings: {len(strings)}")
        print(f"[OK] Decoder function: {decoder_fn or 'not found'}")
        print(f"\n{'='*72}")
        print(f"{'Index':>4}  {'Encoded':<40}  {'Decoded'}")
        print(f"{'='*72}")
        for i, s in enumerate(strings):
            decoded = string_map[s]
            print(f"{i:>4}  {s:<40}  {decoded!r}")
        print(f"{'='*72}\n")

    # 4. 生成可读代码（可选）
    if output_path:
        readable = replace_calls_in_code(code, string_map, strings, array_var, decoder_fn)

        # 追加字符串映射注释到文件头部
        header_lines = [
            "// ============================================================",
            "// 由 js_deobfuscator_v2.py 生成",
            "// 字符串数组已解码，索引访问已替换为字面量",
            "// 注意：控制流混淆（函数调用形式的解码）需手动处理",
            "// ============================================================",
            "//",
            "// 完整字符串映射表：",
        ]
        for i, s in enumerate(strings):
            decoded = string_map[s]
            header_lines.append(f"//   [{i:3d}] {s:<40} => {decoded!r}")
        header_lines.append("//")
        header_lines.append("")

        final = "\n".join(header_lines) + readable
        Path(output_path).write_text(final, encoding='utf-8')
        print(f"[OK] Readable code saved: {output_path}")

    return string_map, strings, array_var, decoder_fn


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    input_file  = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None

    if not Path(input_file).exists():
        print(f"[ERROR] File not found: {input_file}")
        sys.exit(1)

    deobfuscate(input_file, output_file)
