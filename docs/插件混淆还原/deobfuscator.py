#!/usr/bin/env python3
"""
JavaScript 混淆代码还原工具
用于还原 javascript-obfuscator 混淆的代码

使用方法:
    python deobfuscator.py <混淆文件.js> [输出文件.js]
"""

import re
import sys
import base64
import urllib.parse
from pathlib import Path

class JSDeobfuscator:
    """JavaScript 混淆代码还原器"""

    def __init__(self):
        self.string_array = []
        self.decoded_strings = {}
        self.variable_map = {}

    def extract_string_array(self, code: str) -> list:
        """从混淆代码中提取字符串数组"""
        # 查找 _0x352b 或类似的字符串数组
        patterns = [
            r"_0x352b\s*=\s*function\(\)\s*\{const\s+_0x27f022\s*=\s*\[([^\]]+)\]",
            r"const\s+_0x27f022\s*=\s*\[([^\]]+)\]",
            r"const\s+(\w+)\s*=\s*\[([^\]]+)\];.*?function\s*\(\)\s*\{return\s+\1",
        ]

        for pattern in patterns:
            match = re.search(pattern, code, re.DOTALL)
            if match:
                array_content = match.group(1) if match.lastindex == 1 else match.group(2)
                strings = re.findall(r"'([^']*)'", array_content)
                if strings:
                    return strings

        return []

    def decode_base64(self, encoded: str) -> str:
        """解码 base64 字符串"""
        try:
            # 先尝试标准 base64
            decoded = base64.b64decode(encoded).decode('utf-8', errors='ignore')
            return decoded
        except:
            pass

        try:
            # URL-safe base64
            encoded = encoded.replace('-', '+').replace('_', '/')
            while len(encoded) % 4:
                encoded += '='
            decoded = base64.b64decode(encoded).decode('utf-8', errors='ignore')
            return decoded
        except:
            return encoded

    def decode_string(self, encoded_str: str) -> str:
        """解码单个混淆字符串"""
        if not encoded_str:
            return ""

        decoded = self.decode_base64(encoded_str)

        # 如果解码后是乱码，尝试 URL decode
        if self.is_garbled(decoded):
            try:
                decoded = urllib.parse.unquote(encoded_str)
            except:
                pass

        return decoded

    def is_garbled(self, text: str) -> bool:
        """判断文本是否是乱码"""
        if not text:
            return True

        # 检查是否包含大量不可见字符
        visible_chars = sum(1 for c in text if c.isprintable())
        return visible_chars / len(text) < 0.5

    def extract_and_decode_strings(self, code: str) -> dict:
        """提取并解码所有字符串"""
        strings = self.extract_string_array(code)
        result = {}

        for i, s in enumerate(strings):
            decoded = self.decode_string(s)
            result[i] = {
                'original': s,
                'decoded': decoded
            }

        return result

    def analyze_decoder_function(self, code: str) -> dict:
        """分析解码函数"""
        # 提取 _0x22be 函数
        decoder_pattern = r"function\s+_0x22be\s*\([^)]+\)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}"
        match = re.search(decoder_pattern, code, re.DOTALL)

        info = {
            'has_base64': 'base64' in code.lower(),
            'has_decode_uri': 'decodeURIComponent' in code,
            'offset_calculator': None
        }

        # 查找偏移计算
        offset_pattern = r"_0x5c05e4\s*=\s*_0x5c05e4\s*-\s*\(([^)]+)\)"
        offset_match = re.search(offset_pattern, code)
        if offset_match:
            info['offset_calculator'] = offset_match.group(1)

        return info

    def deobfuscate_file(self, input_path: str, output_path: str = None) -> dict:
        """还原混淆的 JavaScript 文件"""
        with open(input_path, 'r', encoding='utf-8') as f:
            code = f.read()

        result = {
            'input_file': input_path,
            'string_count': 0,
            'decoded_strings': {},
            'analysis': {},
            'success': False
        }

        # 提取字符串数组
        strings = self.extract_string_array(code)
        result['string_count'] = len(strings)
        result['decoded_strings'] = self.extract_and_decode_strings(code)

        # 分析解码函数
        result['analysis'] = self.analyze_decoder_function(code)

        # 生成还原后的代码
        deobfuscated = self.generate_deobfuscated_code(code, strings)

        # 写入输出文件
        if output_path:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(deobfuscated)
            result['output_file'] = output_path

        result['success'] = True
        return result

    def generate_deobfuscated_code(self, original_code: str, strings: list) -> str:
        """生成还原后的代码"""
        # 这是一个简化版本，实际需要更复杂的 AST 分析
        lines = []

        lines.append("// 还原后的代码")
        lines.append(f"// 字符串数组共 {len(strings)} 项")
        lines.append("")

        # 写入字符串映射表
        lines.append("// === 字符串映射表 ===")
        lines.append("const STRING_MAP = {")
        for i, s in enumerate(strings):
            decoded = self.decode_string(s)
            # 避免字符串中的引号问题
            safe_decoded = decoded.replace('"', '\\"').replace("'", "\\'")
            lines.append(f"  {i}: \"{safe_decoded}\", // {s}")
        lines.append("};")
        lines.append("")

        # 查找导出的函数
        export_pattern = r"export\s+(?:async\s+)?function\s+(\w+)"
        exports = re.findall(export_pattern, original_code)

        lines.append("// === 导出的函数 ===")
        for func_name in exports:
            lines.append(f"// export function {func_name}")

        lines.append("")
        lines.append("// === 完整还原代码需要手动完成 ===")
        lines.append("// 由于控制流平坦化和死代码注入，完全自动还原需要:")
        lines.append("// 1. JavaScript 解析器 (如 esprima, acorn)")
        lines.append("// 2. 控制流图分析")
        lines.append("// 3. 字符串解混淆")
        lines.append("// 4. 变量名还原")
        lines.append("")
        lines.append("// 建议使用专业工具如:")
        lines.append("// - JS NICE (jsnice.org)")
        lines.append("// - SonarCube")
        lines.append("// - 手动使用 Chrome DevTools debugger")

        return "\n".join(lines)


def print_strings_mapping(strings: dict, output_file=None):
    """打印字符串映射表"""
    lines = []
    lines.append("")
    lines.append("=" * 60)
    lines.append("字符串映射表")
    lines.append("=" * 60)
    lines.append(f"{'索引':<6} {'混淆字符串':<30} {'还原后':<20}")
    lines.append("-" * 60)

    for idx, info in sorted(strings.items(), key=lambda x: x[0]):
        lines.append(f"{idx:<6} {info['original']:<30} {info['decoded']:<20}")

    content = "\n".join(lines)
    if output_file:
        with open(output_file, 'a', encoding='utf-8') as f:
            f.write(content + "\n")
    else:
        print(content)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print("\n示例:")
        print("  python deobfuscator.py aiImageGeneration.js")
        print("  python deobfuscator.py aiImageGeneration.js restored.js")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None

    if not Path(input_file).exists():
        print(f"错误: 文件不存在 - {input_file}")
        sys.exit(1)

    print(f"正在分析: {input_file}")

    deobfuscator = JSDeobfuscator()

    try:
        result = deobfuscator.deobfuscate_file(input_file, output_file)

        print(f"\n分析结果:")
        print(f"  - 字符串数量: {result['string_count']}")
        print(f"  - 分析信息: {result['analysis']}")

        if output_file:
            print(f"\n还原代码已保存到: {output_file}")

        # 打印字符串映射
        print_strings_mapping(result['decoded_strings'], output_file)

    except Exception as e:
        print(f"错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
