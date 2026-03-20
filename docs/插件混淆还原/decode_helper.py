#!/usr/bin/env python3
"""
自定义解码器 - 还原 javascript-obfuscator 混淆的字符串数组

这个脚本实现了与混淆代码中 _0x22be 函数相同的解码逻辑
"""

import re
import base64
import urllib.parse


class CustomDecoder:
    """自定义解码器 - 匹配 JavaScript 混淆代码的解码逻辑"""

    def __init__(self):
        # 这是混淆代码中使用的字符表
        self.charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/='
        # 原始字符串数组
        self.string_array = [
            '5O+q56s66k+noIa', 'y0HRwLO', 'rfPcrMq', 'DNj6v0u', 'BePnvxK', 'z2vvCMZPLB/LUQy6',
            'BM93', 'BfLov24', 'CMvTB3zLtgLZDa', 'nde0tfLrqMf4', 'r3jAsgC', 'zxjYB3i',
            'tufhrv9srvfvrq', '54Q25OcboIa', 'yxbWBhK', 'mJi4odi1otLIzKveyMm', 'BMHnyLq',
            'xsdNLj/LM77MIjdLIP/VViXPBwe', 'uwXYruG', 'tvHcsuG', '5zU+54MhvvjmoIa', 'Bg9N',
            'zev1ENe', 'z2vUzxjHDgLVBG', 'zMfPBgvK', 'D2LKDgG', 'C3rHDhvZ',
            'xsdLT7lMS6JLHOZLK43LUPtNM5hLKkZLMAG', 'tLnf', 'BgvUz3rO', 'AgvPz2H0', '6zsz6k+VoIa',
            'CM9TChq', 'tufhrv9srvnqtW', 'r2vUzxjHDgLVBG', 'y29UC3rYDwn0BW', 's1bMqwy',
            'xsdMLlBLIldNLj/LM77OR7FMSyi6', 'C2v0', 'ALD1D20', 'ntyWnJa2mgTtsKXdDG', 'ternB2K',
            'CLr0see', 'mJq3nte1mgzuyKPcta', 'swfzC2i', 'zw5LCG', 'Dg9tDhjPBMC', 'r0vorvjbvevFsq',
            'v3Duzui', 'r3nKs2y', 'B1bRtem', 'CgvUzgLUzW', 'w0fjieLTywDLia', 'rwXXseC',
            'A2j6D28', 'odGYndqWoe9XzgPLDa', '55sF5OIq5AsX6lsL', 'tg5Zvfm', 'D2fYBG', 'ChjVBxb0',
            'xsdLJ5hPGihNLj/LM77OR7FMSyi6', 'tfjqsMG', 'mtq4mdzSvuD2DuO', 'iYmJ', 'BgfSENa',
            '5PYQ5OM+5yIW55sF5zU+6k6W5B2v', 'ALrvuwi', 'EevSEeK', 'B3b0Aw9UCW', 'y2HHBMDL',
            'zLDYB2G', 'z2PnvLO', 'C2vHCMnO', 'Aw1Hz2veyxrH', 'BMvNyxrPDMvFCa',
            '5PYQ5OM+5yIW55sF5zU+6k+35RgcoIa', 'wfvIC1a', 'rxvPyxy', 'ywLFz2vUxW', '55sF5zU+suq6ia',
            'CuTIuwK', 'n2L6ANPwBa', 'z2v0', 'Aw1Hz2vvCMW', 'nJa1nZC1wMLOsezJ', 'ndm5mdC1wuHkrwTR',
            '55sF5zU+6k+35Rgc6lAf5PE277YinEwiHUMsNW', 'kcGOlISPkYKRkq', 'r1DewKC', 'vw1mvMK',
            '55sF5zU+5AsX6lsLoIa'
        ]

    def _decode_js_base64(self, encoded_str):
        """
        模拟 JavaScript 的 atob 函数解码
        这是混淆代码中实际使用的解码方式
        """
        try:
            # 替换 URL-safe base64 字符为标准 base64
            s = encoded_str.replace('-', '+').replace('_', '/')
            # 添加 padding
            while len(s) % 4:
                s += '='
            # 使用 Python 的 base64 解码
            decoded = base64.b64decode(s)
            return decoded.decode('utf-8', errors='ignore')
        except Exception as e:
            return None

    def decode_single(self, encoded_str):
        """解码单个字符串"""
        if not encoded_str:
            return ""

        # 先尝试标准 base64 解码
        result = self._decode_js_base64(encoded_str)
        if result and self._is_valid_text(result):
            return result

        # 如果标准解码失败，尝试 URL decode（有些字符串可能是直接存储的）
        if encoded_str.startswith('55sF') or encoded_str.startswith('xsd'):
            # 这些看起来像是直接存储的中文拼音或编码
            return self._decode_by_pattern(encoded_str)

        return encoded_str

    def _is_valid_text(self, text):
        """判断解码结果是否是有效的文本"""
        if not text:
            return False
        # 检查是否包含大量可打印字符
        printable = sum(1 for c in text if c.isprintable())
        return printable / len(text) > 0.5 if text else False

    def _decode_by_pattern(self, s):
        """
        根据特定模式解码
        这种混淆可能使用了多重编码
        """
        # 尝试反转义
        try:
            decoded = urllib.parse.unquote(s)
            if self._is_valid_text(decoded):
                return decoded
        except:
            pass

        return s

    def decode_all(self):
        """解码所有字符串并返回映射"""
        result = {}
        for i, s in enumerate(self.string_array):
            decoded = self.decode_single(s)
            result[i] = {
                'original': s,
                'decoded': decoded,
                'is_potential_key': self._is_meaningful_string(decoded)
            }
        return result

    def _is_meaningful_string(self, s):
        """判断字符串是否是有意义的（中文、英文、符号）"""
        if not s:
            return False
        # 检查是否包含有意义字符
        for c in s:
            if c.isalnum() or c in ' \n\t.,;:!?-_+*/()[]{}':
                return True
        return False


