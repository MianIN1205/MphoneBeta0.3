// 相处记录按角色与发生日期保存，和已经存在的人生节点共用时间线入口。
var memDays = mphoneStore.load('mphone_memory_days', {}) || {};

function memDayKey(time) {
  var date = new Date(time);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function memDayValid(key) {
  var date = memParseDate(key, 'day');
  return !!date && key === memDayKey(date.time) && key <= memDayKey(Date.now());
}

function memDayBook(char) {
  return memDays[char.id] || { days: {}, periods: [] };
}

function saveMemDays(char, book) {
  memDays[char.id] = book;
  mphoneStore.save('mphone_memory_days', memDays);
}

function memDayText(day) {
  return [day.text || ''].concat(day.notes.slice(day.reviewed || 0).map(function(note) { return note.text; })).filter(Boolean).join('\n');
}

function memDayDraft(book, date) {
  return book.days[date] || { notes: [] };
}

function memDayRule(char, history) {
  var cfg = memCfgOf(char), last = history[history.length - 1];
  if (!cfg.on || !cfg.write || !last || last.role !== 'user') return '';
  return '【相处记录】今天是 ' + memDayKey(Date.now()) + '。用户这轮讲的真实小事或共同经历，可在回复后附最多两条 <记忆 类型="当天" 时间="YYYY-MM-DD">{"记录":"具体人名、物件、经过或感受","原话":"逐字摘录本轮用户消息"}</记忆>。填事情发生日，旧事日期不明不写。略过寒暄、猜测和已记过的细节。';
}

function memDayAddFromReply(char, history, date, raw) {
  if (!memDayValid(date)) return;
  var detail;
  try { detail = JSON.parse(raw); } catch (_) { return; }
  if (!detail || typeof detail.记录 !== 'string' || typeof detail.原话 !== 'string') return;
  var text = detail.记录.trim().slice(0, 360), quote = detail.原话.trim();
  if (!text || quote.length < 2 || quote.length > 220) return;
  var source = null;
  for (var i = history.length - 1; i >= 0 && history[i].role === 'user'; i--) {
    if (historyPlainText(history[i]).includes(quote)) { source = history[i]; break; }
  }
  if (!source) return;
  var book = memDayBook(char), day = memDayDraft(book, date);
  if (day.notes.some(function(note) { return note.text === text || (note.quote === quote && note.ref === source.historyRef); })) return;
  day.notes.push({ text: text, quote: quote, ref: historyMessageRef(source), time: source.time || Date.now() });
  book.days[date] = day;
  saveMemDays(char, book);
}

function memDayRecall(char, history, included) {
  var last = history[history.length - 1];
  if (!last || last.role !== 'user') return '';
  var start = history.length - 1;
  while (start > 0 && history[start - 1].role === 'user') start--;
  var query = history.slice(start).map(historyPlainText).join(' ').trim().slice(-240);
  if (!query || historyCorrectingTopic(query)) return '';
  var explicit = query.match(/(?:(\d{4})[-年])?(\d{1,2})[-月](\d{1,2})(?:日|号)?/);
  var expected = explicit ? (explicit[1] ? explicit[1] + '-' : '') + String(explicit[2]).padStart(2, '0') + '-' + String(explicit[3]).padStart(2, '0') : '';
  var mentioned = historyQueryDay(query);
  var dateOnly = (mentioned || expected) && /[做干]了什么|我去了哪|有什么事|发生了什么|过得怎样|做了些啥/.test(query);
  var tokens = memTokens(query), best = null;
  var book = memDayBook(char);
  var present = new Set(included.filter(function(m) { return historyPlainText(m); }).map(function(m) { return m.historyRef; }));
  var withdrawn = new Set(history.filter(function(m) { return m.recalled && m.historyRef; }).map(function(m) { return m.historyRef; }));
  Object.keys(book.days).sort().reverse().forEach(function(date) {
    if ((expected && !date.endsWith(expected)) || (mentioned && new Date(date + 'T12:00:00').toDateString() !== mentioned)) return;
    var day = book.days[date];
    var notes = (day.text ? [{ text: day.text }] : []).concat(day.notes.slice(day.reviewed || 0).filter(function(note) {
      return !note.ref || (!present.has(note.ref) && !withdrawn.has(note.ref));
    }));
    var matched = notes.map(function(note) {
      return { note: note, score: memCos(tokens, memTokens(note.text + ' ' + (note.quote || ''))) };
    }).filter(function(hit) { return dateOnly || hit.score >= .16; })
      .sort(function(a, b) { return b.score - a.score; }).slice(0, 3);
    if (!matched.length || (best && best.score >= matched[0].score)) return;
    best = { date: date, score: matched[0].score, matched: matched };
  });
  if (!best && !mentioned && !expected) {
    var period = book.periods.map(function(item) { return { item: item, score: memCos(tokens, memTokens(item.text)) }; })
      .filter(function(hit) { return hit.score >= .16; }).sort(function(a, b) { return b.score - a.score; })[0];
    if (period) best = { date: period.item.from + ' 至 ' + period.item.to, matched: [{ note: period.item }] };
  }
  if (!best) return '';
  var lines = best.matched.map(function(hit) {
    return hit.note.text.slice(0, 190) + (hit.note.quote ? '（用户当时说：' + hit.note.quote.slice(0, 85) + '）' : '');
  });
  return '【那天的相处记录 · ' + best.date + '】只在与本轮相关时自然接话。\n' + lines.join('\n').slice(0, 500);
}
