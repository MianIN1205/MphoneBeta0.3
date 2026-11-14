// 眠花糖机 — 单个角色的记忆备份：导出 / 恢复角色设置、记录、总结、记忆和其他小手机的档案

// ---------- 记忆备份：单个角色的设置 + 记录 + 总结 ----------
function downloadJson(obj, name) {
  downloadBlob(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }), name);
}

function pickFile(accept, cb) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.addEventListener('change', function() { if (this.files[0]) cb(this.files[0]); });
  input.click();
}

document.getElementById('memExportBtn').addEventListener('click', function() {
  if (editingCharIndex < 0) { showToast('请先保存角色', 'error'); return; }
  var char = charList[editingCharIndex];
  var c = Object.assign({}, char), id = char.id;
  delete c._autoBusy; delete c._lastChatAt; delete c._sumBusy;
  downloadJson({
    app: 'mphone', type: 'char', version: 1, char: c,
    chat: chatHistories[id] || [], drama: dramaHistories[id] || [],
    mems: memStore[id] || [], milestone: memMilestones[id] || null,
    archives: arcStore[id] || [],
    know: memKnow[id] || null, fading: memFading[id] || []
  }, backupFileName('json', char.charAlias || char.charName || '未命名'));
  showToast('✓ 已导出', 'success');
});

document.getElementById('memRestoreBtn').addEventListener('click', function() {
  if (editingCharIndex < 0) { showToast('请先保存角色', 'error'); return; }
  var targetId = charList[editingCharIndex].id;
  pickFile('.json,application/json', function(file) {
    readBackupText(file).then(function(t) {
      var b = JSON.parse(t);
      if (!b || b.app !== 'mphone' || b.type !== 'char' || !backupRecord(b.char) ||
          (b.know != null && !backupRecord(b.know)) || (b.milestone != null && !backupRecord(b.milestone)) ||
          ['chat', 'drama', 'mems', 'archives', 'fading'].some(function(key) {
            return b[key] != null && (!Array.isArray(b[key]) || !b[key].every(backupRecord));
          })) throw new Error('bad');
      openConfirm('用备份覆盖当前角色？', function() {
        var cur = charList[editingCharIndex];
        if (!cur || cur.id !== targetId) { showToast('请重新打开要恢复的角色', 'error'); return; }
        var restored = Object.assign({}, b.char, { id: cur.id, inChat: cur.inChat });
        charList[editingCharIndex] = restored;
        chatHistories[cur.id]  = b.chat  || [];
        dramaHistories[cur.id] = b.drama || [];
        if (Array.isArray(b.mems) && typeof memStore !== 'undefined') { memStore[cur.id] = b.mems; saveMemStore(); }
        if (Object.prototype.hasOwnProperty.call(b, 'milestone')) {
          if (b.milestone) memMilestones[cur.id] = b.milestone; else delete memMilestones[cur.id];
          saveMilestones();
        }
        if (Object.prototype.hasOwnProperty.call(b, 'know')) {
          if (b.know) memKnow[cur.id] = b.know; else delete memKnow[cur.id];
          saveMemKnow();
        }
        if (Array.isArray(b.fading)) {
          memFading[cur.id] = b.fading;
          mphoneStore.save('mphone_mem_fading', memFading);
        }
        if (Array.isArray(b.archives) && typeof arcStore !== 'undefined') { arcStore[cur.id] = b.archives; saveArcStore(); }
        saveCharList();
        saveHistories();
        fillCharForm(restored);
        renderChatCharList();
        showToast('✓ 已恢复备份', 'success');
      });
    }).catch(function() { showToast('✗ 不是有效的角色备份文件', 'error'); });
  });
});
