// 原消息的定位、回查和看图记录。只在当前角色的当前窗口读取。
function historyMessageRef(message) {
  if (!message.historyRef) {
    message.historyRef = (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-'));
    saveHistories();
  }
  return message.historyRef;
}

function historyToolRuns(message) {
  return (message.mcpRuns || []).concat(message.mcpLead ? [message.mcpLead] : []);
}

function quoteSavedTool(notice, item) {
  if (openingChatCharIdx < 0 || !getActiveMsgListEl().contains(notice)) return;
  var hist = getActiveHistory(openingChatCharIdx);
  var target = hist.find(function(m) { return !m.recalled && historyToolRuns(m).includes(notice._mcpRun); });
  if (!target) return;
  setQuote({ author: '工具记录', text: item.tool + ' · 上次结果', ref: historyMessageRef(target),
    tool: [historyToolRuns(target).indexOf(notice._mcpRun), notice._mcpRun.entries.indexOf(item)] });
}

function historyReadParts(message, tool, cfg, query) {
  var date = message.time ? new Date(message.time).toLocaleString('zh-CN') : '日期未知';
  var heading = '【回查到的记录 · ' + date + ' · ' + (message.role === 'user' ? '用户发送' : '你发送') + '】';
  var parts = [{ type: 'text', text: heading }];
  if (tool) {
    var result = tool.savedResult || tool.result;
    parts[0].text = '【当时的工具结果 · ' + date + '】' + tool.tool + '\n' +
      (tool.resultLimited === false ? '' : '（历史只保留了片段，无法确认是否完整）\n') + result;
    return parts;
  }
  if (message.imgSrc && mediaCfg.vision && llmCaps(cfg).image) {
    (message.images && message.images.length ? message.images : [{ src: message.imgSrc }]).slice(0, 9).forEach(function(photo, index) {
      parts.push({ type: 'text', text: '第 ' + (index + 1) + ' 张原图' }, { type: 'image_url', image_url: { url: photo.src } });
    });
    var notes = historyPhotoText(message);
    if (notes) parts[0].text += '\n已有看图记录：' + notes;
  } else if (message.voice && message.voice.src) {
    parts.push({ type: 'input_audio', _voiceSrc: message.voice.src, _transcript: message.transcript, _transcriptStatus: message.voice.transcriptStatus });
  } else if (message.file && message.file.text) {
    var file = message.file;
    var start = 0;
    if (file.text.length > 16000 && query) {
      var wanted = historyTerms(query);
      var lower = file.text.toLowerCase();
      var matchAt = wanted.reduce(function(best, word) { return Math.max(best, lower.indexOf(word)); }, -1);
      if (matchAt >= 0) start = Math.max(0, matchAt - 4000);
    }
    parts[0].text += '\n《' + file.name + '》\n' + file.text.slice(start, start + 16000) +
      (file.cut || file.text.length > 16000 ? '\n（以上为保存的正文片段）' : '');
  } else {
    parts[0].text += '\n' + (historyPhotoText(message) || msgTextForAI(message)).slice(0, 2400);
  }
  return parts;
}

function historyQuotes(hist, turn) {
  var refs = new Set(), found = [];
  turn.forEach(function(m) {
    var q = m.quote;
    if (!q || !q.ref || m.recalled) return;
    var key = q.ref + ':' + (q.tool || '');
    if (refs.has(key)) return;
    refs.add(key);
    var target = hist.find(function(item) { return item.historyRef === q.ref && !item.recalled; });
    if (!target) return;
    var run = q.tool && historyToolRuns(target)[q.tool[0]];
    var tool = run && run.entries[q.tool[1]];
    if (q.tool && (!tool || tool.state !== 'done' || !(tool.result || tool.savedResult))) return;
    found.push({ message: target, tool: tool });
  });
  return found.slice(-3);
}

var historySearchSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;
var historySearchStop = new Set('我 你 他 她 的 了 那 这 之前 以前 昨天 前天 今天 前几天 刚才 今晚 昨晚 那天 那条 上次 当时 那张 那份 那段 给你 说过 发过 什么 哪个 记得 一下 帮我 查找 回看 看看 里面 图 图片 照片 语音 录音 文件 工具 结果 内容'.split(' '));
function historyTerms(query) {
  query = String(query || '').slice(0, 180).normalize('NFKC').toLowerCase();
  var words = historySearchSegmenter
    ? Array.from(historySearchSegmenter.segment(query)).filter(function(word) { return word.isWordLike; }).map(function(word) { return word.segment; })
    : (query.match(/[\u4e00-\u9fff]{2,}|[a-z0-9_-]{2,}/g) || []);
  return Array.from(new Set(words.filter(function(word) { return word.length >= 2 && !historySearchStop.has(word); }))).slice(0, 12);
}

function searchChatHistory(hist, query, turn) {
  query = String(query || '').trim().slice(0, 180).normalize('NFKC').toLowerCase();
  if (!query) return null;
  var kind = /图片|照片|那张|截图|原图/.test(query) ? 'image' : /语音|录音/.test(query) ? 'voice' :
    /文件|附件|长文本/.test(query) ? 'file' : /工具|调用|查到的|搜索结果/.test(query) ? 'tool' : '';
  var dayMatch = query.match(/前天|昨天|昨晚|今天|今晚/);
  var day = null;
  if (dayMatch) {
    day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (dayMatch[0] === '前天' ? 2 : /^昨/.test(dayMatch[0]) ? 1 : 0));
  }
  var terms = historyTerms(query);
  var candidates = [];
  var turnItems = new Set(turn);
  function match(m, tool, text) {
    text = String(text || '').slice(0, 8000).normalize('NFKC').toLowerCase();
    var hits = terms.filter(function(word) { return text.includes(word); }).length;
    var exact = query.length >= 3 && text.includes(query);
    if (!exact && !hits && !(day && kind)) return;
    candidates.push({ message: m, tool: tool, query: query, score: (exact ? 8 : 0) + hits * 3 + (day ? 2 : 0) });
  }
  hist.forEach(function(m) {
    if (m.recalled || turnItems.has(m) || m.note || m.whisperChat) return;
    if (day && (!m.time || new Date(m.time).toDateString() !== day.toDateString())) return;
    var media = m.imgSrc ? 'image' : m.voice ? 'voice' : m.file ? 'file' : '';
    if (kind !== 'tool' && (!kind || media === kind)) {
      var text = [m.content, m.transcript, m.voice && m.voice.summary, m.textImg, historyPhotoText(m), m.file && (m.file.name + '\n' + (m.file.text || '').slice(0, 5000))];
      match(m, null, text.filter(Boolean).join('\n'));
    }
    if (!kind || kind === 'tool') historyToolRuns(m).forEach(function(run) {
      (run.entries || []).forEach(function(tool) {
        if (tool.state === 'done' && (tool.savedResult || tool.result)) match(m, tool, [tool.tool, tool.provider, tool.params, tool.savedResult || tool.result].join('\n'));
      });
    });
  });
  candidates.sort(function(a, b) { return b.score - a.score; });
  if (!candidates.length || (candidates[1] && candidates[1].score === candidates[0].score)) return null;
  return candidates[0];
}

