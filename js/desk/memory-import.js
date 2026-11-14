// 旧记忆先生成可编辑草稿，用户确认后才写进当前角色。
(function() {
  var overlay = document.getElementById('memPasteOverlay');
  var source = document.getElementById('memPasteText');
  var results = document.getElementById('memPasteList');
  var split = document.getElementById('memPasteSplit');
  var ai = document.getElementById('memPasteAI');
  var save = document.getElementById('memPasteSave');
  var types = { long: '长期', precious: '珍贵', short: '短期', tl: '时间线' };
  var batch = null;

  function close() {
    batch = null;
    overlay.classList.remove('open');
  }

  function sync() {
    save.disabled = !batch || batch.busy || !batch.rows.some(function(row) { return row.selected && row.text.trim(); });
  }

  function paint(rows) {
    batch.rows = rows;
    results.textContent = '';
    rows.forEach(function(row, index) {
      var item = document.createElement('div');
      item.className = 'mem-paste-item';
      var pick = document.createElement('input');
      pick.type = 'checkbox';
      pick.checked = row.selected;
      pick.setAttribute('aria-label', '加入第 ' + (index + 1) + ' 条记忆');
      pick.addEventListener('change', function() { row.selected = pick.checked; sync(); });
      var category = document.createElement('select');
      category.setAttribute('aria-label', '第 ' + (index + 1) + ' 条记忆类型');
      Object.keys(types).forEach(function(key) {
        var opt = document.createElement('option');
        opt.value = key; opt.textContent = types[key];
        category.appendChild(opt);
      });
      category.value = row.type;
      category.addEventListener('change', function() { row.type = category.value; });
      var input = document.createElement('textarea');
      input.value = row.text;
      input.rows = 2;
      input.setAttribute('aria-label', '第 ' + (index + 1) + ' 条记忆正文');
      input.addEventListener('input', function() { row.text = input.value; sync(); });
      item.appendChild(pick);
      item.appendChild(category);
      item.appendChild(input);
      var clues = [row.when, row.emo].concat(row.cues || []).filter(Boolean);
      if (clues.length) {
        var label = document.createElement('small');
        label.textContent = clues.join(' · ');
        item.appendChild(label);
      }
      results.appendChild(item);
    });
    sync();
  }

  function inputText() {
    var text = source.value.trim();
    if (!text) shakeEl(source);
    return text;
  }

  function makeRow(entry) {
    var kind = entry.type;
    if (!Object.prototype.hasOwnProperty.call(types, kind)) kind = 'long';
    var when = String(entry.when || '').trim();
    return {
      text: String(entry.text || '').trim(),
      type: kind,
      when: memParseDate(when) ? when : '',
      emo: memNormEmo(entry.emo),
      cues: memNormCues(entry.cues),
      selected: true
    };
  }

  document.getElementById('memPasteBtn').addEventListener('click', function() {
    var char = memCharById(memLibChar);
    if (!char) return;
    batch = { charId: char.id, rows: [], busy: false };
    source.value = '';
    ai.disabled = false;
    split.disabled = false;
    ai.textContent = '让模型整理';
    paint([]);
    overlay.classList.add('open');
  });
  document.getElementById('memPasteCancel').addEventListener('click', close);
  closeOnBackdrop(overlay, close);

  split.addEventListener('click', function() {
    var text = inputText();
    if (!text) return;
    var lines = text.split(/\n+/).map(function(line) { return line.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, '').trim(); }).filter(Boolean);
    if (lines.length > 80) { showToast('请分批整理，每次最多 80 行', 'plain'); return; }
    paint(lines.map(function(line) { return makeRow({ text: line, type: 'long' }); }));
  });

  ai.addEventListener('click', function() {
    var text = inputText(), run = batch;
    if (!text || !run || run.busy) return;
    var char = memCharById(run.charId), cfg = getApiCfg(char);
    if (!cfg.url || !cfg.key || !cfg.model) { showToast('请先配置模型，或选「按原文分行」', 'plain'); return; }
    run.busy = true;
    ai.disabled = split.disabled = save.disabled = true;
    ai.textContent = '整理中…';
    var prompt = '把用户提供的旧记忆整理成逐条的 JSON 数组。只使用原文事实，保留具体细节和原文表达，不添加新信息。' +
      '每项字段：text、type（long 长期、precious 珍贵、tl 重要时间线）、when（只有原文明示时才填 YYYY-MM-DD、YYYY-MM、YYYY 或 YYYY以前）、' +
      'emo（适用时从 ' + MEM_EMOS.join('、') + ' 中选）、cues（原文提到的物件地点等线索数组）。最多 30 项，只输出 JSON 数组。';
    llmRequest([{ role: 'system', content: prompt }, { role: 'user', content: text }], { stream: false, cfg: cfg }).then(function(reply) {
      if (batch !== run) return;
      var rows = JSON.parse(String(reply || '').trim().replace(/^```(?:json)?\s*|\s*```$/gi, ''));
      if (!Array.isArray(rows)) throw new Error('模型返回的格式不正确');
      rows = rows.slice(0, 30).filter(backupRecord).map(makeRow).filter(function(row) { return row.text; });
      if (!rows.length) throw new Error('模型没有返回记忆草稿');
      paint(rows);
    }).catch(function(err) {
      if (batch === run) showToast('✗ 整理失败：' + err.message, 'error');
    }).finally(function() {
      if (batch !== run) return;
      run.busy = false;
      ai.disabled = split.disabled = false;
      ai.textContent = '让模型整理';
      sync();
    });
  });

  save.addEventListener('click', function() {
    if (!batch || batch.busy) return;
    var char = memCharById(batch.charId);
    if (!char) { close(); return; }
    var chosen = batch.rows.filter(function(row) { return row.selected && row.text.trim(); });
    if (!chosen.length) return;
    var tooLong = chosen.findIndex(function(row) { return row.text.trim().length > memTextMax(row.type); });
    if (tooLong !== -1) { showToast('有记忆太长，请分成几条再加入', 'error'); return; }
    chosen.forEach(function(row) {
      memAdd(char, {
        type: row.type === 'tl' ? 'long' : row.type,
        text: row.text, source: 'user', tl: row.type === 'tl', when: row.when, emo: row.emo, cues: row.cues,
        noMilestone: true, preserveDuplicateTime: true, exactOnly: true, deferSave: true
      });
    });
    saveMemStore();
    close();
    if (memLibChar === char.id) renderMemLib();
    showToast('✓ 已处理 ' + chosen.length + ' 条记忆', 'success');
  });
})();
