/**
 * 晨光自律台 · AI 助手页面 (ES Module)
 * ============================================================
 * 功能清单：
 *   1. 会话管理 — 创建/切换/删除会话，标题自动生成
 *   2. 会话搜索 — 按关键词实时搜索
 *   3. 会话筛选 — 全部/问答/规划
 *   4. 消息编辑/删除 — 编辑已发送消息，删除单条消息
 *   5. 导出对话 — 导出为 Markdown 文件
 *   6. 实时同步 — BroadcastChannel 跨标签页同步
 *   7. 移动端侧边栏 — 抽屉式滑出 + 手势关闭
 *   8. 空状态引导 + 分页加载
 *
 * 数据结构（localStorage key = 'cg_ai_chats'）：
 *   { chats: [{ id, title, type, messages: [{id, role, content, time}], createdAt }], activeId }
 * ============================================================
 */
'use strict';

import '../js/utils/dom.js';

/* ============================================================
   1. 数据层 — 会话 CRUD
   ============================================================ */
var STORAGE_KEY = 'cg_ai_chats';
var PAGE_SIZE = 20;

function loadData() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { chats: [], activeId: null };
}
function saveData(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
}

var appData = loadData();

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function getActiveChat() {
  return appData.chats.find(function (c) { return c.id === appData.activeId; }) || null;
}

function createChat(type) {
  var chat = {
    id: genId(),
    title: '新对话',
    type: type || 'chat',
    messages: [],
    createdAt: Date.now(),
  };
  appData.chats.unshift(chat);
  appData.activeId = chat.id;
  saveData(appData);
  broadcastSync('create', chat);
  return chat;
}

function deleteChat(id) {
  appData.chats = appData.chats.filter(function (c) { return c.id !== id; });
  if (appData.activeId === id) {
    appData.activeId = appData.chats.length ? appData.chats[0].id : null;
  }
  saveData(appData);
  broadcastSync('delete', { id: id });
}

/* ============================================================
   2. 标题自动生成（基于首条消息摘要）
   ============================================================ */
function generateTitle(content) {
  if (!content) return '新对话';
  var text = content.replace(/\s+/g, ' ').trim();
  // 提取关键信息
  var keywords = [];
  var patterns = [
    /(?:帮我|请|怎样|如何|什么|哪些|制定|制定一个|写一个|规划)(.{2,15})/,
    /(.{2,10})(?:计划|复习|备考|方法|技巧|建议|攻略|指南)/,
    /(?:高数|英语|数学|物理|化学|政治|考研|四级|六级|期末|论文|课程|技能|编程|Python|Java)(.{0,10})/,
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = text.match(patterns[i]);
    if (m) {
      keywords.push(m[0]);
      break;
    }
  }
  if (keywords.length === 0) {
    // 截取前 15 字作为标题
    keywords.push(text.slice(0, 15));
  }
  var title = keywords[0];
  if (title.length > 20) title = title.slice(0, 20);
  return title;
}

/* ============================================================
   3. BroadcastChannel 实时同步
   ============================================================ */
var bcChannel = null;
try {
  bcChannel = new BroadcastChannel('cg_ai_sync');
  bcChannel.onmessage = function (e) {
    var msg = e.data;
    if (msg.type === 'update') {
      appData = loadData();
      renderChatList();
      if (appData.activeId) renderMessages();
    }
  };
} catch (_) {}

function broadcastSync(action, data) {
  if (bcChannel) {
    try { bcChannel.postMessage({ type: 'update', action: action, data: data }); } catch (_) {}
  }
}

/* ============================================================
   4. DOM 引用
   ============================================================ */
var chatList = document.getElementById('chatList');
var chatMessages = document.getElementById('chatMessages');
var chatInput = document.getElementById('chatInput');
var chatSend = document.getElementById('chatSend');
var chatEmpty = document.getElementById('chatEmpty');
var chatInputArea = document.getElementById('chatInputArea');
var chatSidebar = document.getElementById('chatSidebar');
var sidebarOverlay = document.getElementById('sidebarOverlay');
var mobileMenuBtn = document.getElementById('mobileMenuBtn');
var newChatBtn = document.getElementById('newChatBtn');
var chatSearch = document.getElementById('chatSearch');
var loadMoreBtn = document.getElementById('loadMoreBtn');
var exportBtn = document.getElementById('exportBtn');
var topbarTitle = document.getElementById('topbarTitle');

