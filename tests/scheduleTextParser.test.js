/**
 * 知行 · 课表文本解析器单元测试
 * ============================================================
 * 覆盖粘贴课表文本 → 解析课程列表的完整能力：
 *   - 三种典型格式（单行紧凑 / 多行块状 / 表格复制）
 *   - 中文数字节次、全角字符、连堂区间（第1-2节）
 *   - 表头行跳过、噪声行过滤、空输入
 *   - 降级模式（无时间锚点时只导课程名）
 *   - 课堂导入的按名去重合并逻辑（与 CGStore 联动）
 *
 * 运行：npm test（Vitest，jsdom 环境）
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { parseScheduleText } from '../js/scheduleTextParser.js';
import CGStore from '../js/store.js';

beforeEach(() => {
  localStorage.clear();
  CGStore.resetData();
  CGStore.clearDirtyCategories();
});

/** 取某门课的节次数组，便于断言 */
const periodsOf = (list, name) => {
  const c = list.find((x) => x.name === name);
  return c && c.slots[0] ? c.slots[0].periods : [];
};

/** 取某门课的星期序号 */
const weekdayOf = (list, name) => {
  const c = list.find((x) => x.name === name);
  return c && c.slots[0] ? c.slots[0].weekday : -1;
};

describe('格式一：单行紧凑', () => {
  const text = [
    '高等数学 周一第1,2节 1-16周 教三A101 张三',
    '大学英语 周三第3,4节 1-16周 教四302 李四',
    '体育 周五第5,6节 1-16周 体育馆 王五',
  ].join('\n');

  test('解析出 3 门课程且课程名正确', () => {
    const r = parseScheduleText(text);
    expect(r).toHaveLength(3);
    expect(r.map((c) => c.name)).toEqual(
      expect.arrayContaining(['高等数学', '大学英语', '体育'])
    );
  });

  test('星期序号映射正确（周一=0，周三=2，周五=4）', () => {
    const r = parseScheduleText(text);
    expect(weekdayOf(r, '高等数学')).toBe(0);
    expect(weekdayOf(r, '大学英语')).toBe(2);
    expect(weekdayOf(r, '体育')).toBe(4);
  });

  test('节次列表解析正确', () => {
    const r = parseScheduleText(text);
    expect(periodsOf(r, '高等数学')).toEqual([1, 2]);
    expect(periodsOf(r, '大学英语')).toEqual([3, 4]);
    expect(periodsOf(r, '体育')).toEqual([5, 6]);
  });

  test('周次与地点被提取', () => {
    const r = parseScheduleText(text);
    const math = r.find((c) => c.name === '高等数学');
    expect(math.weeks).toBe('1-16');
    expect(math.location).toContain('A101');
  });
});

describe('格式二：多行块状', () => {
  const text = [
    '高等数学',
    '周一 第1,2节 1-16周',
    '教三A101',
    '张三',
    '',
    '大学英语',
    '周三 第3,4节 1-16周',
    '教四302',
    '李四',
  ].join('\n');

  test('块首课程名与后续时间行正确关联', () => {
    const r = parseScheduleText(text);
    expect(r).toHaveLength(2);
    expect(r.map((c) => c.name)).toEqual(
      expect.arrayContaining(['高等数学', '大学英语'])
    );
    expect(weekdayOf(r, '高等数学')).toBe(0);
    expect(weekdayOf(r, '大学英语')).toBe(2);
  });

  test('块内教师短行不被误认为新课程', () => {
    const r = parseScheduleText(text);
    expect(r.some((c) => c.name === '张三' || c.name === '李四')).toBe(false);
  });
});

describe('格式三：表格复制（Tab 分隔）', () => {
  const text = [
    '高等数学\t周一\t第1,2节\t1-16周\t教三A101',
    '大学英语\t周三\t第3,4节\t1-16周\t教四302',
    '体育\t周五\t第5,6节\t1-16周\t体育馆',
  ].join('\n');

  test('Tab 分隔的表格内容可解析', () => {
    const r = parseScheduleText(text);
    expect(r).toHaveLength(3);
    expect(periodsOf(r, '高等数学')).toEqual([1, 2]);
  });
});

