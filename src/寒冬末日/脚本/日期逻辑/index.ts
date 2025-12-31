import _ from 'lodash';

// 解析时间字符串为分钟数 (格式: "时间段 - HH:MM")
function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const match = timeStr.match(/(\d{2}):(\d{2})/);
  if (match) {
    return parseInt(match[1]) * 60 + parseInt(match[2]);
  }
  return 0;
}

// 解析日期字符串 (格式: "末日纪元，XXXX年XX月XX日")
function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const match = dateStr.match(/(\d+)年(\d+)月(\d+)日/);
  if (match) {
    const year = parseInt(match[1]);
    const month = parseInt(match[2]) - 1; // JS month is 0-indexed
    const day = parseInt(match[3]);
    return new Date(year, month, day);
  }
  return new Date();
}

// 格式化日期
function formatDate(date: Date): string {
  return `末日纪元，${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

$(async () => {
  // @ts-ignore
  await waitGlobalInitialized('Mvu');

  // 监听变量更新结束事件
  // @ts-ignore
  Mvu.eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (new_variables, old_variables) => {
    // 1. 获取新旧时间
    const oldTimeStr = _.get(old_variables, 'stat_data.世界.时间', '');
    const newTimeStr = _.get(new_variables, 'stat_data.世界.时间', '');

    // 如果时间没变，不做处理
    if (oldTimeStr === newTimeStr) return;

    const oldMinutes = parseTimeToMinutes(oldTimeStr);
    const newMinutes = parseTimeToMinutes(newTimeStr);

    // 2. 检测是否跨越午夜 (旧时间 > 新时间，例如 23:00 -> 01:00)
    // 注意：如果时间流逝极长(超过24小时)这逻辑可能失效，但通常不会
    if (oldMinutes > newMinutes) {
      console.log('[DateLogic] Detected midnight crossing.');

      const oldDateStr = _.get(old_variables, 'stat_data.世界.日期', '');
      const newDateStr = _.get(new_variables, 'stat_data.世界.日期', '');

      // 3. 如果 AI 没有更新日期，则手动更新
      if (oldDateStr === newDateStr) {
        console.log('[DateLogic] AI did not update date, updating manually...');

        const dateObj = parseDate(oldDateStr);
        dateObj.setDate(dateObj.getDate() + 1); // 加一天

        const nextDateStr = formatDate(dateObj);

        // 更新日期
        _.set(new_variables, 'stat_data.世界.日期', nextDateStr);

        // 同时更新末日天数
        const oldDays = _.get(new_variables, 'stat_data.世界.末日天数');
        if (typeof oldDays === 'number') {
            _.set(new_variables, 'stat_data.世界.末日天数', oldDays + 1);
        }
      }
    }
  });
});
