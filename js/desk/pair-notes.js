// 「留给彼此」从私聊打开，「小本子」在书架上读的是同一份。
(function() {
  var records = mphoneStore.load('mphone_pair_notes', []);
  if (!Array.isArray(records)) records = [];
  var selected = '', mode = 'home', fromShelf = false, day = '';
  var busy = new Set();
  var prompts = [
    '你最记得我随口说过的什么？',
    '哪件小事会让你突然想起我？',
    '如果把今天夹进书里，你会夹进去什么？',
    '有没有一句当时没说完的话，现在还想告诉我？',
    '如果能把这周的一个小时留起来，你会选哪一个？',
    '你想让我看看你生活里哪个平常的角落？',
    '我们一起待着的时候，什么时候最像在家？',
    '如果要做一张只给我听的歌单，你会把哪首放在第一首？',
    '我做过什么小事，让你觉得被记在心上了？',
    '下次见面，你想一起做哪件很普通的小事？',
    '有没有一个味道，让你想起我们聊过的事？',
    '你想给下个月的我们留一句什么话？'
  ];
  var el = function(id) { return document.getElementById(id); };
  var screen = el('appPairNotes'), title = el('pairTitle'), charPicker = el('pairCharacter');
  var noteInput = el('pairNoteText'), questionInput = el('pairQuestionText'), answerInput = el('pairAnswerText');
  var noteAsk = el('pairNoteAsk'), questionAsk = el('pairQuestionAsk'), pinButton = el('pairQuestionPin');
  var views = { home: el('pairHome'), notes: el('pairNotebook'), question: el('pairQuestion') };
  function today() { return letterDateVal(Date.now()); }
  function save() { mphoneStore.save('mphone_pair_notes', records); }
  function currentChar() { return charList.find(function(char) { return char.id === selected && !char.isGroup; }); }
  function bookOf(charId) { return records.find(function(record) { return record.charId === charId; }); }
  function currentBook() {
    var book = bookOf(selected);
    if (!book) {
      book = { charId: selected, notes: {}, pins: [] };
      records.push(book);
    }
    return book;
  }
  function displayName(char) { return char.charAlias || char.charName || 'TA'; }
  function pageDays(book, visibleDay) {
    return Array.from(new Set([today(), visibleDay].concat(Object.keys(book.notes), book.pins.map(function(q) { return q.day; })).filter(Boolean))).sort();
  }
  function jobKey(book, item) { return JSON.stringify([book.charId, item]); }
  function setReply(container, char, text) {
    container.hidden = !text;
    container.querySelector('b').textContent = displayName(char) + '写的';
    container.querySelector('p').textContent = text || '';
  }
  function newQuestion(before) {
    var options = prompts.filter(function(prompt) { return prompt !== before; });
    return { id: genFeedId('pq'), day: today(), prompt: options[Math.floor(Math.random() * options.length)], mine: '' };
  }
  function showPins(book) {
    var list = el('pairPinned');
    list.replaceChildren();
    book.pins.filter(function(q) { return q.day === day; }).forEach(function(q) {
      var card = document.createElement('details'), summary = document.createElement('summary');
      card.className = 'pair-paper pair-pin';
      summary.textContent = q.prompt;
      card.appendChild(summary);
      [q.mine && ['我的回答', q.mine], q.theirs && [displayName(currentChar()) + '的回答', q.theirs]].filter(Boolean).forEach(function(item) {
        var block = document.createElement('div'), tag = document.createElement('b'), text = document.createElement('p');
        block.className = 'pair-reply';
        tag.textContent = item[0];
        text.textContent = item[1];
        block.append(tag, text);
        card.appendChild(block);
      });
      list.appendChild(card);
    });
  }
  function paint() {
    var char = currentChar();
    title.textContent = mode === 'home' ? '留给彼此' : mode === 'notes' ? '小本子' : '想问你';
    Object.keys(views).forEach(function(key) { views[key].hidden = !char || mode !== key; });
    el('pairEmpty').hidden = !!char;
    var person = screen.querySelector('.pair-person');
    person.hidden = !char;
    if (!char) return;
    paintCharAvatar(person.querySelector('.pair-avatar'), char);
    charPicker.hidden = !fromShelf || charPicker.options.length < 2;
    el('pairName').hidden = !charPicker.hidden;
    el('pairName').textContent = displayName(char);
    var book = currentBook();
    if (mode === 'notes') {
      var days = pageDays(book, day), note = book.notes[day], pos = days.indexOf(day);
      el('pairDayLabel').textContent = (day === today() ? '今天 · ' : '') + day.replace(/-/g, '.');
      el('pairDayPrev').disabled = pos <= 0;
      el('pairDayNext').disabled = pos >= days.length - 1;
      var writing = busy.has(jobKey(book, day));
      noteInput.disabled = writing;
      el('pairNoteSave').disabled = writing;
      noteAsk.disabled = writing;
      noteAsk.textContent = writing ? 'TA 正在写…' : note && note.reply ? '请 TA 再添几句' : '请 TA 添几句';
      noteInput.value = note ? note.text : '';
      setReply(el('pairNoteReply'), char, note && note.reply);
      el('pairNoteStatus').textContent = note && note.sharedText ? 'TA 看过你上次邀请时的文字。' : '只留在本机，邀请 TA 时才分享。';
      showPins(book);
    } else if (mode === 'question') {
      var q = book.question || (book.question = newQuestion(''));
      var asking = busy.has(jobKey(book, q.id));
      var pinned = book.pins.find(function(pin) { return pin.id === q.id; });
      questionInput.value = q.prompt;
      answerInput.value = q.mine || '';
      questionInput.readOnly = asking || !!q.theirs;
      answerInput.disabled = asking;
      el('pairQuestionNext').disabled = asking;
      questionAsk.hidden = !!q.theirs;
      questionAsk.disabled = asking;
      questionAsk.textContent = asking ? 'TA 正在想…' : '请 TA 回答';
      pinButton.hidden = !q.theirs;
      pinButton.textContent = pinned ? '更新到小本子' : '夹进小本子';
      el('pairQuestionStatus').textContent = pinned ? '已夹进 ' + pinned.day.replace(/-/g, '.') + ' 那一页。' :
        q.theirs ? '夹进去后，TA 聊天时也能回看你写的答案。' : '';
      setReply(el('pairQuestionReply'), char, q.theirs);
    }
  }
  function open(charId) {
    var chars = charList.filter(function(char) { return char.id && !char.isGroup; });
    fromShelf = !charId;
    var previous = mphoneStore.load('mphone_pair_shelf_char', '');
    var char = chars.find(function(c) { return c.id === (charId || previous); }) || chars[0];
    selected = char ? char.id : '';
    if (!fromShelf && char) mphoneStore.save('mphone_pair_shelf_char', selected);
    charPicker.replaceChildren();
    chars.forEach(function(c) {
      var option = document.createElement('option');
      option.value = c.id;
      option.textContent = displayName(c);
      charPicker.appendChild(option);
    });
    charPicker.value = selected;
    mode = fromShelf ? 'notes' : 'home';
    var book = char && bookOf(selected);
    day = fromShelf && book && book.lastDay && pageDays(book).includes(book.lastDay) ? book.lastDay : today();
    screen.classList.add('active');
    paint();
  }
  function noteSave() {
    var book = currentBook(), text = noteInput.value.trim(), note = book.notes[day];
    if (!note && !text) return null;
    if (!note) note = book.notes[day] = {};
    if (!text && !note.reply && !note.sharedText) {
      delete book.notes[day];
      save();
      return null;
    }
    note.text = text;
    book.lastDay = day;
    save();
    return note;
  }
  function saveQuestionDraft() {
    var q = currentBook().question;
    var prompt = questionInput.value.trim();
    if (!q.theirs && prompt) q.prompt = prompt;
    q.mine = answerInput.value.trim();
    save();
    return q;
  }
  async function ask(char, key, instruction, onReply, refresh) {
    if (busy.has(key)) return;
    var cfg = getApiCfg(char);
    if (!cfg.url || !cfg.key || !cfg.model) { showToast('配置模型后就能请 TA 回答', 'plain'); return; }
    busy.add(key);
    paint();
    try {
      var idx = findCharIdx(char.id);
      var answer = await callApiOnce(charContextMsgs(idx).concat(activityAsk(instruction)), char);
      if (findCharIdx(char.id) < 0) return;
      onReply(String(answer).trim());
      save();
    } catch (err) {
      showToast('TA 这次没写出来 · ' + explainError(err).title, 'error');
    } finally {
      busy.delete(key);
      if (refresh()) paint();
    }
  }

  el('backPairNotes').addEventListener('click', function() {
    if (mode === 'notes' && fromShelf && currentChar()) {
      currentBook().lastDay = day;
      mphoneStore.save('mphone_pair_shelf_char', selected);
      save();
    }
    if (fromShelf || mode === 'home') screen.classList.remove('active');
    else { mode = 'home'; paint(); }
  });
  charPicker.addEventListener('change', function() {
    selected = this.value;
    var book = currentBook();
    day = pageDays(book).includes(book.lastDay) ? book.lastDay : today();
    mphoneStore.save('mphone_pair_shelf_char', selected);
    paint();
  });
  el('pairOpenNotebook').addEventListener('click', function() { mode = 'notes'; day = today(); paint(); });
  el('pairOpenQuestion').addEventListener('click', function() { mode = 'question'; paint(); });
  el('pairOpenLetter').addEventListener('click', function() { openLetterWriter(selected); });
  [['pairDayPrev', -1], ['pairDayNext', 1]].forEach(function(step) {
    el(step[0]).addEventListener('click', function() {
      var book = currentBook(), days = pageDays(book, day);
      day = days[days.indexOf(day) + step[1]] || today();
      book.lastDay = day;
      save();
      paint();
    });
  });
  noteInput.addEventListener('change', noteSave);
  el('pairNoteSave').addEventListener('click', function() {
    if (!noteSave()) { shakeEl(noteInput); return; }
    el('pairNoteStatus').textContent = '已保存到小本子。';
  });
  noteAsk.addEventListener('click', function() {
    var book = currentBook(), char = currentChar(), note = noteSave(), date = day;
    if (!note || !note.text) { shakeEl(noteInput); return; }
    var shared = note.text;
    ask(char, jobKey(book, date), '【小本子】用户邀请你给 ' + date + ' 这一页添几句。先读用户写的原文：\n' + JSON.stringify(shared) +
      '\n写一小段你想留在这一页的话，用你平时的口吻，接住具体细节。只输出你写的内容，约 60–180 字。', function(text) {
      note.sharedText = shared;
      note.reply = note.reply ? note.reply + '\n\n' + text : text;
    }, function() { return selected === book.charId && mode === 'notes' && day === date; });
  });
  questionInput.addEventListener('change', saveQuestionDraft);
  answerInput.addEventListener('change', saveQuestionDraft);
  el('pairQuestionNext').addEventListener('click', function() {
    var book = currentBook(), q = saveQuestionDraft();
    var replace = function() { book.question = newQuestion(q.prompt); save(); paint(); };
    if ((q.mine || q.theirs) && !book.pins.some(function(pin) { return pin.id === q.id && pin.mine === q.mine; })) {
      openConfirm('换一道题？本题的回答还没夹进小本子。', replace);
    } else replace();
  });
  questionAsk.addEventListener('click', function() {
    if (!questionInput.value.trim()) { shakeEl(questionInput); return; }
    var book = currentBook(), char = currentChar(), q = saveQuestionDraft();
    var prompt = q.prompt, mine = q.mine;
    ask(char, jobKey(book, q.id), '【想问你】请以你自己的身份回答这道题：\n' + JSON.stringify(prompt) +
      (mine ? '\n用户先写了自己的答案：\n' + JSON.stringify(mine) : '') +
      '\n像平时那样说话，具体一点，只输出你的回答，约 40–160 字。', function(text) {
      q.theirs = text;
      q.sharedMine = mine;
    }, function() { return selected === book.charId && mode === 'question' && book.question === q; });
  });
  pinButton.addEventListener('click', function() {
    var book = currentBook(), q = saveQuestionDraft();
    if (!q.theirs) return;
    var index = book.pins.findIndex(function(pin) { return pin.id === q.id; });
    var pin = { id: q.id, day: index >= 0 ? book.pins[index].day : today(), prompt: q.prompt, mine: q.mine, theirs: q.theirs };
    if (index >= 0) book.pins[index] = pin;
    else book.pins.push(pin);
    save();
    paint();
  });

  window.openPairNotes = open;
  window.pairNotebookArchive = function(char, query) {
    if (!/小本子|想问你|一起写的|夹进|那(?:道题|[个道]问题)|上次问/.test(query)) return [];
    var book = bookOf(char.id);
    if (!book) return [];
    var entries = Object.keys(book.notes).filter(function(date) { return book.notes[date].sharedText; }).map(function(date) {
      var note = book.notes[date];
      return { dates: [date + 'T12:00:00'], kind: '一起写的小本子', text: note.sharedText, reply: note.reply };
    });
    entries = entries.concat(book.pins.map(function(q) {
      return { dates: [q.day + 'T12:00:00'], kind: '夹进小本子的问题', text: q.prompt + (q.mine ? '\n用户的回答：' + q.mine : ''), reply: q.theirs };
    }));
    var q = book.question;
    if (q && q.theirs && !book.pins.some(function(pin) { return pin.id === q.id; })) {
      entries.push({ dates: [q.day + 'T12:00:00'], kind: '想问你的问题', text: q.prompt + (q.sharedMine ? '\n用户的回答：' + q.sharedMine : ''), reply: q.theirs });
    }
    return entries;
  };
})();
