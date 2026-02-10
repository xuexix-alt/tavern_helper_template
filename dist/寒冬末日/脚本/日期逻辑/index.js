var __webpack_modules__ = {
  "./src/寒冬末日/脚本/日期逻辑/index.ts"(__unused_webpack_module, __webpack_exports__, __webpack_require__) {
    eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! lodash */ \"lodash\");\n/* harmony import */ var lodash__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(lodash__WEBPACK_IMPORTED_MODULE_0__);\n\n// 解析时间字符串为分钟数 (格式: \"时间段 - HH:MM\")\nfunction parseTimeToMinutes(timeStr) {\n    if (!timeStr)\n        return 0;\n    const match = timeStr.match(/(\\d{2}):(\\d{2})/);\n    if (match) {\n        return parseInt(match[1]) * 60 + parseInt(match[2]);\n    }\n    return 0;\n}\n// 解析日期字符串 (格式: \"末日纪元，XXXX年XX月XX日\")\nfunction parseDate(dateStr) {\n    if (!dateStr)\n        return new Date();\n    const match = dateStr.match(/(\\d+)年(\\d+)月(\\d+)日/);\n    if (match) {\n        const year = parseInt(match[1]);\n        const month = parseInt(match[2]) - 1; // JS month is 0-indexed\n        const day = parseInt(match[3]);\n        return new Date(year, month, day);\n    }\n    return new Date();\n}\n// 格式化日期\nfunction formatDate(date) {\n    return `末日纪元，${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;\n}\n$(async () => {\n    await waitGlobalInitialized('Mvu');\n    // 监听变量更新结束事件\n    eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (new_variables, old_variables) => {\n        // 1. 获取新旧时间\n        const oldTimeStr = lodash__WEBPACK_IMPORTED_MODULE_0___default().get(old_variables, 'stat_data.世界.时间', '');\n        const newTimeStr = lodash__WEBPACK_IMPORTED_MODULE_0___default().get(new_variables, 'stat_data.世界.时间', '');\n        // 如果时间没变，不做处理\n        if (oldTimeStr === newTimeStr)\n            return;\n        const oldMinutes = parseTimeToMinutes(oldTimeStr);\n        const newMinutes = parseTimeToMinutes(newTimeStr);\n        // 2. 检测是否跨越午夜 (旧时间 > 新时间，例如 23:00 -> 01:00)\n        // 注意：如果时间流逝极长(超过24小时)这逻辑可能失效，但通常不会\n        if (oldMinutes > newMinutes) {\n            console.log('[DateLogic] Detected midnight crossing.');\n            const oldDateStr = lodash__WEBPACK_IMPORTED_MODULE_0___default().get(old_variables, 'stat_data.世界.日期', '');\n            const newDateStr = lodash__WEBPACK_IMPORTED_MODULE_0___default().get(new_variables, 'stat_data.世界.日期', '');\n            // 3. 如果 AI 没有更新日期，则手动更新\n            if (oldDateStr === newDateStr) {\n                console.log('[DateLogic] AI did not update date, updating manually...');\n                const dateObj = parseDate(oldDateStr);\n                dateObj.setDate(dateObj.getDate() + 1); // 加一天\n                const nextDateStr = formatDate(dateObj);\n                // 更新日期\n                lodash__WEBPACK_IMPORTED_MODULE_0___default().set(new_variables, 'stat_data.世界.日期', nextDateStr);\n                // 同时更新末日天数\n                const oldDays = lodash__WEBPACK_IMPORTED_MODULE_0___default().get(new_variables, 'stat_data.世界.末日天数');\n                if (typeof oldDays === 'number') {\n                    lodash__WEBPACK_IMPORTED_MODULE_0___default().set(new_variables, 'stat_data.世界.末日天数', oldDays + 1);\n                }\n            }\n        }\n    });\n});\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiLi9zcmMv5a+S5Yas5pyr5pelL+iEmuacrC/ml6XmnJ/pgLvovpEvaW5kZXgudHMiLCJtYXBwaW5ncyI6Ijs7O0FBQXVCO0FBRXZCLGtDQUFrQztBQUNsQyxTQUFTLGtCQUFrQixDQUFDLE9BQWU7SUFDekMsSUFBSSxDQUFDLE9BQU87UUFBRSxPQUFPLENBQUMsQ0FBQztJQUN2QixNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDL0MsSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUNWLE9BQU8sUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDdEQsQ0FBQztJQUNELE9BQU8sQ0FBQyxDQUFDO0FBQ1gsQ0FBQztBQVVELG1DQUFtQztBQUNuQyxTQUFTLFNBQVMsQ0FBQyxPQUFlO0lBQ2hDLElBQUksQ0FBQyxPQUFPO1FBQUUsT0FBTyxJQUFJLElBQUksRUFBRSxDQUFDO0lBQ2hDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsb0JBQW9CLENBQUMsQ0FBQztJQUNsRCxJQUFJLEtBQUssRUFBRSxDQUFDO1FBQ1YsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2hDLE1BQU0sS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyx3QkFBd0I7UUFDOUQsTUFBTSxHQUFHLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQy9CLE9BQU8sSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNwQyxDQUFDO0lBQ0QsT0FBTyxJQUFJLElBQUksRUFBRSxDQUFDO0FBQ3BCLENBQUM7QUFFRCxRQUFRO0FBQ1IsU0FBUyxVQUFVLENBQUMsSUFBVTtJQUM1QixPQUFPLFFBQVEsSUFBSSxDQUFDLFdBQVcsRUFBRSxJQUFJLElBQUksQ0FBQyxRQUFRLEVBQUUsR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUM7QUFDaEYsQ0FBQztBQUVELENBQUMsQ0FBQyxLQUFLLElBQUksRUFBRTtJQUNYLE1BQU0scUJBQXFCLENBQUMsS0FBSyxDQUFDLENBQUM7SUFFbkMsYUFBYTtJQUNiLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLHFCQUFxQixFQUFFLENBQUMsYUFBYSxFQUFFLGFBQWEsRUFBRSxFQUFFO1FBQ3pFLFlBQVk7UUFDWixNQUFNLFVBQVUsR0FBRyxpREFBSyxDQUFDLGFBQWEsRUFBRSxpQkFBaUIsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMvRCxNQUFNLFVBQVUsR0FBRyxpREFBSyxDQUFDLGFBQWEsRUFBRSxpQkFBaUIsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUUvRCxjQUFjO1FBQ2QsSUFBSSxVQUFVLEtBQUssVUFBVTtZQUFFLE9BQU87UUFFdEMsTUFBTSxVQUFVLEdBQUcsa0JBQWtCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbEQsTUFBTSxVQUFVLEdBQUcsa0JBQWtCLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFbEQsNENBQTRDO1FBQzVDLG1DQUFtQztRQUNuQyxJQUFJLFVBQVUsR0FBRyxVQUFVLEVBQUUsQ0FBQztZQUM1QixPQUFPLENBQUMsR0FBRyxDQUFDLHlDQUF5QyxDQUFDLENBQUM7WUFFdkQsTUFBTSxVQUFVLEdBQUcsaURBQUssQ0FBQyxhQUFhLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFDL0QsTUFBTSxVQUFVLEdBQUcsaURBQUssQ0FBQyxhQUFhLEVBQUUsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFFL0Qsd0JBQXdCO1lBQ3hCLElBQUksVUFBVSxLQUFLLFVBQVUsRUFBRSxDQUFDO2dCQUM5QixPQUFPLENBQUMsR0FBRyxDQUFDLDBEQUEwRCxDQUFDLENBQUM7Z0JBRXhFLE1BQU0sT0FBTyxHQUFHLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDdEMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNO2dCQUU5QyxNQUFNLFdBQVcsR0FBRyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBRXhDLE9BQU87Z0JBQ1AsaURBQUssQ0FBQyxhQUFhLEVBQUUsaUJBQWlCLEVBQUUsV0FBVyxDQUFDLENBQUM7Z0JBRXJELFdBQVc7Z0JBQ1gsTUFBTSxPQUFPLEdBQUcsaURBQUssQ0FBQyxhQUFhLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztnQkFDMUQsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDaEMsaURBQUssQ0FBQyxhQUFhLEVBQUUsbUJBQW1CLEVBQUUsT0FBTyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUN6RCxDQUFDO1lBQ0gsQ0FBQztRQUNILENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlcyI6WyJzcmM6Ly90YXZlcm5faGVscGVyX3RlbXBsYXRlL3NyYy/lr5LlhqzmnKvml6Uv6ISa5pysL+aXpeacn+mAu+i+kS9pbmRleC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuXG4vLyDop6PmnpDml7bpl7TlrZfnrKbkuLLkuLrliIbpkp/mlbAgKOagvOW8jzogXCLml7bpl7TmrrUgLSBISDpNTVwiKVxuZnVuY3Rpb24gcGFyc2VUaW1lVG9NaW51dGVzKHRpbWVTdHI6IHN0cmluZyk6IG51bWJlciB7XG4gIGlmICghdGltZVN0cikgcmV0dXJuIDA7XG4gIGNvbnN0IG1hdGNoID0gdGltZVN0ci5tYXRjaCgvKFxcZHsyfSk6KFxcZHsyfSkvKTtcbiAgaWYgKG1hdGNoKSB7XG4gICAgcmV0dXJuIHBhcnNlSW50KG1hdGNoWzFdKSAqIDYwICsgcGFyc2VJbnQobWF0Y2hbMl0pO1xuICB9XG4gIHJldHVybiAwO1xufVxuXG5kZWNsYXJlIGNvbnN0IHdhaXRHbG9iYWxJbml0aWFsaXplZDogKG5hbWU6ICdNdnUnKSA9PiBQcm9taXNlPHZvaWQ+O1xuZGVjbGFyZSBjb25zdCBNdnU6IHtcbiAgZXZlbnRzOiB7XG4gICAgVkFSSUFCTEVfVVBEQVRFX0VOREVEOiBzdHJpbmc7XG4gIH07XG59O1xuZGVjbGFyZSBjb25zdCBldmVudE9uOiAoZXZlbnRfdHlwZTogc3RyaW5nLCBsaXN0ZW5lcjogKC4uLmFyZ3M6IGFueVtdKSA9PiB2b2lkKSA9PiB7IHN0b3A6ICgpID0+IHZvaWQgfTtcblxuLy8g6Kej5p6Q5pel5pyf5a2X56ym5LiyICjmoLzlvI86IFwi5pyr5pel57qq5YWD77yMWFhYWOW5tFhY5pyIWFjml6VcIilcbmZ1bmN0aW9uIHBhcnNlRGF0ZShkYXRlU3RyOiBzdHJpbmcpOiBEYXRlIHtcbiAgaWYgKCFkYXRlU3RyKSByZXR1cm4gbmV3IERhdGUoKTtcbiAgY29uc3QgbWF0Y2ggPSBkYXRlU3RyLm1hdGNoKC8oXFxkKynlubQoXFxkKynmnIgoXFxkKynml6UvKTtcbiAgaWYgKG1hdGNoKSB7XG4gICAgY29uc3QgeWVhciA9IHBhcnNlSW50KG1hdGNoWzFdKTtcbiAgICBjb25zdCBtb250aCA9IHBhcnNlSW50KG1hdGNoWzJdKSAtIDE7IC8vIEpTIG1vbnRoIGlzIDAtaW5kZXhlZFxuICAgIGNvbnN0IGRheSA9IHBhcnNlSW50KG1hdGNoWzNdKTtcbiAgICByZXR1cm4gbmV3IERhdGUoeWVhciwgbW9udGgsIGRheSk7XG4gIH1cbiAgcmV0dXJuIG5ldyBEYXRlKCk7XG59XG5cbi8vIOagvOW8j+WMluaXpeacn1xuZnVuY3Rpb24gZm9ybWF0RGF0ZShkYXRlOiBEYXRlKTogc3RyaW5nIHtcbiAgcmV0dXJuIGDmnKvml6XnuqrlhYPvvIwke2RhdGUuZ2V0RnVsbFllYXIoKX3lubQke2RhdGUuZ2V0TW9udGgoKSArIDF95pyIJHtkYXRlLmdldERhdGUoKX3ml6VgO1xufVxuXG4kKGFzeW5jICgpID0+IHtcbiAgYXdhaXQgd2FpdEdsb2JhbEluaXRpYWxpemVkKCdNdnUnKTtcblxuICAvLyDnm5HlkKzlj5jph4/mm7TmlrDnu5PmnZ/kuovku7ZcbiAgZXZlbnRPbihNdnUuZXZlbnRzLlZBUklBQkxFX1VQREFURV9FTkRFRCwgKG5ld192YXJpYWJsZXMsIG9sZF92YXJpYWJsZXMpID0+IHtcbiAgICAvLyAxLiDojrflj5bmlrDml6fml7bpl7RcbiAgICBjb25zdCBvbGRUaW1lU3RyID0gXy5nZXQob2xkX3ZhcmlhYmxlcywgJ3N0YXRfZGF0YS7kuJbnlYwu5pe26Ze0JywgJycpO1xuICAgIGNvbnN0IG5ld1RpbWVTdHIgPSBfLmdldChuZXdfdmFyaWFibGVzLCAnc3RhdF9kYXRhLuS4lueVjC7ml7bpl7QnLCAnJyk7XG5cbiAgICAvLyDlpoLmnpzml7bpl7TmsqHlj5jvvIzkuI3lgZrlpITnkIZcbiAgICBpZiAob2xkVGltZVN0ciA9PT0gbmV3VGltZVN0cikgcmV0dXJuO1xuXG4gICAgY29uc3Qgb2xkTWludXRlcyA9IHBhcnNlVGltZVRvTWludXRlcyhvbGRUaW1lU3RyKTtcbiAgICBjb25zdCBuZXdNaW51dGVzID0gcGFyc2VUaW1lVG9NaW51dGVzKG5ld1RpbWVTdHIpO1xuXG4gICAgLy8gMi4g5qOA5rWL5piv5ZCm6Leo6LaK5Y2I5aScICjml6fml7bpl7QgPiDmlrDml7bpl7TvvIzkvovlpoIgMjM6MDAgLT4gMDE6MDApXG4gICAgLy8g5rOo5oSP77ya5aaC5p6c5pe26Ze05rWB6YCd5p6B6ZW/KOi2hei/hzI05bCP5pe2Kei/memAu+i+keWPr+iDveWkseaViO+8jOS9humAmuW4uOS4jeS8mlxuICAgIGlmIChvbGRNaW51dGVzID4gbmV3TWludXRlcykge1xuICAgICAgY29uc29sZS5sb2coJ1tEYXRlTG9naWNdIERldGVjdGVkIG1pZG5pZ2h0IGNyb3NzaW5nLicpO1xuXG4gICAgICBjb25zdCBvbGREYXRlU3RyID0gXy5nZXQob2xkX3ZhcmlhYmxlcywgJ3N0YXRfZGF0YS7kuJbnlYwu5pel5pyfJywgJycpO1xuICAgICAgY29uc3QgbmV3RGF0ZVN0ciA9IF8uZ2V0KG5ld192YXJpYWJsZXMsICdzdGF0X2RhdGEu5LiW55WMLuaXpeacnycsICcnKTtcblxuICAgICAgLy8gMy4g5aaC5p6cIEFJIOayoeacieabtOaWsOaXpeacn++8jOWImeaJi+WKqOabtOaWsFxuICAgICAgaWYgKG9sZERhdGVTdHIgPT09IG5ld0RhdGVTdHIpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ1tEYXRlTG9naWNdIEFJIGRpZCBub3QgdXBkYXRlIGRhdGUsIHVwZGF0aW5nIG1hbnVhbGx5Li4uJyk7XG5cbiAgICAgICAgY29uc3QgZGF0ZU9iaiA9IHBhcnNlRGF0ZShvbGREYXRlU3RyKTtcbiAgICAgICAgZGF0ZU9iai5zZXREYXRlKGRhdGVPYmouZ2V0RGF0ZSgpICsgMSk7IC8vIOWKoOS4gOWkqVxuXG4gICAgICAgIGNvbnN0IG5leHREYXRlU3RyID0gZm9ybWF0RGF0ZShkYXRlT2JqKTtcblxuICAgICAgICAvLyDmm7TmlrDml6XmnJ9cbiAgICAgICAgXy5zZXQobmV3X3ZhcmlhYmxlcywgJ3N0YXRfZGF0YS7kuJbnlYwu5pel5pyfJywgbmV4dERhdGVTdHIpO1xuXG4gICAgICAgIC8vIOWQjOaXtuabtOaWsOacq+aXpeWkqeaVsFxuICAgICAgICBjb25zdCBvbGREYXlzID0gXy5nZXQobmV3X3ZhcmlhYmxlcywgJ3N0YXRfZGF0YS7kuJbnlYwu5pyr5pel5aSp5pWwJyk7XG4gICAgICAgIGlmICh0eXBlb2Ygb2xkRGF5cyA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICBfLnNldChuZXdfdmFyaWFibGVzLCAnc3RhdF9kYXRhLuS4lueVjC7mnKvml6XlpKnmlbAnLCBvbGREYXlzICsgMSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0pO1xufSk7XG4iXSwibmFtZXMiOltdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///./src/寒冬末日/脚本/日期逻辑/index.ts\n\n}");
  },
  lodash(module) {
    module.exports = _;
  }
};

