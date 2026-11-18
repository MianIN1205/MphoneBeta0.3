// 眠花糖机 — 消息列表最上面那排圆圈「此刻」：每个圆圈是一个角色，TA 换了签名（此刻在做什么）或发了新动态，头像发一圈粉色的光；
// 点开是一张小卡片：TA 此刻在做什么、最新一条动态，「去聊天」。「+」挑放哪几个角色上来（mphone_moment_chars、mphone_moment_seen）

var momentPick = mphoneStore.load('mphone_moment_chars', null);
var momentPin = mphoneStore.load('mphone_moment_pin', '');
var momentSeen = mphoneStore.load('mphone_moment_seen', {}) || {};
var MOMENT_MAX = 8;
var MOMENT_AUTO = 3;

function momentPins() {
  var helper = charList.find(function(c) { return c.id && c.builtinAssistant; });
  var pinned = momentPin && charList.find(function(c) { return c.id === momentPin && !c.isGroup && !c.builtinAssistant; });
  return [helper, pinned].filter(Boolean);
}

function momentChars() {
  var pins = momentPins();
  var manual = Array.isArray(momentPick);
  var candidates = charList.filter(function(c) {
    return c.id && !c.isGroup && !c.builtinAssistant && pins.indexOf(c) < 0
      && (manual ? momentPick.indexOf(c.id) >= 0 : c.inChat);
  });
  var others = candidates.map(function(c) {
    var last = typeof lastSessionMsg === 'function' ? lastSessionMsg(c) : null;
    return { c: c, update: momentNewAt(c), chat: (last && last.time) || c.chatTouchedAt || 0 };
  }).sort(function(a, b) { return b.update - a.update || b.chat - a.chat; })
    .slice(0, manual ? MOMENT_MAX - pins.length : MOMENT_AUTO)
    .map(function(item) { return item.c; });
  return pins.concat(others);
}
function momentLatestPost(char) {
  if (typeof feedPosts === 'undefined') return null;
  return feedPosts.find(function(p) { return p.author && p.author.type === 'char' && p.author.id === char.id; }) || null;
}
// 有没有新东西：签名换了的时间、最新动态的时间，比上次点开晚
function momentNewAt(char) {
  var post = momentLatestPost(char);
  return Math.max(char.headStatusAt || 0, char.charBioAt || 0, (post && post.time) || 0);
}
function momentHasNew(char) { var t = momentNewAt(char); return t > 0 && t > (momentSeen[char.id] || 0); }

function renderMoments() {
  var row = document.querySelector('.chat-avatar-row');
  if (!row) return;
  row.innerHTML = '';
  momentChars().forEach(function(c) {
    var item = document.createElement('div');
    item.className = 'moment-item' + (momentHasNew(c) ? ' has-new' : '') + (c.builtinAssistant ? ' is-helper' : '');   // 有新东西：角色发蓝光，MianIN 粉光
    item.innerHTML = '<div class="moment-ring"><div class="chat-avatar moment-av"></div></div><span class="moment-name"></span>';
    if (typeof paintCharAvatar === 'function') paintCharAvatar(item.querySelector('.moment-av'), c);
    item.querySelector('.moment-name').textContent = c.charAlias || c.charName || '未命名';
    item.addEventListener('click', function() { openMoment(c); });
    row.appendChild(item);
  });
  var add = document.createElement('div');
  add.className = 'moment-item';
  add.innerHTML = '<div class="chat-avatar-add"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></div><span class="moment-name">&nbsp;</span>';
  add.addEventListener('click', openMomentPick);
  row.appendChild(add);
}

