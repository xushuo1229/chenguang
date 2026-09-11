/**
 * 晨光自律台 · 课表文本解析器 (ES Module)
 * --------------------------------------------------------------------------
 * 【职责】
 * 把用户从教务系统课表页面「全选复制」得到的纯文本，解析成课程列表
 * （名称 + 上课时段），供 workbench 合并导入。纯函数、零依赖、本地执行，
 * 不经过后端 —— 粘贴的内容不会上传。
 *
 * 【为什么需要它？】
 * 绝大多数学校教务系统是需登录的 SPA（单页应用），服务器无法代抓；
 * 但浏览器渲染后「全选复制」出来的文本随手可得，本地解析最通用。
 *
 * 【支持的三种典型格式（启发式 best-effort）】
 *   1. 单行紧凑：  高等数学 周一第1,2节 1-16周 教三A101 张三
 *   2. 多行块状：  课程名 / 星期+节次 / 周次 / 地点、教师 分行（EAS 风格）
 *   3. 表格复制：  高等数学<Tab>周一<Tab>1-2节<Tab>1-16周<Tab>A101
 *   降级模式：    文本里完全没有时间锚点时（网格课表复制常丢失行列表头），
 *                 退化为「提取所有像课程名的行」，只导名称。
 *
 * 【容错细节】
 *   - 全角数字/标点自动规整（１－２节 → 1-2节，第三、四节 → 第三,四节）
 *   - 中文数字节次（第一、二节 → [1,2]；第十一节 → [11]）
 *   - 单周/双周标记、周次区间（1-16周、第1,3周）
 *   - 表头行（连续多个星期词、无节次）自动跳过
 *   - 已消费课程名后出现的短行（教师名）不误认为新课程
 *
 * 【对外接口】
 *   parseScheduleText(text) → [{ name, slots:[{weekday, periods[]}], weeks, location }]
 *   解析不到任何课程时返回 []。weekday: 0=周一 … 6=周日。
 * --------------------------------------------------------------------------
 */
'use strict';

/* ===== 常量配置 ===== */

/**
 * 中文数字 → 阿拉伯数字（支持 一 ~ 二十，覆盖节次/周次常见范围）
 */
var CN_NUM = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };

/**
 * 星期字 → 星期序号（0=周一 … 6=周日）
 */
var WD_NUM = { '一': 0, '二': 1, '三': 2, '四': 3, '五': 4, '六': 5, '日': 6, '天': 6 };

/**
 * 课程名中的学科特征词 —— 一个短行若含这些词，更可能是新课程名而非教师名。
 * 【为什么需要】多行块状格式里「教师名」和「课程名」都是纯汉字短行，
 * 无法完美区分；用学科词做启发式判别，能挽救大多数真实场景。
 */
var SUBJECT_HINTS = /课|学|论|实验|实践|设计|体育|英语|数学|物理|化学|生物|历史|地理|政治|音乐|美术|导论|概论|原理|基础|入门|进阶|实训|实习|答辩|讲座/;

/**
 * 教师职称/称谓词 —— 短行命中即判定为人名行（不用再猜字数）。
 * 【举例】王老师 / 李教授 / 张讲师 / 陈助教
 */
var TEACHER_HINTS = /老师|教师|教授|讲师|助教|导师|辅导员/;

/**
 * 整行噪声词 —— 降级模式（无时间锚点）下这些行不作为课程名。
 * 【举例】页眉页脚、表头、学期信息等课表页面常见杂项。
 */
var NOISE_LINE = /^(?:课表|课程表|课程名称|课程|星期|节次|教室|地点|教师|老师|姓名|学号|班级|学期|上午|下午|晚上|午休|备注|第?\d*学期|20\d{2}\s*[-—]?\s*\d{0,4}\s*(?:春|秋)?学期?|20\d{2}(?:春|秋)?)$/;

/**
 * 地点样式 —— 看起来是教室/楼栋的行或片段。
 * 【举例】A101 / 3-201 / 教三201 / 逸夫楼302 / 教学楼3栋201
 */