var __webpack_module_cache__ = {};

function __webpack_require__(moduleId) {
  var cachedModule = __webpack_module_cache__[moduleId];
  if (cachedModule !== undefined) {
    return cachedModule.exports;
  }
  if (__webpack_modules__[moduleId] === undefined) {
    var e = new Error("Cannot find module '" + moduleId + "'");
    e.code = "MODULE_NOT_FOUND";
    throw e;
  }
  var module = __webpack_module_cache__[moduleId] = {
    exports: {}
  };
  __webpack_modules__[moduleId](module, module.exports, __webpack_require__);
  return module.exports;
}

(() => {
  __webpack_require__.n = module => {
    var getter = module && module.__esModule ? () => module["default"] : () => module;
    __webpack_require__.d(getter, {
      a: getter
    });
    return getter;
  };
})();

(() => {
  __webpack_require__.d = (exports, definition) => {
    for (var key in definition) {
      if (__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
        Object.defineProperty(exports, key, {
          enumerable: true,
          get: definition[key]
        });
      }
    }
  };
})();

(() => {
  __webpack_require__.o = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);
})();

(() => {
  __webpack_require__.r = exports => {
    if (typeof Symbol !== "undefined" && Symbol.toStringTag) {
      Object.defineProperty(exports, Symbol.toStringTag, {
        value: "Module"
      });
    }
    Object.defineProperty(exports, "__esModule", {
      value: true
    });
  };
})();

var __webpack_exports__ = __webpack_require__("./src/寒冬末日/脚本/日期逻辑/index.ts");