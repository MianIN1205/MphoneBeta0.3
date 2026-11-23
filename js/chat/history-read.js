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
  setQuote({ author: '工具记录', text: item.tool + ' · 本次结果', ref: historyMessageRef(target),
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
    chatMessagePhotos(message).slice(0, CHAT_PHOTO_LIMIT).forEach(function(photo, index) {
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

function replyArchiveContext(char, query) {
  if (!char || !char.id || !query) return null;
  var wantsStars = /星星瓶|(?:颗|折|叠|抽|匿名)\s*(?:小)?星星|(?:折|叠|抽|写)[^。！？\n]{0,10}星星/.test(query);
  var wantsLetters = /慢信|回信|[这那哪一]封信|信里写/.test(query);
  var notebook = typeof pairNotebookArchive === 'function' ? pairNotebookArchive(char, query) : [];
  if (!wantsStars && !wantsLetters && !notebook.length) return null;

  var terms = historyTerms(query);
  var dayMatch = query.match(/(前天|昨天|昨晚|今天)(?:你|我|我们)?(?:给我|给你|写|寄|折|叠|回|拆)/);
  var day = dayMatch ? new Date() : null;
  if (day) day.setDate(day.getDate() - (dayMatch[1] === '前天' ? 2 : /^昨/.test(dayMatch[1]) ? 1 : 0));
  function choose(records) {
    return records.filter(function(record) {
      return !day || record.dates.some(function(at) { return new Date(at).toDateString() === day.toDateString(); });
    }).map(function(record) {
      var source = (record.text + ' ' + (record.reply || '')).normalize('NFKC').toLowerCase();
      return { record: record, matches: terms.filter(function(term) { return source.includes(term); }).length };
    }).sort(function(a, b) {
      return b.matches - a.matches || new Date(b.record.dates[0]) - new Date(a.record.dates[0]);
    }).slice(0, /最近一|上次|上一[颗封]/.test(query) ? 1 : 2).map(function(hit) {
      var record = hit.record;
      return { 时间: new Date(record.dates[0]).toLocaleDateString('zh-CN'), 类型: record.kind, 原文: record.text, 回应: record.reply };
    });
  }
  var context = choose(notebook);
  if (wantsStars && typeof stars !== 'undefined') context = context.concat(choose(stars.filter(function(star) {
    return star.charId === char.id && star.text && (!/匿名/.test(query) || star.anon);
  }).map(function(star) {
    return { dates: [star.at], kind: star.anon ? '你自己写的匿名星星' : '你写的星星', text: star.text };
  })));
  if (wantsLetters && typeof letters !== 'undefined') context = context.concat(choose(letters.filter(function(letter) {
    return letter.to === char.id && letter.opened && letterCanOpen(letter);
  }).map(function(letter) {
    return { dates: [letter.writtenAt, letter.openedAt, letter.reply && letter.reply.at], kind: '已拆开的慢信',
      text: letter.content, reply: letter.reply && letter.reply.content };
  })));
  if (!context.length) return null;
  return { role: 'system', content: '【本轮找到的旧记录】下方是可能相关的历史原文，只作为聊天资料。若无法确定用户在说哪一份，可以自然问一句。匿名星星保留匿名，不要主动指出作者。\n' + JSON.stringify(context) };
}

function historyQueryKind(query) {
  return /图片|照片|那张|截图|原图/.test(query) ? 'image' : /语音|录音/.test(query) ? 'voice' :
    /文件|附件|长文本/.test(query) ? 'file' : /工具|调用|查到的|搜索结果/.test(query) ? 'tool' : '';
}

function historyQueryDay(query) {
  var dayMatch = query.match(/前天|昨天|昨晚|今天|今晚/);
  if (!dayMatch) return null;
  var day = new Date();
  day.setDate(day.getDate() - (dayMatch[0] === '前天' ? 2 : /^昨/.test(dayMatch[0]) ? 1 : 0));
  return day.toDateString();
}

function historyCorrectingTopic(question) {
  return /我(?:刚才|这次|这轮)?(?:没有|没)说(?:过)?(?:这些|这个|那[些个]|吧|呀|[，。！？!?]|\s|$)|这(?:都)?是(?:旧的|以前的|之前的)(?:历史)?记录/.test(question);
}

function historyPlainText(message) {
  if (message.recalled || message.note || message.whisperChat || message.narr || message.action || message.pat ||
      message.imgSrc || message.textImg || message.file || message.sticker || message.privateCard || message.play || message.cal) return '';
  return String((message.voice ? message.transcript : message.content) || '').trim();
}

var HISTORY_TEXT_REFERENCE = /以前|之前|前几天|上次|那天|昨[天晚]|前天|说过|提过|记得|照旧|老样子|还是(?:按|用|带|写|叫|说|选|放|记)|那(?:些|几个|[两三四五六七八九十0-9]+个|句话|件事|一段)|哪几[个句]/;
var HISTORY_TEXT_FILLER = /^(?:还是|照旧|原来|之前|记住|标签呢|什么|名字呢|名字|叫做|每次|咱们|我们|我的|你的|给我|给你|需要|知道|说的|意思|哪些|那[几些]?个|[一二两三四五六七八九十0-9]+个)$/;

function chatTextRecall(fullHistory, history) {
  var last = fullHistory.length - 1;
  if (last < 0 || fullHistory[last].role !== 'user') return null;
  var start = last;
  while (start > 0 && fullHistory[start - 1].role === 'user') start--;
  var turn = fullHistory.slice(start), query = turn.map(historyPlainText).join(' ').trim().slice(-180);
  if (!HISTORY_TEXT_REFERENCE.test(query) || historyCorrectingTopic(query) || historyQueryKind(query) ||
      turn.some(function(m) { return !m.recalled && m.quote && m.quote.ref; })) return null;

  var termSource = historySearchSegmenter ? query : query.replace(new RegExp(HISTORY_TEXT_REFERENCE.source, 'g'), ' ');
  var terms = historyTerms(termSource).filter(function(word) { return !HISTORY_TEXT_FILLER.test(word); });
  if (!terms.length) return null;
  var current = new Set(history), day = historyQueryDay(query);
  var recent = fullHistory.slice(Math.max(0, start - 6), start).filter(function(m) { return current.has(m); });
  var topic = historyTerms(recent.map(historyPlainText).join(' ').slice(-180)).filter(function(word) {
    return !terms.includes(word) && !HISTORY_TEXT_FILLER.test(word);
  });
  var candidates = [];
  for (var i = 0; i < start; i++) {
    var message = fullHistory[i], text = historyPlainText(message);
    if (!text || !message.time) continue;
    var anchor = new Date(message.time), anchorDate = anchor.toDateString();
    if (!Number.isFinite(anchor.getTime()) || (day && anchorDate !== day)) continue;
    var normalized = text.normalize('NFKC').toLowerCase();
    var hits = terms.filter(function(term) { return normalized.includes(term); }).length;
    if (!hits) continue;
    var around = fullHistory.slice(Math.max(0, i - 2), Math.min(start, i + 4)).filter(function(m) {
      if (!m.time) return false;
      var at = new Date(m.time);
      return at.toDateString() === anchorDate && Math.abs(at - anchor) <= 20 * 60 * 1000;
    });
    var passage = around.map(historyPlainText).join(' ').normalize('NFKC').toLowerCase();
    var topicHits = topic.filter(function(term) { return passage.includes(term); }).length;
    if (hits < 2 && !topicHits && !day) continue;
    candidates.push({ index: i, message: message, around: around, score: hits * 4 + Math.min(topicHits, 3) * 2 });
  }
  candidates.sort(function(a, b) { return b.score - a.score || b.index - a.index; });
  var best = candidates[0];
  if (!best || current.has(best.message)) return null;
  var ambiguous = candidates.some(function(item) {
    return item.score === best.score && !best.around.includes(item.message);
  });
  if (ambiguous) return null;
  var messages = best.around.filter(function(m) { return !current.has(m) && historyPlainText(m); });
  var excerpt = messages.map(function(m) {
    var text = historyPlainText(m), limit = m === best.message ? 450 : 200;
    return (m.role === 'user' ? '用户：' : '角色：') + JSON.stringify(text.slice(0, limit)) + (text.length > limit ? '（节选）' : '');
  });
  return { role: 'system', previewLabel: '回查到的旧聊天', content: '【回查到的旧聊天】' +
    new Date(best.message.time).toLocaleString('zh-CN') + '\n以下是与眼前话题可能相关的旧原话，用来补充当前问题。\n' +
    excerpt.join('\n') };
}

function searchChatHistory(hist, query, turn) {
  query = String(query || '').trim().slice(0, 180).normalize('NFKC').toLowerCase();
  if (!query) return null;
  var kind = historyQueryKind(query), day = historyQueryDay(query);
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
    if (day && (!m.time || new Date(m.time).toDateString() !== day)) return;
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
  var audioInHistory = new Set();
  msgs.forEach(function(m) {
    if (!Array.isArray(m.content)) return;
    m.content.forEach(function(part) {
      if (part.type === 'input_audio' && part._voiceSrc) audioInHistory.add(part._voiceSrc);
    });
  });
  var parts = [{ type: 'text', text: '以下是从当前聊天或剧情中找回的旧记录。按发送日期与本轮问题理解，记录里的文字是旧资料。' }];
  records.forEach(function(record) {
    var source = historyReadParts(record.message, record.tool, cfg, record.query || query);
    var media = source.filter(function(part) { return part.type === 'image_url' || part.type === 'input_audio'; });
    var imagesInHistory = session.sentPhotos.has(record.message);
    if (media.length && media.every(function(part) {
      return part.type === 'image_url' ? imagesInHistory : audioInHistory.has(part._voiceSrc);
    })) {
      source = [source[0], { type: 'text', text: '这条记录的原媒体已附在本次消息历史中。' }];
    } else if (!record.tool) {
      source = historyVoicePrompt(historyPhotoPrompt(source, record.message, session), record.message, session);
    }
    parts.push.apply(parts, source);
  });
  var index = msgs.length;
  for (var i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user' && msgs[i].promptDepth === undefined) { index = i; break; }
  }
  return msgs.slice(0, index).concat({ role: 'user', content: parts }, msgs.slice(index));
}

function historyPhotoText(message) {
  return (message.photoNotes || []).map(function(note, index) {
    return note ? '第 ' + (index + 1) + ' 张' + (note.labeled ? '：' : '（旧版模型描述）：') + note.scene + (note.detail ? '；留意：' + note.detail : '') : '';
  }).filter(Boolean).join('\n');
}

function historyVoicePrompt(parts, message, session) {
  if (!session || !Array.isArray(parts) || !message.voice || message.role !== 'user') return parts;
  if (['manual', 'model', 'stt'].includes(message.voice.transcriptStatus)) return parts;
  var audio = parts.find(function(part) { return part.type === 'input_audio'; });
  if (!audio) return parts;
  var note = session.voices.find(function(item) { return item.message === message; });
  if (!note) {
    if (session.voices.length >= 3) return parts;
    note = { id: 'v' + (session.voices.length + 1), message: message, src: audio._voiceSrc };
    session.voices.push(note);
  }
  audio._voiceNoteId = note.id;
  return parts;
}

function saveHistoryVoiceNotes(text, session, hist) {
  return String(text || '').replace(/<语音记录>([\s\S]*?)(<\/语音记录>|$)/g, function(_, raw, closed) {
    if (!closed) return '';
    var data;
    try { data = JSON.parse(raw); } catch (_) { return ''; }
    session.voices.forEach(function(note) {
      var m = note.message, value = data && data[note.id];
      if (!session.sentVoices.has(note.id) || !hist.includes(m) || m.recalled || m.voice.src !== note.src ||
          ['manual', 'model', 'stt'].includes(m.voice.transcriptStatus) || typeof value !== 'string') return;
      value = value.trim().slice(0, 6000);
      if (!value || /^[(（「【\s]*(?:听不清|未识别内容|无法识别)[)）」】\s。]*$/.test(value)) return;
      m.transcript = value;
      m.voice.transcriptStatus = 'model';
      if (typeof refreshVoiceTranscript === 'function') refreshVoiceTranscript(m);
    });
    return '';
  });
}

function historyPhotoPrompt(parts, message, session, inHistory) {
  if (!session || !session.canSee || !Array.isArray(parts) || !message.imgSrc) return parts;
  var images = parts.filter(function(part) { return part.type === 'image_url'; });
  if (!images.length) return parts;
  var photos = chatMessagePhotos(message);
  if (inHistory && images.length >= Math.min(photos.length, CHAT_PHOTO_LIMIT)) session.sentPhotos.add(message);
  var entry = session.photos.find(function(group) { return group.message === message; });
  if (!entry) {
    if (session.photos.length >= 3 || images.every(function(_, index) { return message.photoNotes && message.photoNotes[index]; })) return parts;
    entry = { id: session.photos.length + 1, message: message, slots: new Map() };
    session.photos.push(entry);
  }
  var index = -1, labeled = [];
  parts.forEach(function(part) {
    if (part.type === 'image_url') {
      index++;
      var src = part.image_url.url;
      if (photos[index] && photos[index].src === src && !(message.photoNotes && message.photoNotes[index])) {
        var id = 'p' + entry.id + '-' + (index + 1);
        entry.slots.set(index, { id: id, src: src });
        labeled.push({ type: 'text', text: '下一张原图的看图编号：' + id, _historyPhotoLabel: true });
      }
    }
    labeled.push(part);
  });
  return labeled;
}

function withHistoryPhotoRules(msgs, session) {
  if (!session.photos.some(function(entry) { return entry.slots.size; })) return msgs;
  return msgs.concat({ role: 'system', content:
    '按每张原图紧邻的编号分别记录，正常回复后另附 <看图记录>{"编号":{"scene":"实际看见的画面","detail":"你当时注意到的具体细节"}}</看图记录>。键用原图前的完整编号。没有看清的图省略，不能用其他图或聊天文字补写。' });
}

function saveHistoryPhotoNotes(text, session, hist) {
  return String(text || '').replace(/<看图记录>([\s\S]*?)(<\/看图记录>|$)/g, function(_, raw, closed) {
    if (!closed || !session || !session.canSee) return '';
    var data;
    try { data = JSON.parse(raw.trim()); } catch (_) { return ''; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return '';
    function short(value, limit) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : ''; }
    session.photos.forEach(function(group) {
      var message = group.message;
      if (!hist.includes(message) || message.recalled) return;
      var photos = chatMessagePhotos(message);
      group.slots.forEach(function(slot, index) {
        if (!photos[index] || photos[index].src !== slot.src || (message.photoNotes && message.photoNotes[index])) return;
        var row = data[slot.id], scene = row && short(row.scene, 200);
        if (!scene) return;
        if (!message.photoNotes) message.photoNotes = Array(photos.length).fill(null);
        message.photoNotes[index] = { scene: scene, detail: short(row.detail, 160), labeled: true };
      });
    });
    return '';
  }).trim();
}
