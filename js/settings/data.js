// 眠花糖机 — 设置 → 辅助功能 → 数据管理：占用圆环、导入备份；最后画一次聊天列表

// =============================================
// 设置 — 数据管理：占用分析圆环 + 备份 / 导入（全部 mphone_ 数据）
// =============================================
(function() {
  var exportRow = document.getElementById('dataBackupExport');
  var importRow = document.getElementById('dataBackupRestore');
  var importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = '.json,.txt,application/json,text/plain';   // 安卓分享出去的备份可能是 .txt
  importInput.style.display = 'none';
  document.body.appendChild(importInput);

  // 占用分类：按数据 key 归类，所有 key 里的图片单独统计
  var DATA_GROUPS = [
    { name: '聊天记录', color: '#E8909E', keys: ['mphone_chat_histories', 'mphone_drama_histories'] },
    { name: '图片',     color: '#9BB8D8', keys: null },
    { name: '角色',     color: '#C4A6DC', keys: ['mphone_chars', 'mphone_unread', 'mphone_auto_next'] },
    { name: '动态',     color: '#F2C28C', keys: ['mphone_feed', 'mphone_feed_cover'] },
    { name: '笔记',     color: '#A8D4B8', keys: ['mphone_notes_shelves'] },
    { name: '世界书',   color: '#E0B8A0', keys: ['mphone_worldbook', 'mphone_wb_folders'] },
    { name: '其他',     color: '#D6D0D6', keys: [] }
  ];

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  function analyze() {
    var sizes = DATA_GROUPS.map(function() { return 0; });
    var imgIdx = 1, otherIdx = DATA_GROUPS.length - 1;
    mphoneStore.keys().forEach(function(k) {
      var json = JSON.stringify(mphoneStore.load(k, null)) || '';
      var img = 0;
      (json.match(/data:image\/[^"\\]+/g) || []).forEach(function(s) { img += s.length; });
      var text = Math.max(0, new Blob([json]).size - img);
      sizes[imgIdx] += img;
      var gi = otherIdx;
      DATA_GROUPS.forEach(function(g, i) { if (g.keys && g.keys.indexOf(k) >= 0) gi = i; });
      sizes[gi] += text;
    });
    return sizes;
  }

  function renderUsage() {
    var sizes = analyze();
    var total = sizes.reduce(function(a, b) { return a + b; }, 0);
    var svg = document.getElementById('dataDonut');
    var R = 15.915;   // 周长 ≈ 100，便于按百分比画弧
    var html = '<circle cx="21" cy="21" r="' + R + '" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="5"></circle>';
    var offset = 0;
    sizes.forEach(function(s, i) {
      if (!total || !s) return;
      var pct = s / total * 100;
      html += '<circle cx="21" cy="21" r="' + R + '" fill="none" stroke="' + DATA_GROUPS[i].color + '" stroke-width="5"' +
              ' stroke-dasharray="' + pct.toFixed(3) + ' ' + (100 - pct).toFixed(3) + '" stroke-dashoffset="' + (-offset).toFixed(3) + '"></circle>';
      offset += pct;
    });
    svg.innerHTML = html;
    document.getElementById('dataTotal').textContent = fmtBytes(total);

    var legend = document.getElementById('dataLegend');
    legend.innerHTML = '';
    sizes.forEach(function(s, i) {
      if (!s) return;
      var item = document.createElement('span');
      item.className = 'data-legend-item';
      item.innerHTML = '<span class="data-legend-dot" style="background:' + DATA_GROUPS[i].color + '"></span>';
      item.appendChild(document.createTextNode(DATA_GROUPS[i].name + ' ' + fmtBytes(s)));
      legend.appendChild(item);
    });

    var quota = document.getElementById('dataQuota');
    var mode = mphoneStore.usingIndexedDB() ? '存储方式：IndexedDB' : '存储方式：localStorage（约 5MB 上限）';
    quota.textContent = mode;
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(function(est) {
        if (est && est.quota) quota.textContent = mode + ' · 浏览器可用配额约 ' + fmtBytes(est.quota);
      }).catch(function() {});
    }
  }

  // 只在打开数据管理所在页时统计，切换主 API 时无需遍历所有聊天和图片。
  var assistTab = document.querySelector('#settingsSubnav [data-stab="assist"]');
  var usageTimer = null;
  function queueUsage() {
    clearTimeout(usageTimer);
    usageTimer = setTimeout(function() {
      if (assistTab.classList.contains('active') && document.getElementById('settingsScreen').classList.contains('active')) renderUsage();
    }, 60);
  }
  assistTab.addEventListener('click', queueUsage);
  dockSettings.addEventListener('click', queueUsage);

  // 导出：选「分享 / 下载」（见 js/settings/backup.js）
  exportRow.addEventListener('click', function() { openBackupExport(); });

  importRow.addEventListener('click', function() {
    importInput.value = '';
    importInput.click();
  });

  importInput.addEventListener('change', function() {
    var file = this.files && this.files[0];
    if (!file) return;
    readBackupText(file).then(function(text) {
      var data = parseFullBackup(text);
      confirmFullBackup(data, file.name, function() {
        restoreFullBackup(data, '恢复成功');
      });
    }).catch(function() {
      showToast('✗ 文件格式不正确或无法读取', 'error');
    });
  });
})();

// 初始渲染聊天角色列表
renderChatCharList();