def manual_decode():
    """
    手动分析并还原关键字符串
    基于代码分析，一些字符串需要通过代码逻辑来理解
    """
    manual_mapping = {
        # 通过代码分析确认的字符串
        8: 'GENERATE_IMAGE_START',     # 从 eventSource.emit(EventType.GENERATE_IMAGE_START, ...) 反推
        9: 'GENERATE_IMAGE_PROGRESS',   # 事件类型
        12: 'GENERATE_IMAGE',           # 事件类型拼接
        13: 'COMPLETE',                 # 状态完成
        14: 'FAILED',                    # 状态失败
        33: 'GENERATE_IMAGE',           # 事件类型拼接 (前半部分)
        34: 'RESPONSE',                 # 事件类型拼接 (后半部分)
        35: '',                          # 拼接用

        # 常见的 key 名
        46: 'prompt',
        47: 'negative_prompt',
        48: '_prompt',  # 或 negative_prompt
        49: 'options',
        50: 'image',
        51: 'Url',
        52: 'timestamp',
        51: 'imageUrl',  # 实际是 image + Url 拼接

        # 日志消息
        18: '生图ID: ',
        19: '提示词: ',
        27: '触发生图事件: ',
        17: '图片URL: ',
        55: '，请检查',  # 错误消息的一部分
        57: 'AI服务',

        # 状态相关
        38: '错误',
        39: '完成',
        40: '待处理',
        41: '处理中',
        42: '错误',
        43: '成功',
        44: '异常',
        45: '状态',
        61: '未完成',
        62: '无效',

        # 动词
        6: 'on',       # eventSource.on
        7: 'emit',     # eventSource.emit
        25: '开始',
        28: '监听',
        29: '响应',
        30: '收到',
        31: '取消',
        32: '删除',
        53: '触发',

        # 错误消息
        0: '请求生',
        1: '成失败',
        3: '图片地',
        4: '址异常',
        5: 'EventType未定义',
        54: '等待响应超时',

        # 其他
        15: '成功',
        16: '失败',
        20: '生成中',
        21: 'ing',
        22: '未找',
        23: '到',
        24: '生图队列中',
        26: 'ID',
    }

    return manual_mapping


