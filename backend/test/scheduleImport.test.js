/**
 * 知行 · 课表导入解析器单元测试
 * ============================================================
 * 覆盖：validateUrl 协议白名单/长度、parseCourses 二维表格提取、
 * <br> 教室行剔除、同名聚合、无表格/无星期列的友好报错。
 * 运行：cd backend && npm test（node --test 自动发现）
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  assertSafeRedirectUrl,
  isPrivateIp,
  parseCourses,
  validatePublicUrl,
  validateUrl
} = require('../src/services/scheduleImportService');

describe('validateUrl', () => {
  test('合法 http 链接通过', () => {
    assert.ok(validateUrl('http://jw.school.edu.cn/schedule').startsWith('http://'));
  });
  test('非法协议拒绝', () => {
    assert.throws(() => validateUrl('file:///C:/etc/passwd'), /仅支持 http\/https/);
  });
  test('非链接字符串拒绝', () => {
    assert.throws(() => validateUrl('不是链接'), /格式不正确/);
  });
  test('空值拒绝', () => {
    assert.throws(() => validateUrl(''), /请提供课表页面链接/);
  });
});

describe('parseCourses', () => {
  const scheduleHtml = `
    <html><body><table>
      <tr><th>节次</th><th>周一</th><th>周二</th><th>周三</th><th>周四</th><th>周五</th></tr>
      <tr><td>第1节</td><td>高等数学<br>教一101</td><td></td><td>线性代数</td><td></td><td>大学英语</td></tr>
      <tr><td>第2节</td><td>高等数学</td><td>计算机网络</td><td></td><td>大学英语</td><td>体育</td></tr>
    </table></body></html>`;

  test('提取课程并剔除<br>教室行', () => {
    const courses = parseCourses(scheduleHtml);
    const names = courses.map((c) => c.name);
    assert.ok(names.includes('高等数学'), '应包含高等数学');
    assert.ok(!names.includes('高等数学教一101'), '教室不应粘连进课程名');
    assert.strictEqual(names.includes('教一101'), false);
  });

  test('同名课程聚合为一个条目', () => {
    const courses = parseCourses(scheduleHtml);
    const gaoshu = courses.find((c) => c.name === '高等数学');
    assert.ok(gaoshu, '高等数学应存在');
    // 第1节(周一) 与 第2节(周一) 聚合成 2 个 slot
    assert.ok(gaoshu.slots.length >= 2, '同课多节应聚合');
    assert.strictEqual(gaoshu.slots[0].weekday, 0, '周一应映射为 weekday 0');
  });

  test('多节课聚合 slots 且无重复星期', () => {
    const courses = parseCourses(scheduleHtml);
    const yingyu = courses.find((c) => c.name === '大学英语');
    assert.ok(yingyu, '大学英语应存在');
    const weekdays = yingyu.slots.map((s) => s.weekday);
    assert.strictEqual(new Set(weekdays).size, weekdays.length, '同课同星期不重复');
  });

  test('英文表头星期映射正确（Mon=0/Tue=1/.../Fri=4）', () => {
    const enHtml = `
      <table>
        <tr><th>period</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th></tr>
        <tr><td>1</td><td>Math</td><td>OS</td><td>Linear</td><td></td><td>English</td></tr>
        <tr><td>2</td><td>Math</td><td></td><td></td><td>English</td><td>PE</td></tr>
      </table>`;
    const courses = parseCourses(enHtml);
    const math = courses.find((c) => c.name === 'Math');
    const eng = courses.find((c) => c.name === 'English');
    const pe = courses.find((c) => c.name === 'PE');
    assert.ok(math, 'Math 应存在');
    assert.ok(eng, 'English 应存在');
    assert.ok(pe, 'PE 应存在');
    assert.strictEqual(math.slots[0].weekday, 0, 'Mon 应映射为 0');
    assert.strictEqual(eng.slots[0].weekday, 4, 'Fri 应映射为 4');
    assert.strictEqual(pe.slots[0].weekday, 4, 'Fri→PE 应映射为 4');
  });

  test('无表格页面 → 友好报错', () => {
    assert.throws(() => parseCourses('<html><body><h1>无表格</h1></body></html>'), /没有找到课表表格/);
  });

  test('有表格但无星期列 → 友好报错', () => {
    assert.throws(
      () => parseCourses('<table><tr><td>甲</td><td>乙</td></tr></table>'),
      /未能识别课表里的星期列/
    );
  });
});

describe('SSRF protection', () => {
  test('localhost is rejected', async () => {
    await assert.rejects(
      () => validatePublicUrl('http://localhost:8080/schedule'),
      /内网地址/
    );
  });

  test('internal domains are rejected', async () => {
    await assert.rejects(
      () => validatePublicUrl('https://jw.school.local/schedule'),
      /内网地址/
    );
    await assert.rejects(
      () => validatePublicUrl('https://admin.internal/schedule'),
      /内网地址/
    );
  });

  test('private IPv4 literals are rejected', async () => {
    const urls = [
      'http://127.0.0.1/schedule',
      'http://10.1.2.3/schedule',
      'http://172.16.0.1/schedule',
      'http://192.168.1.1/schedule',
      'http://169.254.169.254/latest/meta-data'
    ];
    for (const url of urls) {
      await assert.rejects(() => validatePublicUrl(url), /内网地址/);
    }
  });

  test('private IPv6 and IPv4-mapped IPv6 are rejected', async () => {
    await assert.rejects(() => validatePublicUrl('http://[::1]/schedule'), /内网地址/);
    await assert.rejects(
      () => validatePublicUrl('http://[::ffff:192.168.1.1]/schedule'),
      /内网地址/
    );
    assert.strictEqual(isPrivateIp('fd00::1'), true);
    assert.strictEqual(isPrivateIp('fe80::1'), true);
  });

  test('public literal IPv4 is accepted', async () => {
    await assert.doesNotReject(() => validatePublicUrl('http://93.184.216.34/schedule'));
  });

  test('redirect targets are revalidated', async () => {
    await assert.rejects(
      () => assertSafeRedirectUrl('https://example.com/schedule', 'http://127.0.0.1/admin'),
      /内网地址/
    );
    await assert.rejects(
      () => assertSafeRedirectUrl('https://example.com/schedule', 'ftp://example.com/schedule'),
      /http\/https/
    );
  });
});