var RE_LOCATION = /[A-Za-z一-龥]{0,6}(?:楼|教室|实验室|实验楼|机房|场馆|馆|栋|阶梯)\s*[A-Za-z]?\d*[号]?\s*\d*|[A-Za-z]\d{2,4}|\d{1,2}-\d{2,4}/;

/* ===== 文本规整 ===== */

/**
 * normalize(s) —— 全角转半角、统一分隔符
 *
 * 【作用】把全角数字（１２３）、中文标点（，、）、区间词（至）统一成
 * 解析器认识的最简形式，降低格式噪声。
 *   １－２节 → 1-2节
 *   第三、四节 → 第三,四节
 *   1至16周 → 1-16周（仅数字上下文替换，避免误伤普通文字）
 */
function normalize(s) {
  return String(s || '')
    .replace(/[０-９]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
    .replace(/，|、/g, ',')
    .replace(/[－—―–～~]/g, '-')
    .replace(/：/g, ':')
    .replace(/　/g, ' ')
    .replace(/(\d)\s*至\s*(\d)/g, '$1-$2');
}

/**
 * cn2num(s) —— 单段中文数字 → 数字（'三'→3，'十二'→12，'二十'→20）
 * 纯数字串直接返回数字；解析不了返回 NaN。
 */
function cn2num(s) {
  var t = String(s || '').trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (/^[一二三四五六七八九]$/.test(t)) return CN_NUM[t];
  var m = /^([一二三四五六七八九]?)十([一二三四五六七八九]?)$/.exec(t);
  if (m) return (m[1] ? CN_NUM[m[1]] : 1) * 10 + (m[2] ? CN_NUM[m[2]] : 0);
  return NaN;
}

/**
 * parseNumList(str) —— 展开 "1,3-5" / "三,四" 这样的列表为 [1,3,4,5]
 * 展开失败（某段不是数字）时返回空数组。
 */
function parseNumList(str) {
  var out = [];
  var parts = String(str || '').split(',');
  for (var i = 0; i < parts.length; i++) {
    var seg = parts[i].trim();
    if (!seg) continue;
    var range = seg.split('-');
    if (range.length === 1) {
      var n = cn2num(range[0]);
      if (isNaN(n)) return [];
      out.push(n);
    } else if (range.length === 2) {
      var a = cn2num(range[0]); var b = cn2num(range[1]);
      if (isNaN(a) || isNaN(b) || b < a || b - a > 30) return []; // 防御异常区间
      for (var k = a; k <= b; k++) out.push(k);
    } else {
      return [];
    }
  }
  return out;
}

/* ===== 锚点提取 ===== */

/**
 * RE_WEEKDAY —— 星期锚点（周一/星期一/礼拜三/周3）
 * 【注意】"第1周"里的"周"不会误伤：正则要求"周/星期/礼拜"后面紧跟
 * 日字（一~日/天）或数字，而"第1周"的"周"后面是空格或行尾。
 */
var RE_WEEKDAY = /(?:星期|礼拜|周)\s*([一二三四五六日天]|\d)/;

/**
 * countWeekdays(line) —— 统计一行里的星期锚点个数
 * 【用途】≥2 个星期且无节次 → 大概率是表头行（"星期一 星期二 …"），跳过。
 */
function countWeekdays(line) {
  var re = /(?:星期|礼拜|周)\s*[一二三四五六日天\d]/g;
  var m; var n = 0;
  while ((m = re.exec(line)) !== null) n++;
  return n;
}

/**
 * 节次片段正则 —— 描述「1,2」「1-2」「1,3-5」「三,四」这类节次列表。
 * 【为什么抽成常量】extractPeriods / extractLocation / stripTimeNoise
 * 三处都要识别同一套节次写法，集中定义，避免改一处漏两处。
 * 【为什么必须支持区间】部分教务系统用「第1-2节」表示连堂。早期版本
 * 只认逗号分隔，正则会在 `1-2节` 里从 "2" 开始匹配，把连堂误读成
 * 只有第 2 节（丢节次）。加上可选的 `-N` 后与 parseNumList 的区间
 * 展开能力对齐。
 */
var RE_PERIOD_ITEM = '[0-9一二三四五六七八九十]+(?:\\s*-\\s*[0-9一二三四五六七八九十]+)?';
var RE_PERIOD_LIST = RE_PERIOD_ITEM + '(?:\\s*,\\s*' + RE_PERIOD_ITEM + ')*';
/** 节次的「抓取版」正则（带捕获组，用于 extractPeriods） */
var RE_PERIODS_CAPTURE = new RegExp('第?\\s*(' + RE_PERIOD_LIST + ')\\s*[大]?节', 'g');
/** 节次的「剥离版」正则（无捕获组，用于把节次从文本里抹掉） */
var RE_PERIODS_STRIP = new RegExp('第?\\s*(?:' + RE_PERIOD_LIST + ')\\s*[大]?节', 'g');

/**
 * extractPeriods(line) —— 提取节次列表
 * 【支持】第1,2节 / 1-2节 / 1,3-5节 / 第三,四节 / 第十一节 / 3,4,5节
 * 【返回】数字数组（如 [1,2]）；无节次返回 []
 */
function extractPeriods(line) {
  var out = [];
  var re = new RegExp(RE_PERIODS_CAPTURE.source, 'g');
  var m;
  while ((m = re.exec(line)) !== null) {
    var nums = parseNumList(m[1]);
    for (var i = 0; i < nums.length; i++) {
      if (out.indexOf(nums[i]) < 0 && nums[i] >= 1 && nums[i] <= 20) out.push(nums[i]);
    }
  }
  return out;
}

/**
 * extractWeeks(line) —— 提取周次
 * 【支持】1-16周 / 第1,3周 / 1-16周 / 单周 / 双周
 * 【返回】人类可读字符串（'1-16' / '1,3' / '单' / '双'）；无则 ''
 */
function extractWeeks(line) {
  var m = /[（(]?\s*(单|双)周\s*[)）]?/.exec(line);
  if (m) return m[1];
  m = /第?\s*(\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*)\s*周/.exec(line);
  if (m) return m[1].replace(/\s+/g, '');
  return '';
}

/**
 * extractLocation(line) —— 提取地点片段
 * 【实现】先把行内的星期/节次/周次剥干净，再找形如教室/楼栋的文本，
 * 避免「1-16周」里的 "1-16" 被误认成房间号。
 */
function extractLocation(line) {
  var cleaned = String(line || '')
    .replace(/(?:星期|礼拜|周)\s*[一二三四五六日天\d]/g, ' ')
    .replace(RE_PERIODS_STRIP, ' ')
    .replace(/第?\s*\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\s*周/g, ' ');
  var m = RE_LOCATION.exec(cleaned);
  if (!m) return '';
  var loc = m[0].trim().replace(/^[-\s]+|[-\s]+$/g, '');
  return loc.length >= 2 ? loc : '';
}

/* ===== 名称判别 ===== */

/**
 * stripTimeNoise(s) —— 剥离字符串里的时间/地点/杂项片段
 * 【用途】从候选文本里去掉"周一 第1,2节 1-16周 08:00-09:40 A101"这类
 * 非名称成分，剩下的才可能是课程名。
 */
function stripTimeNoise(s) {
  return String(s || '')
    .replace(/(?:星期|礼拜|周)\s*[一二三四五六日天\d]/g, ' ')
    .replace(RE_PERIODS_STRIP, ' ')
    .replace(/[（(]\s*(?:(?:第?\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*)|单|双)\s*周\s*[)）]/g, ' ')
    .replace(/第?\s*\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\s*周/g, ' ')
    .replace(/\d+:\d+\s*-\s*\d+:\d+/g, ' ')
    .replace(RE_LOCATION, ' ')
    .trim();
}

/**
 * looksLikeLocation(line) —— 整行是否是纯地点（"A101"/"教三-201"）
 * 【用途】多行块里地点单独成行时，不把它当课程名。
 */
function looksLikeLocation(line) {
  var t = String(line || '').trim();
  if (!t || t.length > 20) return false;
  return /^[A-Za-z一-龥\d\s\-#]+$/.test(t) && /\d/.test(t) && RE_LOCATION.test(t);
}

/**
 * looksLikeTeacherOrMeta(line, consumed) —— 短行是否更像教师名/元数据而非新课程
 *
 * 【为什么要判】多行块状格式里「教师名」和「课程名」都是纯汉字短行
 * （"张三" vs "数据结构"），仅凭字形无法区分，只能启发式判别。
 *
 * 【判据分三层，从强到弱】
 *   1. 含职称/称谓词（老师、教授、讲师…）→ 一定是人名行。
 *   2. 含学科特征词（学、论、实验、设计…）→ 更像课程名，保留。
 *   3. 都不命中时按字数分：2~3 字最像姓名（张三、李四、王五），丢弃；
 *      4~5 字更可能是没命中学科词表的课程名（如「数据结构」），保留。
 *
 * 【为什么第 3 层要这样分】早期版本把「无学科词」的短行一律当教师名，
 * 导致「数据结构」这类课名被丢弃，它的时段还会被错误挂到上一门课上
 * （实测：周四课时被并进「线性代数」）。改为按字数分后显著更稳。
 *
 * 【已知取舍】4 字以上的中文姓名（如「欧阳修文」）会被误当课程名。
 * 课表里教师名极少超过 3 字，这个方向的误判代价也明显更低 ——
 * 多出一门可手动删除的课，好过课时错挂到别的课上。
 */
function looksLikeTeacherOrMeta(line, consumed) {
  if (!consumed) return false;
  var t = String(line || '').trim();
  if (t.length < 2 || t.length > 5) return false;
  if (/[\s\d,.\-（）()]/.test(t)) return false;
  if (!/^[一-龥]+$/.test(t)) return false;
  if (TEACHER_HINTS.test(t)) return true;   // 第 1 层：明确的职称/称谓
  if (SUBJECT_HINTS.test(t)) return false;  // 第 2 层：学科词 → 课程名
  return t.length <= 3;                     // 第 3 层：2~3 字 → 人名
}

/**
 * nameFromStandaloneLine(line) —— 非时间行作为「候选课程名」的清洗
 * 【返回】清洗后的候选名；该行是纯时间/纯地点/空内容时返回 ''。
 */
function nameFromStandaloneLine(line) {
  var t = String(line || '').replace(/\t/g, ' ').trim();
  if (!t || NOISE_LINE.test(t)) return '';
  if (looksLikeLocation(t)) return '';
  var name = stripTimeNoise(t);
  if (!name) return '';
  // 只清掉周次剥离后残留的「空括号对」；正常括号（如「体育(2)」）保留原样
  name = name.replace(/[（(]\s*[)）]/g, '').trim();
  if (!name || name.length > 40) return '';
  // 多余空白收敛为单空格，并取整段（课程名可能本身带空格，如 "机器 学习 导论"）
  return name.replace(/\s+/g, ' ');
}

/**
 * nameFromTimeLine(line, anchorIndex) —— 从时间行提取课程名
 * 【策略】
 *   1. 优先取星期锚点之前的前缀（"高等数学 周一第1,2节" → "高等数学"）
 *   2. 前缀为空时，取锚点之后剥离时间/地点后的第一段非空文本
 *      （"周一 1-2节 大学英语" → "大学英语"）
 */
function nameFromTimeLine(line, anchorIndex) {
  var prefix = line.slice(0, anchorIndex);
  var name = nameFromStandaloneLine(prefix);
  if (name) return name;
  var rest = line.slice(anchorIndex);
  var stripped = stripTimeNoise(rest);
  stripped = stripped.replace(/[（(]\s*[)）]/g, '').trim();
  if (!stripped || stripped.length > 40) return '';
  // 锚点后可能混有教师名等；只取第一段，且不能是纯数字/纯字母
  var first = stripped.split(/\s+/)[0] || '';
  if (first && first.length >= 2 && !/^\d+$/.test(first)) return first;
  return '';
}

/* ===== 主解析流程 ===== */

/**
 * parseScheduleText(text) —— 解析粘贴的课表文本（对外唯一入口）
 *
 * 【流程】
 *   1. 规整文本（全角→半角），按行扫描
 *   2. 含星期锚点的行 → 时间行：解析 星期/节次/周次/地点 + 课程名
 *   3. 非时间行 → 候选课程名（块首生效；块内教师短行忽略）
 *   4. 同名课程聚合多时段为 slots[]
 *   5. 全文没有任何时间行 → 降级：收集所有像课程名的行
 *
 * 【返回】[{ name, slots:[{weekday, periods:[..]}], weeks, location }]
 *   weekday: 0=周一…6=周日；解析不到返回 []。
 */
function parseScheduleText(text) {
  var src = normalize(text);
  if (!src.trim()) return [];

  var lines = src.split(/\r?\n/);
  var entries = [];        // 成功解析的时段条目
  var nameCandidates = []; // 降级模式候选名
  var pendingName = null;  // 块内待关联的课程名
  var consumed = false;    // 本块是否已有时间行消费过课程名

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/\t/g, ' ').trim();

    // 空行 / 纯分隔线 → 块边界，重置块内状态
    if (!line || /^[-=_*·•\s]+$/.test(line)) {
      pendingName = null;
      consumed = false;
      continue;
    }

    var wdMatch = RE_WEEKDAY.exec(line);

    if (wdMatch) {
      var weekdayCount = countWeekdays(line);
      var periods = extractPeriods(line);

      // 表头行：多个星期词且无节次 → 跳过（不当课程、不重置块状态）
      if (weekdayCount >= 2 && periods.length === 0) continue;

      var weekday = WD_NUM[wdMatch[1]] !== undefined ? WD_NUM[wdMatch[1]] : (parseInt(wdMatch[1], 10) - 1);
      if (isNaN(weekday) || weekday < 0 || weekday > 6) continue;

      // 课程名：时间行自带前缀 > 锚点后文本 > 块内候选名
      var name = nameFromTimeLine(line, wdMatch.index) || pendingName;
      if (name) {
        entries.push({
          name: name,
          weekday: weekday,
          periods: periods,
          weeks: extractWeeks(line),
          location: extractLocation(line)
        });
        pendingName = name; // 后续同名时段行（无名字时）继续用
        consumed = true;
      }
      continue;
    }

    // ---- 非时间行 ----
    var cand = nameFromStandaloneLine(line);
    if (cand) {
      // 已消费过课程名的块内，短纯汉字行 ≈ 教师名 → 忽略，不覆盖课程名
      if (looksLikeTeacherOrMeta(cand, consumed)) continue;
      pendingName = cand;
      consumed = false; // 新课程名出现，重置消费标记
    }
    if (cand && nameCandidates.indexOf(cand) < 0) nameCandidates.push(cand);
  }

  // 降级模式：没有任何时间行 → 把候选课程名直接导出（无时段信息）
  if (!entries.length) {
    var fallback = [];
    for (var j = 0; j < nameCandidates.length; j++) {
      fallback.push({ name: nameCandidates[j], slots: [], weeks: '', location: '' });
    }
    return fallback;
  }

  return aggregate(entries);
}

/**
 * aggregate(entries) —— 同名条目聚合成课程
 * 同课多时段合并进 slots（同星期同节次去重）；weeks/location 取首个非空。
 */
function aggregate(entries) {
  var map = {};
  var order = [];
  entries.forEach(function (e) {
    if (!map[e.name]) {
      map[e.name] = { name: e.name, slots: [], weeks: e.weeks || '', location: e.location || '' };
      order.push(e.name);
    }
    var c = map[e.name];
    // 空节次的时段（网格课表复制丢失行头时）也保留星期信息
    var dup = c.slots.some(function (s) {
      return s.weekday === e.weekday && s.periods.join(',') === e.periods.join(',');
    });
    if (!dup) c.slots.push({ weekday: e.weekday, periods: e.periods.slice() });
    if (!c.weeks && e.weeks) c.weeks = e.weeks;
    if (!c.location && e.location) c.location = e.location;
  });
  return order.map(function (n) { return map[n]; });
}

/* ===== 导出 ===== */

export { parseScheduleText };
export default { parseScheduleText };

// 兼容非 ES Module 场景（控制台调试）
if (typeof globalThis !== 'undefined') {
  globalThis.CGParseScheduleText = parseScheduleText;
}