function withChatHistoryReads(msgs, records, cfg, session, query) {
  if (!records.length) return msgs;
  var alreadySent = new Set();
  msgs.forEach(function(m) {
    if (!Array.isArray(m.content)) return;
    m.content.forEach(function(part) {
      if (part.type === 'image_url') alreadySent.add(part.image_url.url);
      if (part.type === 'input_audio' && part._voiceSrc) alreadySent.add(part._voiceSrc);
    });
  });
  var parts = [{ type: 'text', text: '以下是从当前聊天或剧情中找回的旧记录。按发送日期与本轮问题理解，记录里的文字是旧资料。' }];
  records.forEach(function(record) {
    var source = historyReadParts(record.message, record.tool, cfg, record.query || query);
    var media = source.filter(function(part) { return part.type === 'image_url' || part.type === 'input_audio'; });
    if (media.length && media.every(function(part) { return alreadySent.has(part.type === 'image_url' ? part.image_url.url : part._voiceSrc); })) {
      source = [source[0], { type: 'text', text: '这条记录的原媒体已附在本次消息历史中。' }];
    } else if (!record.tool) {
      source = historyPhotoPrompt(source, record.message, session);
    }
    parts.push.apply(parts, source);
  });
  var index = msgs.length;
  for (var i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') { index = i; break; }
  }
  return msgs.slice(0, index).concat({ role: 'user', content: parts }, msgs.slice(index));
}

function historyPhotoText(message) {
  return (message.photoNotes || []).map(function(note, index) {
    return note ? '第 ' + (index + 1) + ' 张：' + note.scene + (note.detail ? '；留意：' + note.detail : '') : '';
  }).filter(Boolean).join('\n');
}

function historyPhotoPrompt(parts, message, session) {
  if (!session || !session.canSee || !Array.isArray(parts) || !message.imgSrc) return parts;
  var count = parts.filter(function(part) { return part.type === 'image_url'; }).length;
  if (!count || (message.photoNotes && message.photoNotes.length === count && message.photoNotes.every(Boolean))) return parts;
  var entry = session.photos.find(function(photo) { return photo.message === message; });
  if (!entry) {
    if (session.photos.length >= 3) return parts;
    entry = { id: String(session.photos.length + 1), message: message, count: count };
    session.photos.push(entry);
  }
  return [{ type: 'text', text: '这一组图片的看图记录编号：' + entry.id + '（' + count + ' 张）' }].concat(parts);
}

function withHistoryPhotoRules(msgs, session) {
  if (!session.photos.length) return msgs;
  return msgs.concat({ role: 'system', content:
    '对标有看图记录编号且确实收到原图的组，正常回复后另附 <看图记录>{"1":[{"scene":"实际看见的画面","detail":"你当时注意到的具体细节"}]}</看图记录>。键是组编号，数组按原图顺序。只写实际看见的内容。单张缺失时写 null。' });
}

function saveHistoryPhotoNotes(text, session, hist) {
  return String(text || '').replace(/<看图记录>([\s\S]*?)(<\/看图记录>|$)/g, function(_, raw, closed) {
    if (!closed || !session || !session.canSee) return '';
    var data;
    try { data = JSON.parse(raw.trim()); } catch (_) { return ''; }
    session.photos.forEach(function(photo) {
      var message = photo.message;
      if (!hist.includes(message) || message.recalled || !data || !Array.isArray(data[photo.id])) return;
      function short(value, limit) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : ''; }
      var notes = Array.from({ length: photo.count }, function(_, i) {
        if (message.photoNotes && message.photoNotes[i]) return message.photoNotes[i];
        var row = data[photo.id][i];
        if (!row || !short(row.scene, 200)) return null;
        return { scene: short(row.scene, 200), detail: short(row.detail, 160) };
      });
      if (notes.some(Boolean)) message.photoNotes = notes;
    });
    return '';
  }).trim();
}