describe('节次写法兼容性', () => {
  test('中文数字：第一、二节 → [1,2]', () => {
    expect(periodsOf(parseScheduleText('高等数学 周一 第一、二节'), '高等数学')).toEqual([1, 2]);
  });

  test('中文数字：第十一节 → [11]', () => {
    expect(periodsOf(parseScheduleText('高等数学 周一 第十一节'), '高等数学')).toEqual([11]);
  });

  test('全角字符：１－２节 → [1,2]', () => {
    expect(periodsOf(parseScheduleText('高等数学 周一第１－２节'), '高等数学')).toEqual([1, 2]);
  });

  // 回归测试：早期版本的正则不认区间，会把「第1-2节」误读成只有第 2 节，
  // 导致连堂课的节次丢失一节课。修复后必须完整展开为 [1,2]。
  test('连堂区间：第1-2节 → [1,2]（回归）', () => {
    expect(periodsOf(parseScheduleText('高等数学 周一第1-2节 1-16周'), '高等数学')).toEqual([1, 2]);
  });

  test('混合列表：第1,3-5节 → [1,3,4,5]', () => {
    expect(periodsOf(parseScheduleText('高等数学 周一第1,3-5节'), '高等数学')).toEqual([1, 3, 4, 5]);
  });

  test('连堂时地点不残留节次文本', () => {
    const r = parseScheduleText('高等数学 周一第1-2节 1-16周 教三A101');
    const math = r.find((c) => c.name === '高等数学');
    expect(math.location).not.toMatch(/节/);
    expect(math.location).toContain('A101');
  });
});

describe('噪声过滤与边界', () => {
  test('表头行（多个星期词、无节次）不被当成课程', () => {
    const text = '星期一 星期二 星期三 星期四 星期五\n高等数学 周一第1,2节';
    const r = parseScheduleText(text);
    expect(r.some((c) => /星期/.test(c.name))).toBe(false);
    expect(r.some((c) => c.name === '高等数学')).toBe(true);
  });

  test('页眉「课程表」等噪声行不入库', () => {
    const r = parseScheduleText('课程表\n高等数学 周一第1,2节');
    expect(r.some((c) => c.name === '课程表')).toBe(false);
  });

  test('空字符串返回空数组', () => {
    expect(parseScheduleText('')).toEqual([]);
  });

  test('纯空白返回空数组', () => {
    expect(parseScheduleText('   \n\t  \n\n')).toEqual([]);
  });

  test('纯地点行不被当成课程名', () => {
    const r = parseScheduleText('高等数学\n周一 第1,2节\nA101');
    expect(r.some((c) => /^A101$/.test(c.name))).toBe(false);
  });
});

describe('降级模式（无时间锚点）', () => {
  const text = ['高等数学', '大学英语', '线性代数', '体育'].join('\n');

  test('提取课程名，slots 为空数组', () => {
    const r = parseScheduleText(text);
    expect(r.length).toBeGreaterThanOrEqual(3);
    expect(r.every((c) => Array.isArray(c.slots))).toBe(true);
    expect(r.every((c) => c.slots.length === 0)).toBe(true);
  });

  test('降级结果的 name 均非空', () => {
    const r = parseScheduleText(text);
    expect(r.every((c) => c.name && c.name.length > 0)).toBe(true);
  });
});

describe('同课多时段聚合', () => {
  test('同名课程的多天时段合并进 slots', () => {
    const text = [
      '高等数学 周一第1,2节 1-16周 教三A101',
      '高等数学 周三第3,4节 1-16周 教四302',
    ].join('\n');
    const r = parseScheduleText(text);
    expect(r).toHaveLength(1);
    expect(r[0].slots).toHaveLength(2);
    expect(r[0].slots.map((s) => s.weekday).sort()).toEqual([0, 2]);
  });

  test('完全重复的时段被去重', () => {
    const text = [
      '高等数学 周一第1,2节 1-16周 教三A101',
      '高等数学 周一第1,2节 1-16周 教三A101',
    ].join('\n');
    const r = parseScheduleText(text);
    expect(r).toHaveLength(1);
    expect(r[0].slots).toHaveLength(1);
  });
});

describe('教师名 vs 课程名判别', () => {
  // 回归测试：早期版本把「不含学科词表的短行」一律当教师名丢弃，
  // 导致「数据结构」（4 字、不含 学/论/设计 等词）被丢掉，
  // 它的周四时段还被错误并进了上一门「线性代数」。修复后必须独立成型。
  const text = [
    '线性代数 周二 第3-4节 1-16周 教二205',
    '数据结构',
    '周四 第五、六节 1-16周',
    '实验楼B301',
    '王老师',
  ].join('\n');

  test('无学科词表的 4 字课程名不被当教师名丢弃（回归）', () => {
    const r = parseScheduleText(text);
    expect(r.map((c) => c.name)).toContain('数据结构');
  });

  test('新课程名的时段不挂到上一门课上（回归）', () => {
    const r = parseScheduleText(text);
    const ds = r.find((c) => c.name === '数据结构');
    expect(ds).toBeTruthy();
    expect(ds.slots).toHaveLength(1);
    expect(ds.slots[0].weekday).toBe(3); // 周四
    expect(ds.slots[0].periods).toEqual([5, 6]);

    const la = r.find((c) => c.name === '线性代数');
    expect(la.slots).toHaveLength(1); // 只有周二，不含周四
    expect(la.slots[0].weekday).toBe(1);
  });

  test('含「老师」称谓的行被识别为人名并丢弃', () => {
    const r = parseScheduleText('高等数学 周一第1,2节\n王老师');
    expect(r.some((c) => c.name === '王老师')).toBe(false);
  });

  test('2~3 字纯汉字姓名行被丢弃', () => {
    const r = parseScheduleText('高等数学 周一第1,2节 1-16周\n张三\n李四');
    expect(r.some((c) => c.name === '张三' || c.name === '李四')).toBe(false);
  });

  test('含学科词的短行不会被误当人名', () => {
    const r = parseScheduleText('高等数学 周一第1,2节\n大学物理\n周三 第3,4节');
    expect(r.map((c) => c.name)).toContain('大学物理');
  });
});