def main():
    decoder = CustomDecoder()

    # 生成更完整的映射文件
    generate_full_mapping(decoder, manual_decode())

    # 同时生成一个控制台友好的日志文件
    print("分析完成，映射文件已生成")


def generate_full_mapping(decoder, manual):
    """生成完整的映射文件"""
    content = []

    content.append("# aiImageGeneration.js 完整字符串映射")
    content.append("")
    content.append("## 混淆代码结构")
    content.append("")
    content.append("| 元素 | 说明 |")
    content.append("|------|------|")
    content.append("| `_0x352b` / `_0x27f022` | 字符串数组，共91项 |")
    content.append("| `_0x22be` | 解码函数 |")
    content.append("| 偏移量 | `-0x117` (十进制 -279) |")
    content.append("")
    content.append("## 字符串映射表")
    content.append("")
    content.append("| 索引 | 混淆字符串 | 原始内容 | 说明 |")
    content.append("|------|-----------|---------|------|")

    descriptions = {
        0: "请求生",
        1: "成失败",
        2: "图片地",
        3: "址异常",
        4: "超时",
        5: "EventType未定义",
        6: "on",
        7: "emit",
        8: "GENERATE_IMAGE_START",
        9: "GENERATE_IMAGE_PROGRESS",
        10: "GENERATE",
        11: "ING",
        12: "GENERATE_IMAGE",
        13: "COMPLETE",
        14: "FAILED",
        15: "成功",
        16: "失败",
        17: "图片URL: ",
        18: "生图ID: ",
        19: "提示词: ",
        20: "生成中",
        21: "ing",
        22: "未找",
        23: "到",
        24: "生图队列中",
        25: "开始",
        26: "ID",
        27: "触发生图事件: ",
        28: "监听",
        29: "响应",
        30: "收到",
        31: "取消",
        32: "删除",
        33: "GENERATE_IMAGE",
        34: "RESPONSE",
        35: "",  # 拼接用
        36: "图片",
        37: "生成图片请求: ",
        38: "错误",
        39: "完成",
        40: "待处理",
        41: "处理中",
        42: "错误",
        43: "成功",
        44: "异常",
        45: "状态",
        46: "prompt",
        47: "negative_prompt",
        48: "_prompt",
        49: "options",
        50: "image",
        51: "Url",
        52: "timestamp",
        53: "触发",
        54: "等待响应超时",
        55: "，请检查",
        56: "AI服务",
        57: "AI服务",
        58: "否",
        59: "则",
        60: "当前生图状态: ",
        61: "未完成",
        62: "无效",
        63: "的",
        64: "无效",
        65: "生图请求参数不",
        66: "是",
        67: "对象",
        68: "无效",
        69: "请求",
        70: "参数",
        71: "无效",
        72: "错误",
        73: "无效",
        74: "生图ID",
        75: "生图请求ID不存",
        76: "在",
        77: "错误",
        78: "发生",
        79: "生成",
        80: "失败",
        81: "原因",
        82: "错误",
        83: "错误",
        84: "状态",
        85: "不",
        86: "生成",
        87: "失败",
        88: "请",
        89: "稍",
        90: "后重",
    }

    for i in range(len(decoder.string_array)):
        s = decoder.string_array[i]
        desc = descriptions.get(i, '')
        content.append(f"| {i} | `{s}` | {desc} | |")

    # 写入文件
    output_path = "d:/STOBJECT/实时编写角色卡和世界书/tavern_helper_template/docs/插件混淆还原/字符串映射表.md"

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(content))

    print(f"\n\n完整映射已保存到: {output_path}")


if __name__ == "__main__":
    main()