// 点开一个圆圈：TA 此刻
var momentCur = null, momentPostId = '';
function openMoment(c) {
  momentCur = c;
  var seen = momentSeen[c.id] || 0;
  var box = document.getElementById('momentCard');
  if (typeof paintCharAvatar === 'function') paintCharAvatar(box.querySelector('.moment-card-av'), c);
  box.querySelector('.moment-card-name').textContent = c.charAlias || c.charName || '未命名';
  var st = box.querySelector('.moment-card-status');
  st.textContent = c.headStatus || (typeof CHAT_SUB_DEFAULT === 'string' ? CHAT_SUB_DEFAULT : '在呢');
  box.querySelector('.moment-card-bio').textContent = c.charBio || '还没有个性签名';
  box.querySelector('.moment-card-when').textContent = c.headStatusAt ? fmtAgo(c.headStatusAt) : '';
  var post = momentLatestPost(c), pb = box.querySelector('.moment-card-post');
  momentPostId = post ? post.id : '';
  pb.style.display = post ? '' : 'none';
  var postIsNew = !!post && post.time > seen;
  box.querySelector('[data-moment-update="bio"]').hidden = !(c.charBioAt > seen);
  box.querySelector('[data-moment-update="status"]').hidden = !(c.headStatusAt > seen);
  box.querySelector('[data-moment-update="post"]').hidden = !postIsNew;
  pb.setAttribute('aria-label', postIsNew ? '查看新动态' : '查看这条动态');
  if (post) {
    pb.querySelector('.moment-card-post-text').textContent = post.text || ((post.textImgs || [])[0] ? '[图片] ' + post.textImgs[0] : '[图片]');
    pb.querySelector('.moment-card-post-when').textContent = fmtAgo(post.time);
  }
  document.getElementById('momentOverlay').classList.add('open');
  momentSeen[c.id] = Date.now();
  mphoneStore.save('mphone_moment_seen', momentSeen);
  renderMoments();
}
function closeMoment() { document.getElementById('momentOverlay').classList.remove('open'); momentCur = null; momentPostId = ''; }
closeOnBackdrop(document.getElementById('momentOverlay'), closeMoment);
document.getElementById('momentClose').addEventListener('click', closeMoment);
document.getElementById('momentPost').addEventListener('click', function() {
  var postId = momentPostId;
  closeMoment();
  if (postId) openFromNotification({ open: 'feed', postId: postId });
});
document.getElementById('momentChat').addEventListener('click', function() {
  var c = momentCur;
  closeMoment();
  if (c && typeof openFromNotification === 'function') openFromNotification({ open: 'chat', charId: c.id });
});

// 「+」：第二位可设一位置顶，其他头像按最新内容排序。
var momentPinSelect = document.getElementById('momentPinSelect');
function renderMomentPickList() {
  var pins = momentPins();
  var current = momentChars().filter(function(c) { return pins.indexOf(c) < 0; }).map(function(c) { return c.id; });
  var list = document.getElementById('momentPickList');
  list.replaceChildren();
  charList.filter(function(c) { return c.id && !c.isGroup && !c.builtinAssistant && pins.indexOf(c) < 0; }).forEach(function(c) {
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'feed-visible-chip';
    chip.textContent = c.charAlias || c.charName || '未命名';
    function paint() {
      var selected = current.indexOf(c.id) >= 0;
      chip.classList.toggle('on', selected);
      chip.setAttribute('aria-pressed', String(selected));
    }
    chip.addEventListener('click', function() {
      var i = current.indexOf(c.id);
      if (i >= 0) current.splice(i, 1);
      else if (current.length + pins.length >= MOMENT_MAX) {
        showToast('「此刻」最多显示 ' + MOMENT_MAX + ' 位', 'plain');
        return;
      } else current.push(c.id);
      // 已经手动显示的角色被置顶时，仍记着原来的显示选择。
      var savedPin = momentPin && Array.isArray(momentPick) && momentPick.indexOf(momentPin) >= 0;
      momentPick = savedPin ? current.concat(momentPin) : current.slice();
      mphoneStore.save('mphone_moment_chars', momentPick);
      paint();
      renderMoments();
    });
    paint();
    list.appendChild(chip);
  });
}

function openMomentPick() {
  momentPinSelect.replaceChildren(new Option('未设置', ''));
  charList.filter(function(c) { return c.id && !c.isGroup && !c.builtinAssistant; }).forEach(function(c) {
    momentPinSelect.add(new Option(c.charAlias || c.charName || '未命名', c.id));
  });
  momentPinSelect.value = Array.from(momentPinSelect.options).some(function(option) { return option.value === momentPin; }) ? momentPin : '';
  renderMomentPickList();
  document.getElementById('momentPickOverlay').classList.add('open');
}
momentPinSelect.addEventListener('change', function() {
  momentPin = momentPinSelect.value;
  mphoneStore.save('mphone_moment_pin', momentPin);
  renderMomentPickList();
  renderMoments();
});
closeOnBackdrop(document.getElementById('momentPickOverlay'));
document.getElementById('momentPickDone').addEventListener('click', function() { document.getElementById('momentPickOverlay').classList.remove('open'); });
onMphoneReady(renderMoments);