/* ============================================================
   5. 侧边栏渲染 + 搜索/筛选
   ============================================================ */
var currentFilter = 'all';
var searchQuery = '';

function renderChatList() {
  var filtered = appData.chats.filter(function (c) {
    if (currentFilter !== 'all' && c.type !== currentFilter) return false;
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      if (c.title.toLowerCase().indexOf(q) === -1) return false;
    }
    return true;
  });

  chatList.innerHTML = '';
  if (filtered.length === 0) {
    chatList.innerHTML =
      '<div style="text-align:center;padding:32px 16px;color:var(--text-light);font-size:13px;">' +
        (searchQuery ? '没有找到匹配的对话' : '暂无对话，点击 + 开始') +
      '</div>';
    return;
  }

  filtered.forEach(function (chat) {
    var isActive = chat.id === appData.activeId;
    var preview = chat.messages.length > 0
      ? chat.messages[chat.messages.length - 1].content.slice(0, 30)
      : '空对话';
    var time = formatTime(chat.createdAt);
    var icon = chat.type === 'plan' ? 'fa-wand-magic-sparkles' : 'fa-comments';

    var item = document.createElement('div');
    item.className = 'chat-list-item' + (isActive ? ' active' : '');
    item.setAttribute('data-id', chat.id);
    item.innerHTML =
      '<div class="item-icon"><i class="fas ' + icon + '"></i></div>' +
      '<div class="item-info">' +
        '<div class="item-title">' + esc(chat.title) + '</div>' +
        '<div class="item-preview">' + esc(preview) + '</div>' +
      '</div>' +
      '<div class="item-time">' + time + '</div>' +
      '<button class="item-delete" data-delete="' + chat.id + '" title="删除"><i class="fas fa-trash"></i></button>';
    chatList.appendChild(item);
  });
}

function formatTime(ts) {
  var d = new Date(ts);
  var now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  return (d.getMonth() + 1) + '/' + d.getDate();
}

