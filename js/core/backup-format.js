// 格式与 0.1 互通。V1 存 localStorage 原始文本，V2 存已经解析的值。
var BACKUP_META_KEY = 'mphone_backup_meta';

function backupJson() {
  var data = Object.create(null);
  mphoneStore.keys().forEach(function(k) {
    if (k !== BACKUP_META_KEY) data[k] = mphoneStore.load(k, null);
  });
  return JSON.stringify({ app: 'mphone', version: 2, data: data });
}

function backupFileName(ext, charName) {
  var now = new Date();
  var date = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join('-');
  var name = charName
    ? String(charName).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() + '角色备份'
    : 'mphone完整备份';
  return name + '_' + date + '.' + ext;
}

function backupRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseFullBackup(text) {
  var parsed = JSON.parse(text);
  if (!parsed || parsed.app !== 'mphone' || parsed.type === 'char' || !backupRecord(parsed.data)) {
    throw new Error('文件格式不正确');
  }
  var data = Object.create(null);
  Object.keys(parsed.data).forEach(function(k) {
    if (k.indexOf('mphone_') !== 0) return;
    var value = parsed.data[k];
    if (parsed.version !== 2 && typeof value === 'string') {
      try { value = JSON.parse(value); } catch (_) {}
    }
    data[k] = value;
  });
  if (Object.keys(parsed.data).length && !Object.keys(data).length) throw new Error('备份里没有眠花糖机数据');
  return data;
}

function confirmFullBackup(data, source, onRestore) {
  var roles = Array.isArray(data.mphone_chars) ? data.mphone_chars.filter(backupRecord) : [];
  var names = roles.slice(0, 6).map(function(role) {
    return String(role.charAlias || role.charName || '未命名').trim().slice(0, 22) || '未命名';
  });
  if (roles.length > names.length) names.push('等');
  function countEntries(key) {
    if (!backupRecord(data[key])) return 0;
    return Object.keys(data[key]).reduce(function(total, id) {
      return total + (Array.isArray(data[key][id]) ? data[key][id].length : 0);
    }, 0);
  }
  var desc = (source ? String(source).slice(0, 110) + '\n' : '') +
    '角色 ' + roles.length + ' 个' + (names.length ? ' · ' + names.join('、') : '') + '\n' +
    '聊天 ' + countEntries('mphone_chat_histories') + ' 条 · 剧情 ' + countEntries('mphone_drama_histories') +
    ' 条 · 记忆 ' + countEntries('mphone_memories') + ' 条' +
    '\n恢复会覆盖当前小手机中的聊天、角色、记忆和设置。';
  openConfirm('恢复整机备份？', onRestore, { desc: desc, okText: '确认恢复' });
}

function restoreFullBackup(data, successText) {
  return mphoneStore.replaceAll(data).then(function() {
    showToast('✓ ' + successText + '，正在刷新', 'success');
    setTimeout(function() { location.reload(); }, 800);
  }, function(err) {
    console.error('[Mphone] 备份恢复失败', err);
    showToast('✗ 恢复失败，请确认存储空间充足后重试', 'error');
  });
}

function readBackupText(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function() { resolve(reader.result); };
    reader.onerror = function() { reject(reader.error); };
    reader.readAsText(file);
  });
}