describe('完整示例课表（多格式混合）', () => {
  // 与 workbench.js 里「载入示例」按钮填入的内容保持一致，
  // 确保用户点示例后能得到预期结果。
  const SAMPLE = [
    '课程表 2026-2027学年第一学期',
    '',
    '高等数学 周一第1-2节 1-16周 教三A101 张三',
    '大学英语 周三第3,4节 1-16周 教四302 李四',
    '线性代数 周二 第3-4节 1-16周 教二205',
    '数据结构',
    '周四 第五、六节 1-16周',
    '实验楼B301',
    '王老师',
    '大学物理 周五第7-8节 1-16周 教一108',
    '体育 周三第9-10节 1-16周 体育馆',
  ].join('\n');

  test('解析出 6 门课程，无噪声行混入', () => {
    const r = parseScheduleText(SAMPLE);
    expect(r).toHaveLength(6);
    expect(r.map((c) => c.name).sort()).toEqual(
      ['体育', '大学物理', '大学英语', '数据结构', '线性代数', '高等数学'].sort()
    );
  });

  test('页眉学期信息所在行不入库', () => {
    const r = parseScheduleText(SAMPLE);
    expect(r.some((c) => /学期|课程表/.test(c.name))).toBe(false);
  });

  test('每门课都解析到时段', () => {
    const r = parseScheduleText(SAMPLE);
    expect(r.every((c) => c.slots.length > 0)).toBe(true);
  });
});

describe('导入合并逻辑（与 CGStore 联动）', () => {
  test('解析结果按名去重后写入课程列表', () => {
    const list = parseScheduleText([
      '高等数学 周一第1,2节 1-16周',
      '大学英语 周三第3,4节 1-16周',
    ].join('\n'));
    expect(list).toHaveLength(2);

    const existing = {};
    CGStore.getCourses().forEach((c) => { if (c.name) existing[c.name] = true; });
    let added = 0;
    list.forEach((item) => {
      if (!item.name || existing[item.name]) return;
      CGStore.addCourse({ name: item.name, progress: 0, status: 'todo', totalChapters: 0, learnedChapters: 0 });
      existing[item.name] = true;
      added++;
    });

    expect(added).toBe(2);
    expect(CGStore.getCourses()).toHaveLength(2);
  });

  test('已存在的同名课程被跳过，不覆盖原进度', () => {
    CGStore.addCourse({ name: '高等数学', progress: 60, totalChapters: 20, learnedChapters: 12 });

    const list = parseScheduleText([
      '高等数学 周一第1,2节 1-16周',
      '大学英语 周三第3,4节 1-16周',
    ].join('\n'));

    const existing = {};
    CGStore.getCourses().forEach((c) => { if (c.name) existing[c.name] = true; });
    let added = 0, skipped = 0;
    list.forEach((item) => {
      if (!item.name || existing[item.name]) { skipped++; return; }
      CGStore.addCourse({ name: item.name, progress: 0, status: 'todo' });
      added++;
    });

    expect(added).toBe(1);
    expect(skipped).toBe(1);
    expect(CGStore.getCourses()).toHaveLength(2);

    const math = CGStore.getCourses().find((c) => c.name === '高等数学');
    expect(math.progress).toBe(60);
    expect(math.learnedChapters).toBe(12);
  });

  test('重复导入同一份课表不会产生重复课程', () => {
    const text = '高等数学 周一第1,2节 1-16周\n大学英语 周三第3,4节 1-16周';
    const importOnce = () => {
      const list = parseScheduleText(text);
      const existing = {};
      CGStore.getCourses().forEach((c) => { if (c.name) existing[c.name] = true; });
      list.forEach((item) => {
        if (!item.name || existing[item.name]) return;
        CGStore.addCourse({ name: item.name, progress: 0, status: 'todo' });
        existing[item.name] = true;
      });
    };

    importOnce();
    importOnce();
    importOnce();

    expect(CGStore.getCourses()).toHaveLength(2);
  });
});