function esc(s) {
  var div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// 搜索
chatSearch.addEventListener('input', function () {
  searchQuery = this.value.trim();
  renderChatList();
});

// 筛选
document.querySelectorAll('.filter-tag').forEach(function (tag) {
  tag.addEventListener('click', function () {
    document.querySelectorAll('.filter-tag').forEach(function (t) { t.classList.remove('active'); });
    this.classList.add('active');
    currentFilter = this.getAttribute('data-filter');
    renderChatList();
  });
});

// 新建对话
newChatBtn.addEventListener('click', function () {
  createChat('chat');
  renderChatList();
  showChatView();
  renderMessages();
});

// 切换/删除对话
chatList.addEventListener('click', function (e) {
  // 删除按钮
  var delBtn = e.target.closest('[data-delete]');
  if (delBtn) {
    e.stopPropagation();
    var id = delBtn.getAttribute('data-delete');
    deleteChat(id);
    renderChatList();
    renderMessages();
    return;
  }
  // 切换对话
  var item = e.target.closest('.chat-list-item');
  if (item) {
    appData.activeId = item.getAttribute('data-id');
    saveData(appData);
    renderChatList();
    renderMessages();
    closeSidebar();
  }
});

/* ============================================================
   6. 移动端侧边栏（抽屉 + 手势）
   ============================================================ */
function openSidebar() {
  chatSidebar.classList.add('open');
  sidebarOverlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  chatSidebar.classList.remove('open');
  sidebarOverlay.classList.remove('show');
  document.body.style.overflow = '';
}
mobileMenuBtn.addEventListener('click', openSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

// 手势滑动关闭
var touchStartX = 0;
var touchCurrentX = 0;
chatSidebar.addEventListener('touchstart', function (e) {
  touchStartX = e.touches[0].clientX;
}, { passive: true });
chatSidebar.addEventListener('touchmove', function (e) {
  touchCurrentX = e.touches[0].clientX;
  var diff = touchCurrentX - touchStartX;
  if (diff < 0) {
    chatSidebar.style.transform = 'translateX(' + diff + 'px)';
  }
}, { passive: true });
chatSidebar.addEventListener('touchend', function () {
  var diff = touchCurrentX - touchStartX;
  if (diff < -80) {
    closeSidebar();
  }
  chatSidebar.style.transform = '';
  touchStartX = 0;
  touchCurrentX = 0;
});

/* ============================================================
   7. 消息渲染 + 分页
   ============================================================ */
var loadedCount = 0;

function showChatView() {
  chatEmpty.style.display = 'none';
  chatMessages.style.display = 'flex';
  chatInputArea.style.display = 'block';
}

function renderMessages() {
  var chat = getActiveChat();
  if (!chat || chat.messages.length === 0) {
    chatEmpty.style.display = 'flex';
    chatMessages.style.display = 'none';
    chatInputArea.style.display = 'none';
    topbarTitle.textContent = 'AI 学习助手';
    return;
  }

  showChatView();
  topbarTitle.textContent = chat.title;

  // 分页：先显示最近 PAGE_SIZE 条
  var msgs = chat.messages;
  loadedCount = Math.min(PAGE_SIZE, msgs.length);
  var startIdx = msgs.length - loadedCount;

  chatMessages.innerHTML = '';
  // 加载更多按钮
  if (msgs.length > PAGE_SIZE) {
    loadMoreBtn.style.display = 'block';
    loadMoreBtn.textContent = '加载更早的 ' + (msgs.length - loadedCount) + ' 条消息';
  } else {
    loadMoreBtn.style.display = 'none';
  }

  for (var i = startIdx; i < msgs.length; i++) {
    appendMessageDOM(msgs[i]);
  }
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendMessageDOM(msg) {
  var isUser = msg.role === 'user';
  var msgDiv = document.createElement('div');
  msgDiv.className = 'msg ' + (isUser ? 'msg-user' : 'msg-ai');
  msgDiv.setAttribute('data-msg-id', msg.id);

  var avatarIcon = isUser ? 'fa-user' : 'fa-robot';
  var bubbleContent = esc(msg.content).replace(/\n/g, '<br>');

  msgDiv.innerHTML =
    '<div class="msg-avatar"><i class="fas ' + avatarIcon + '"></i></div>' +
    '<div class="msg-content">' +
      '<div class="msg-bubble">' + bubbleContent + '</div>' +
      '<div class="msg-meta">' +
        '<span class="msg-time">' + formatTime(msg.time) + '</span>' +
        (isUser
          ? '<span class="msg-action" data-action="edit"><i class="fas fa-pen"></i> 编辑</span>'
          : '<span class="msg-action" data-action="copy"><i class="fas fa-copy"></i> 复制</span>') +
        '<span class="msg-action danger" data-action="delete"><i class="fas fa-trash"></i> 删除</span>' +
      '</div>' +
    '</div>';

  chatMessages.appendChild(msgDiv);
}

// 加载更早消息
loadMoreBtn.addEventListener('click', function () {
  var chat = getActiveChat();
  if (!chat) return;
  var msgs = chat.messages;
  var newCount = Math.min(PAGE_SIZE, msgs.length - loadedCount);
  if (newCount <= 0) { loadMoreBtn.style.display = 'none'; return; }

  var startIdx = msgs.length - loadedCount - newCount;
  var frag = document.createDocumentFragment();
  for (var i = startIdx; i < startIdx + newCount; i++) {
    var tmp = document.createElement('div');
    tmp.innerHTML = getOuterHTML(msgs[i]);
    frag.appendChild(tmp.firstChild);
  }

  var firstMsg = chatMessages.querySelector('.msg');
  chatMessages.insertBefore(frag, firstMsg);
  loadedCount += newCount;

  if (loadedCount >= msgs.length) {
    loadMoreBtn.style.display = 'none';
  } else {
    loadMoreBtn.textContent = '加载更早的 ' + (msgs.length - loadedCount) + ' 条消息';
  }
});

function getOuterHTML(msg) {
  var isUser = msg.role === 'user';
  var avatarIcon = isUser ? 'fa-user' : 'fa-robot';
  var bubbleContent = esc(msg.content).replace(/\n/g, '<br>');
  return '<div class="msg ' + (isUser ? 'msg-user' : 'msg-ai') + '" data-msg-id="' + msg.id + '">' +
    '<div class="msg-avatar"><i class="fas ' + avatarIcon + '"></i></div>' +
    '<div class="msg-content">' +
      '<div class="msg-bubble">' + bubbleContent + '</div>' +
      '<div class="msg-meta">' +
        '<span class="msg-time">' + formatTime(msg.time) + '</span>' +
        (isUser
          ? '<span class="msg-action" data-action="edit"><i class="fas fa-pen"></i> 编辑</span>'
          : '<span class="msg-action" data-action="copy"><i class="fas fa-copy"></i> 复制</span>') +
        '<span class="msg-action danger" data-action="delete"><i class="fas fa-trash"></i> 删除</span>' +
      '</div>' +
    '</div>' +
  '</div>';
}

/* ============================================================
   8. 消息操作 — 编辑 / 删除 / 复制
   ============================================================ */
chatMessages.addEventListener('click', function (e) {
  var action = e.target.closest('[data-action]');
  if (!action) return;
  var msgEl = action.closest('.msg');
  if (!msgEl) return;
  var msgId = msgEl.getAttribute('data-msg-id');
  var act = action.getAttribute('data-action');

  if (act === 'copy') {
    var bubble = msgEl.querySelector('.msg-bubble');
    if (bubble) {
      navigator.clipboard.writeText(bubble.textContent).then(function () {
        action.innerHTML = '<i class="fas fa-check"></i> 已复制';
        setTimeout(function () { action.innerHTML = '<i class="fas fa-copy"></i> 复制'; }, 2000);
      });
    }
    return;
  }

  if (act === 'delete') {
    var chat = getActiveChat();
    if (!chat) return;
    chat.messages = chat.messages.filter(function (m) { return m.id !== msgId; });
    saveData(appData);
    broadcastSync('update', { chatId: chat.id });
    msgEl.style.opacity = '0';
    msgEl.style.transform = 'translateX(-20px)';
    msgEl.style.transition = 'all 0.2s ease';
    setTimeout(function () { msgEl.remove(); }, 200);
    // 如果对话为空，回到空状态
    if (chat.messages.length === 0) {
      chat.title = '新对话';
      saveData(appData);
      renderChatList();
      renderMessages();
    }
    return;
  }

  if (act === 'edit') {
    var chat2 = getActiveChat();
    if (!chat2) return;
    var msg = chat2.messages.find(function (m) { return m.id === msgId; });
    if (!msg) return;

    var bubble2 = msgEl.querySelector('.msg-bubble');
    var oldContent = msg.content;

    // 切换到编辑模式
    bubble2.classList.add('editing');
    bubble2.innerHTML =
      '<textarea class="msg-edit-input">' + esc(oldContent) + '</textarea>' +
      '<div class="msg-edit-actions">' +
        '<button class="msg-edit-save"><i class="fas fa-check"></i> 保存</button>' +
        '<button class="msg-edit-cancel"><i class="fas fa-times"></i> 取消</button>' +
      '</div>';

    var textarea = bubble2.querySelector('.msg-edit-input');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    bubble2.querySelector('.msg-edit-save').addEventListener('click', function () {
      var newContent = textarea.value.trim();
      if (newContent && newContent !== oldContent) {
        msg.content = newContent;
        saveData(appData);
        broadcastSync('update', { chatId: chat2.id });
      }
      bubble2.classList.remove('editing');
      bubble2.innerHTML = esc(msg.content).replace(/\n/g, '<br>');
      // 如果是第一条用户消息，更新标题
      if (chat2.messages.length > 0 && chat2.messages[0].id === msgId && chat2.messages[0].role === 'user') {
        chat2.title = generateTitle(newContent);
        saveData(appData);
        renderChatList();
        topbarTitle.textContent = chat2.title;
      }
    });

    bubble2.querySelector('.msg-edit-cancel').addEventListener('click', function () {
      bubble2.classList.remove('editing');
      bubble2.innerHTML = esc(oldContent).replace(/\n/g, '<br>');
    });
  }
});

/* ============================================================
   9. AI 回复库
   ============================================================ */
var aiReplies = [
  '这是一个很好的问题！让我来帮你分析一下。\n\n首先，建议你从基础概念入手，把核心知识点梳理清楚。可以试试以下方法：\n\n1. 先通读一遍教材目录，建立知识框架\n2. 针对每个章节做思维导图\n3. 用费曼学习法，试着把概念讲给别人听\n\n这样学习效率会大大提高！',
  '关于这个问题，我建议你分步骤来处理：\n\n**第一步：明确目标**\n把这个大目标拆分成每周的小目标，这样更有成就感。\n\n**第二步：制定计划**\n每天固定时间段学习，形成习惯。推荐使用番茄工作法，25分钟专注 + 5分钟休息。\n\n**第三步：定期复盘**\n每周回顾一下，看看哪些掌握了，哪些还需要加强。\n\n需要我帮你制定更详细的计划吗？',
  '我理解你的困惑！很多同学都会遇到类似的问题。这里有几个实用建议：\n\n◆ **主动学习**：不要只是被动看笔记，要多做题、多思考\n◆ **间隔重复**：今天学的内容，隔1天、3天、7天分别复习一次\n◆ **组建学习小组**：和同学一起讨论，互相讲解\n◆ **利用碎片时间**：通勤时听课程音频、背单词\n\n坚持这些方法，你会看到明显进步的！',
  '很好的学习态度！针对你的问题，我推荐以下资源：\n\n📚 **教材类**：先看学校指定教材，再补充经典参考书\n🎬 **视频类**：B站上有很多优质课程，搜索关键词即可\n📝 **刷题类**：历年真题是最好的练习材料\n💡 **工具类**：Notion做笔记、Anki背单词、Forest专注\n\n记住，工具只是辅助，关键是坚持和方法！',
  '这个问题问得很到位！让我给你一个系统的解决方案：\n\n**短期（1-2周）**\n• 梳理知识框架，找出薄弱环节\n• 针对性刷题，每天至少30道\n\n**中期（1个月）**\n• 完成第一轮全面复习\n• 整理错题本，分析错误原因\n\n**长期（考前）**\n• 模拟考试，查漏补缺\n• 回顾错题本，强化记忆\n\n加油！你一定可以的！💪',
  '学习效率低？这可能是因为方法不对。试试这些技巧：\n\n🎯 **番茄工作法**：25分钟专注 + 5分钟休息\n📊 **费曼学习法**：用简单语言解释复杂概念\n🧠 **主动回忆**：合上书本，回想学过的内容\n📝 **康奈尔笔记法**：把笔记分成三部分——线索、笔记、总结\n\n另外，保证充足睡眠和适当运动也很重要哦！',
  '关于时间管理，我推荐你试试"时间块"方法：\n\n⏰ **早晨（6-8点）**：记忆力最好，适合背诵\n📖 **上午（9-12点）**：逻辑思维强，适合做数学/编程\n🍽️ **午休后（14-16点）**：适合复习和整理笔记\n🌙 **晚上（19-21点）**：适合做练习题\n\n每天固定时间段做固定的事，形成生物钟，效率自然就上去了！'
];

function getAIReply() {
  return aiReplies[Math.floor(Math.random() * aiReplies.length)];
}

/* ============================================================
   10. 发送消息
   ============================================================ */
function addMessage(text, role) {
  var chat = getActiveChat();
  if (!chat) {
    chat = createChat('chat');
    renderChatList();
    showChatView();
  }

  var msg = { id: genId(), role: role, content: text, time: Date.now() };
  chat.messages.push(msg);

  // 第一条用户消息 → 自动生成标题
  if (role === 'user' && chat.messages.filter(function (m) { return m.role === 'user'; }).length === 1) {
    chat.title = generateTitle(text);
    topbarTitle.textContent = chat.title;
  }

  saveData(appData);
  broadcastSync('update', { chatId: chat.id });
  appendMessageDOM(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  renderChatList();
}

function sendMessage() {
  var text = chatInput.value.trim();
  if (!text) return;
  addMessage(text, 'user');
  chatInput.value = '';
  chatInput.style.height = 'auto';

  // 打字动画
  addTyping();
  var delay = 600 + Math.random() * 800;
  setTimeout(function () {
    removeTyping();
    addMessage(getAIReply(), 'ai');
  }, delay);
}

function addTyping() {
  var typingDiv = document.createElement('div');
  typingDiv.className = 'msg msg-ai';
  typingDiv.id = 'typingIndicator';
  typingDiv.innerHTML =
    '<div class="msg-avatar"><i class="fas fa-robot"></i></div>' +
    '<div class="msg-content">' +
      '<div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>' +
    '</div>';
  chatMessages.appendChild(typingDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
function removeTyping() {
  var t = document.getElementById('typingIndicator');
  if (t) t.remove();
}

chatSend.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
// 自动高度
chatInput.addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// 示例问题点击
document.querySelectorAll('.example-q').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var q = this.getAttribute('data-q');
    chatInput.value = q;
    sendMessage();
  });
});

/* ============================================================
   11. 导出对话为 Markdown
   ============================================================ */
exportBtn.addEventListener('click', function () {
  var chat = getActiveChat();
  if (!chat || chat.messages.length === 0) {
    alert('当前没有可导出的对话');
    return;
  }

  var md = '# ' + chat.title + '\n\n';
  md += '> 导出时间：' + new Date().toLocaleString() + '\n\n---\n\n';

  chat.messages.forEach(function (msg) {
    var role = msg.role === 'user' ? '**我**' : '**AI 助手**';
    md += role + '：\n\n' + msg.content + '\n\n---\n\n';
  });

  var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = (chat.title || '对话记录') + '.md';
  a.click();
  URL.revokeObjectURL(url);
});

/* ============================================================
   12. 智能规划表单
   ============================================================ */
var goalTypes = document.getElementById('goalTypes');
var planGoal = document.getElementById('planGoal');
var planWeeks = document.getElementById('planWeeks');
var weekValue = document.getElementById('weekValue');
var diffBtns = document.getElementById('diffBtns');
var planSubmit = document.getElementById('planSubmit');
var planResult = document.getElementById('planResult');

var selectedType = 'exam';
var selectedDiff = 'medium';

goalTypes.addEventListener('click', function (e) {
  var typeEl = e.target.closest('.goal-type');
  if (!typeEl) return;
  goalTypes.querySelectorAll('.goal-type').forEach(function (t) { t.classList.remove('selected'); });
  typeEl.classList.add('selected');
  selectedType = typeEl.getAttribute('data-type');
});

planWeeks.addEventListener('input', function () {
  weekValue.textContent = this.value + '周';
});

diffBtns.addEventListener('click', function (e) {
  var btn = e.target.closest('.diff-btn');
  if (!btn) return;
  diffBtns.querySelectorAll('.diff-btn').forEach(function (b) { b.classList.remove('selected'); });
  btn.classList.add('selected');
  selectedDiff = btn.getAttribute('data-diff');
});

var typeNames = { exam: '考试备考', course: '课程学习', skill: '技能提升' };
var diffNames = { easy: '轻松', medium: '适中', hard: '挑战' };
var planTemplates = {
  exam: [
    { title: '基础梳理', desc: '通读教材，建立知识框架，标注重点和疑难点' },
    { title: '强化训练', desc: '针对重点章节刷题，整理错题本，查漏补缺' },
    { title: '专题突破', desc: '攻克薄弱环节，做历年真题，分析出题规律' },
    { title: '模拟冲刺', desc: '限时模拟考试，调整答题节奏，回顾错题本' },
    { title: '考前巩固', desc: '回顾核心知识点，保持手感，调整心态' }
  ],
  course: [
    { title: '预习准备', desc: '提前浏览下节课内容，标记不理解的概念' },
    { title: '课堂学习', desc: '认真听讲，做好笔记，课后及时整理' },
    { title: '复习巩固', desc: '当天复习笔记，完成课后作业' },
    { title: '拓展延伸', desc: '阅读参考书，做拓展练习，加深理解' },
    { title: '阶段总结', desc: '每周回顾，整理知识脉络，准备测验' }
  ],
  skill: [
    { title: '目标拆解', desc: '明确技能目标，拆分成可量化的小目标' },
    { title: '基础入门', desc: '学习核心概念和基础操作，打好根基' },
    { title: '刻意练习', desc: '每天固定时间练习，注重质量和反馈' },
    { title: '项目实战', desc: '做一个完整项目，把知识串起来' },
    { title: '复盘优化', desc: '总结经验教训，持续改进方法' }
  ]
};

planSubmit.addEventListener('click', function () {
  var goal = planGoal.value.trim();
  if (!goal) {
    planGoal.focus();
    planGoal.style.borderColor = '#ef4444';
    setTimeout(function () { planGoal.style.borderColor = ''; }, 2000);
    return;
  }

  var weeks = parseInt(planWeeks.value, 10);
  var templates = planTemplates[selectedType] || planTemplates.exam;
  var diffLabel = diffNames[selectedDiff];

  var resultHTML =
    '<div class="plan-result">' +
      '<h3><i class="fas fa-clipboard-list"></i> 你的' + diffLabel + '学习计划</h3>' +
      '<p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">' +
        '目标：' + goal + ' ｜ 类型：' + typeNames[selectedType] + ' ｜ 周期：' + weeks + '周 ｜ 难度：' + diffLabel +
      '</p>';

  for (var w = 1; w <= Math.min(weeks, 8); w++) {
    var templateIdx = (w - 1) % templates.length;
    var weekMultiplier = selectedDiff === 'hard' ? 1.5 : selectedDiff === 'easy' ? 0.7 : 1;
    var dailyMin = Math.round(30 * weekMultiplier + (w - 1) * 5);
    resultHTML +=
      '<div class="plan-week">' +
        '<div class="plan-week-num">' + w + '</div>' +
        '<div class="plan-week-content">' +
          '<h4>第' + w + '周：' + templates[templateIdx].title + '</h4>' +
          '<p>' + templates[templateIdx].desc + '</p>' +
          '<p style="margin-top:6px;font-size:12px;color:var(--primary);">建议每日投入 ' + dailyMin + ' 分钟</p>' +
        '</div>' +
      '</div>';
  }

  if (weeks > 8) {
    resultHTML +=
      '<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:13px;">' +
        '... 还有 ' + (weeks - 8) + ' 周计划，AI 会根据你的进度动态调整 ...' +
      '</div>';
  }

  resultHTML += '</div>';
  planResult.innerHTML = resultHTML;
  planResult.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // 保存规划到会话
  var planChat = createChat('plan');
  planChat.title = goal.slice(0, 20);
  planChat.messages.push({ id: genId(), role: 'user', content: '制定计划：' + goal, time: Date.now() });
  planChat.messages.push({ id: genId(), role: 'ai', content: resultHTML.replace(/<[^>]+>/g, ''), time: Date.now() });
  saveData(appData);
  renderChatList();
});

/* ============================================================
   13. Tab 切换
   ============================================================ */
document.querySelectorAll('.ai-tab').forEach(function (tab) {
  tab.addEventListener('click', function () {
    var target = this.getAttribute('data-tab');
    document.querySelectorAll('.ai-tab').forEach(function (t) { t.classList.remove('active'); });
    this.classList.add('active');
    document.querySelectorAll('.ai-view').forEach(function (v) { v.classList.remove('active'); });
    document.getElementById('view-' + target).classList.add('active');
  });
});

/* ============================================================
   14. 初始化
   ============================================================ */
renderChatList();
if (appData.activeId) {
  renderMessages();
}

console.log('[AI助手] 页面初始化完成');
