// 眠花糖机 — Prompt：顶部文件夹标签切换

// =============================================
// Prompt — 文件夹标签切换
// =============================================
var promptTabRow    = document.getElementById('promptTabRow');
var promptFolderBody= document.getElementById('promptFolderBody');
// 更新 folder body 左上角 border-radius（让其与激活标签对齐）
function updateFolderBodyRadius() {
  var tabs   = Array.from(promptTabRow.querySelectorAll('.prompt-tab:not(.prompt-tab-plus)'));
  var active = promptTabRow.querySelector('.prompt-tab.active');
  if (!active) return;
  var idx = tabs.indexOf(active);
  // 第 0 个标签激活：左上角贴边（0），其余圆角
  // 非第 0 个：左上角也圆（14px），因为标签不在最左
  promptFolderBody.style.borderRadius = (idx === 0)
    ? '0 14px 14px 14px'
    : '14px 14px 14px 14px';
}

// 切换到指定面板
function switchPromptTab(tabEl) {
  var ptab = tabEl.dataset.ptab;
  if (!ptab) return;

  // 高亮标签
  promptTabRow.querySelectorAll('.prompt-tab').forEach(function(t) {
    t.classList.remove('active');
  });
  tabEl.classList.add('active');

  // 切换面板
  promptFolderBody.querySelectorAll('.prompt-panel').forEach(function(p) {
    p.classList.remove('active');
  });
  var target = promptFolderBody.querySelector('.prompt-panel[data-ppanel="' + ptab + '"]');
  if (target) target.classList.add('active');

  updateFolderBodyRadius();
}

// 绑定已有标签
promptTabRow.querySelectorAll('.prompt-tab').forEach(function(tab) {
  tab.addEventListener('click', function() { switchPromptTab(this); });
});

// 初始化 radius
updateFolderBodyRadius();

// 条目编辑页（世界书、预设条目）盖在内容区最上面：列表滑到下面再点开时，编辑页在上面看不到（用户反馈过）。
// 打开时记下滑到哪、滑回顶上并锁住内容区；关掉时滑回原来的位置
(function() {
  var body = document.getElementById('promptFolderBody');
  if (!body || typeof MutationObserver === 'undefined') return;
  var saved = 0;
  body.querySelectorAll('.pf-detail-view').forEach(function(v) {
    new MutationObserver(function() {
      var open = v.classList.contains('open');
      if (open && body.style.overflowY !== 'hidden') {
        saved = body.scrollTop;
        body.scrollTop = 0;
        v.scrollTop = 0;
        body.style.overflowY = 'hidden';
      } else if (!open && !body.querySelector('.pf-detail-view.open')) {
        body.style.overflowY = '';
        body.scrollTop = saved;
      }
    }).observe(v, { attributes: true, attributeFilter: ['class'] });
  });
})();

function promptDepth(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return undefined;
  var depth = Number(value);
  return Number.isSafeInteger(depth) && depth >= 0 ? depth : undefined;
}

function createPromptPositionPicker(row) {
  var buttons = row.querySelectorAll('button');
  var toggle = row.querySelector('[data-pos="depth"]');
  var panel = document.createElement('div');
  panel.className = 'prompt-depth-panel';
  panel.hidden = true;
  var choices = document.createElement('div');
  choices.className = 'pf-radio-row';
  var hint = document.createElement('div');
  hint.className = 'prompt-depth-hint';
  hint.textContent = '0 在最后，数字越小位置越近';
  panel.append(choices, hint);
  row.after(panel);

  var state = {
    pos: 'before',
    depth: undefined,
    set: function(pos, depth) {
      state.pos = pos;
      state.depth = promptDepth(depth);
      setOpen(false);
      paint();
    }
  };
  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }
  function paint() {
    var selected = state.depth === undefined ? state.pos : 'depth';
    buttons.forEach(function(b) { b.classList.toggle('selected', b.dataset.pos === selected); });
    toggle.textContent = state.depth === undefined ? '深度' : '深度 ' + state.depth;
    var depths = [0, 1, 2, 3, 4];
    if (state.depth > 4) depths.push(state.depth);
    choices.replaceChildren();
    depths.forEach(function(depth) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pf-radio-btn' + (depth === state.depth ? ' selected' : '');
      chip.textContent = depth;
      chip.setAttribute('aria-label', '深度 ' + depth);
      chip.addEventListener('click', function() { state.set(state.pos, depth); toggle.focus(); });
      choices.append(chip);
    });
  }
  buttons.forEach(function(button) {
    button.addEventListener('click', function() {
      if (button === toggle) { setOpen(panel.hidden); return; }
      state.set(button.dataset.pos);
    });
  });
  paint();
  return state;
}

function movePromptEntry(items, entry, target, after, belongs) {
  var from = items.indexOf(entry);
  if (from < 0 || entry === target) return false;
  items.splice(from, 1);
  var at = target ? items.indexOf(target) + (after ? 1 : 0) : items.length;
  if (!target) {
    for (var i = items.length - 1; i >= 0; i--) {
      if (belongs(items[i])) { at = i + 1; break; }
    }
  }
  items.splice(at, 0, entry);
  return true;
}

function promptDragGrip(card, root, onDrop) {
  var grip = document.createElement('button');
  grip.type = 'button';
  grip.className = 'prompt-drag-grip';
  grip.setAttribute('aria-label', '拖动排序，点按编辑');
  var drag = null, suppress = false;

  function targetAt() {
    var hit = document.elementFromPoint(drag.x, drag.y);
    var group = hit && hit.closest('[data-prompt-drop-group]');
    if (!group || !root.contains(group)) return null;
    var row = hit.closest('[data-prompt-drop-entry]');
    return { group: group, row: row, after: row && drag.y >= row.getBoundingClientRect().top + row.offsetHeight / 2 };
  }

  function highlight(target) {
    if (drag.mark) drag.mark.classList.remove('prompt-drop-on', 'prompt-drop-before', 'prompt-drop-after');
    drag.mark = target && (target.row || target.group);
    if (drag.mark && drag.mark !== card) {
      drag.mark.classList.add(target.row ? (target.after ? 'prompt-drop-after' : 'prompt-drop-before') : 'prompt-drop-on');
    }
  }

  function frame() {
    var bounds = promptFolderBody.getBoundingClientRect();
    if (drag.y >= bounds.top && drag.y <= bounds.bottom) {
      if (drag.y - bounds.top < 42) promptFolderBody.scrollTop -= 8;
      else if (bounds.bottom - drag.y < 42) promptFolderBody.scrollTop += 8;
    }
    highlight(targetAt());
    drag.frame = requestAnimationFrame(frame);
  }

  grip.addEventListener('pointerdown', function(e) {
    if (!e.isPrimary || e.button !== 0) return;
    suppress = false;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    grip.setPointerCapture(e.pointerId);
    e.stopPropagation();
  });
  grip.addEventListener('pointermove', function(e) {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.active && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.active) {
      drag.active = true;
      root.classList.add('prompt-dragging');
      card.classList.add('prompt-drag-source');
      frame();
    }
  });

  function finish(e, drop) {
    if (!drag || drag.id !== e.pointerId) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    var target = drag.active && drop ? targetAt() : null;
    suppress = !!drag.active;
    cancelAnimationFrame(drag.frame);
    highlight(null);
    drag = null;
    root.classList.remove('prompt-dragging');
    card.classList.remove('prompt-drag-source');
    if (target && target.row !== card) onDrop(target.group.dataset.promptDropGroup, target.row && target.row._promptEntry, target.after);
  }

  grip.addEventListener('pointerup', function(e) { finish(e, true); });
  grip.addEventListener('pointercancel', function(e) { finish(e, false); });
  grip.addEventListener('lostpointercapture', function(e) { finish(e, false); });
  grip.addEventListener('click', function(e) {
    if (suppress && e.detail) { e.stopPropagation(); e.preventDefault(); }
    suppress = false;
  });
  card.prepend(grip);
}
