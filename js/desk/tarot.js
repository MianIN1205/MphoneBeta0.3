// 占卜里的大阿卡纳牌库。抽牌只在本机进行。
(function() {
  var deck = [
    ['愚者', '新的开始、自由、冒险', '鲁莽、犹豫不决'], ['魔术师', '创造力、行动、自信', '欺骗、能力没用对地方'], ['女祭司', '直觉、秘密、内在的智慧', '忽视直觉、只看表面'],
    ['皇后', '丰盛、温柔、滋养', '依赖、停滞'], ['皇帝', '稳定、掌控、责任', '固执、控制欲'], ['教皇', '传统、指引、信念', '打破常规、质疑'],
    ['恋人', '爱、选择、和谐', '分歧、诱惑'], ['战车', '意志、前进、胜利', '失控、迷失方向'], ['力量', '勇气、温柔的力量、耐心', '自我怀疑、软弱'],
    ['隐士', '独处、内省、寻找答案', '孤立、逃避'], ['命运之轮', '转机、好运、循环', '不顺、抗拒变化'], ['正义', '公平、真相、因果', '不公、逃避责任'],
    ['倒吊人', '换个角度、等待、放下', '拖延、白白牺牲'], ['死神', '结束与新生、转变', '抗拒改变、停滞'], ['节制', '平衡、调和、耐心', '失衡、过度'],
    ['恶魔', '束缚、欲望、执念', '挣脱、觉醒'], ['高塔', '突变、打破、觉醒', '躲过风波、害怕改变'], ['星星', '希望、治愈、灵感', '失望、信心不足'],
    ['月亮', '不安、幻象、潜意识', '迷雾散去、真相浮现'], ['太阳', '快乐、成功、温暖', '短暂的低落、过度乐观'], ['审判', '重生、召唤、反思', '自我怀疑、不肯面对'],
    ['世界', '圆满、完成、旅程的终点', '还差一步、未完成']
  ];
  var get = function(id) { return document.getElementById(id); };
  var screen = get('appTarot'), input = get('tarotQuestion'), reverse = get('tarotReverse');
  var draw = get('tarotDraw'), ask = get('tarotAsk'), cardsEl = get('tarotCards');
  var pick = get('tarotPick'), backs = get('tarotBacks'), own = get('tarotOwnText');
  var counts = screen.querySelectorAll('[data-tarot-count]');
  var spreads = {
    1: [{ title: '这张牌', prompt: '它照见了问题的哪个侧面？' }],
    3: [
      { title: '现状', prompt: '这个关键词在哪里已经发生了？' },
      { title: '阻碍', prompt: '它提醒你哪个环节卡住了？' },
      { title: '下一步', prompt: '能把这个提醒变成哪个小行动？' }
    ]
  };
  var starters = [
    '有什么事值得你小小地试一次？', '手边已经有什么资源可以用？', '安静下来以后，你最先注意到什么？',
    '什么能让你觉得被照顾到了？', '哪一条界限会让你更安心？', '你在沿用谁给你的办法？',
    '两个选择里，你更在乎的是哪件事？', '你现在真正想往哪里走？', '哪件事可以用更温柔的方式坚持？',
    '独处一会儿，你想理清哪件事？', '哪一部分在变化，哪一部分你能掌握？', '还有哪个事实需要确认？',
    '换到另一边看，这件事会是什么样？', '有什么可以放下，给新的东西留空？', '什么地方可以把力气分得匀一点？',
    '哪个习惯让你总是绕回来？', '眼下什么松动了，什么还站得住？', '哪一点希望已经有了迹象？',
    '哪些是事实，哪些是你还没验证的猜测？', '哪一点小事让你感到轻松？', '现在回头看，你有了什么新理解？',
    '哪一步已经完成，值得好好记一下？'
  ];
  var sessions = new Map(), char = null, current = null, chat = null;

  function nameOf(role) { return role.charAlias || role.charName || 'TA'; }
  function position(reading, index) { return spreads[reading.cards.length][index]; }
  function orientation(card) { return card.reversed ? '逆位' : '正位'; }
  function artPath(card) { return 'icons/tarot/' + String(card.index).padStart(2, '0') + '.jpg'; }
  function allRevealed(reading) { return reading.stage === 'reveal' && reading.revealed.every(Boolean); }

  function showCard(reading) {
    var card = reading.cards[reading.selected];
    var index = card.index;
    get('tarotCardName').textContent = card.name + ' · ' + orientation(card);
    get('tarotKeywords').textContent = card.keywords;
    var spot = position(reading, reading.selected);
    get('tarotCardTip').textContent = (reading.cards.length === 1 ? '' : spot.prompt + ' ') + (starters[index] || '');
    cardsEl.querySelectorAll('button').forEach(function(button, i) {
      button.setAttribute('aria-pressed', String(i === reading.selected));
    });
  }

  function paintAnswer() {
    var reading = current.reading, box = get('tarotAnswer');
    ask.disabled = !!reading.busy;
    ask.hidden = !!reading.answer;
    ask.textContent = reading.busy ? nameOf(char) + '正在看牌…' : '请' + nameOf(char) + '解牌';
    get('tarotStatus').textContent = reading.status || '';
    box.hidden = !reading.answer;
    box.querySelector('h2').textContent = nameOf(char) + '的解读';
    box.querySelector('p').textContent = reading.answer || '';
  }

  function paintReading(flippedIndex) {
    var reading = current.reading, question = get('tarotDrawnQuestion');
    var ready = !!reading && reading.stage === 'reveal';
    get('tarotResult').hidden = !ready;
    pick.hidden = !reading || ready;
    if (!reading) return;
    if (!ready) { paintBacks(reading); return; }
    question.hidden = false;
    question.textContent = reading.drawnBy + '抽牌' + (reading.question ? ' · 「' + reading.question + '」' : '');
    cardsEl.replaceChildren();
    cardsEl.classList.toggle('single', reading.cards.length === 1);
    reading.cards.forEach(function(card, index) {
      var revealed = reading.revealed[index], spot = position(reading, index).title;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'tarot-card';
      button.innerHTML = '<span class="tarot-position"></span><span class="tarot-face"></span><span class="tarot-card-caption"></span>';
      button.querySelector('.tarot-position').textContent = spot;
      var face = button.querySelector('.tarot-face'), caption = button.querySelector('.tarot-card-caption');
      if (revealed) {
        if (index === flippedIndex) face.classList.add('tarot-flipping');
        var art = document.createElement('img');
        art.src = artPath(card);
        art.alt = '';
        if (card.reversed) art.classList.add('reversed');
        face.appendChild(art);
        caption.textContent = card.name + ' · ' + orientation(card);
      } else {
        face.classList.add('tarot-pattern');
        face.textContent = '✧';
        caption.textContent = '点此翻牌';
      }
      button.addEventListener('click', function() {
        reading.selected = index;
        get('tarotHints').open = false;
        if (revealed) { showCard(reading); return; }
        reading.revealed[index] = true;
        var keepFocus = document.activeElement === button;
        paintReading(index);
        if (keepFocus) cardsEl.children[index].focus({ preventScroll: true });
      });
      cardsEl.appendChild(button);
    });
    get('tarotMeaning').hidden = reading.selected < 0;
    get('tarotInterpret').hidden = !allRevealed(reading);
    get('tarotShare').hidden = !allRevealed(reading);
    if (reading.selected >= 0) showCard(reading);
    own.value = reading.mine || '';
    paintOwn(reading);
    paintAnswer();
  }

  function paintOwn(reading) {
    get('tarotOwnReading').hidden = !allRevealed(reading) || !reading.ownOpen;
    get('tarotWrite').setAttribute('aria-expanded', String(!!reading.ownOpen));
  }

  function drawCards(count, allowReversed) {
    var pool = deck.map(function(_, index) { return index; });
    return Array.from({ length: count }, function() {
      var i = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      var reversed = allowReversed && Math.random() < .5;
      return { index: i, name: deck[i][0], reversed: reversed, keywords: deck[i][reversed ? 2 : 1] };
    });
  }

  function paintPickProgress(reading) {
    get('tarotPickHint').textContent = '从牌桌选 ' + reading.count + ' 张 · 已选 ' + reading.cards.length + '/' + reading.count;
  }

  function paintBacks(reading) {
    var shuffling = reading.stage === 'shuffle';
    get('tarotLay').hidden = !shuffling;
    backs.classList.toggle('shuffling', shuffling);
    backs.replaceChildren();
    backs.scrollLeft = 0;
    if (shuffling) {
      get('tarotPickHint').textContent = '洗好了。准备好就把牌摊开。';
      for (var i = 0; i < 3; i++) {
        var back = document.createElement('span');
        back.className = 'tarot-back tarot-pattern';
        back.textContent = '✧';
        back.setAttribute('aria-hidden', 'true');
        backs.appendChild(back);
      }
      return;
    }
    paintPickProgress(reading);
    reading.pool.forEach(function(card, i) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'tarot-back tarot-pattern';
      button.textContent = '✧';
      button.disabled = reading.cards.includes(card);
      button.setAttribute('aria-label', '第 ' + (i + 1) + ' 张牌背');
      button.addEventListener('click', function() {
        if (reading.cards.includes(card) || reading.cards.length >= reading.count) return;
        reading.cards.push(card);
        if (reading.cards.length === reading.count) {
          reading.stage = 'reveal';
          paintReading();
          return;
        }
        button.disabled = true;
        paintPickProgress(reading);
      });
      backs.appendChild(button);
    });
  }

  function startDraw(self) {
    var count = current.count;
    current.reading = {
      question: input.value.trim(), drawnBy: self ? '我' : nameOf(char), count: count,
      self: self, stage: 'shuffle', pool: drawCards(deck.length, reverse.checked), cards: [],
      revealed: Array(count).fill(false), selected: -1
    };
    get('tarotHints').open = false;
    paintReading();
  }

  function updateCounts() {
    counts.forEach(function(button) {
      button.setAttribute('aria-pressed', String(+button.dataset.tarotCount === current.count));
    });
  }

  window.openTarotReading = function(role) {
    if (!role || role.isGroup) return;
    char = role;
    chat = privatePlusContext();
    if (!sessions.has(role.id)) sessions.set(role.id, { count: 1, reverse: true, question: '', reading: null });
    current = sessions.get(role.id);
    get('tarotPartner').textContent = '和' + nameOf(role) + '一起看';
    get('tarotDrawForMe').textContent = '让' + nameOf(role) + '抽牌';
    paintCharAvatar(screen.querySelector('.tarot-person span'), role);
    input.value = current.question;
    reverse.checked = current.reverse;
    screen.querySelector('.tarot-body').scrollTop = 0;
    updateCounts();
    paintReading();
    screen.classList.add('active');
  };

  get('backTarot').addEventListener('click', function() { screen.classList.remove('active'); });
  input.addEventListener('input', function() { current.question = input.value; });
  reverse.addEventListener('change', function() { current.reverse = reverse.checked; });
  counts.forEach(function(button) {
    button.addEventListener('click', function() { current.count = +button.dataset.tarotCount; updateCounts(); });
  });
  draw.addEventListener('click', function() { startDraw(true); });
  get('tarotDrawForMe').addEventListener('click', function() { startDraw(false); });
  get('tarotLay').addEventListener('click', function() {
    var reading = current.reading;
    if (!reading || reading.stage !== 'shuffle') return;
    reading.stage = reading.self ? 'pick' : 'reveal';
    if (!reading.self) reading.cards = reading.pool.slice(0, reading.count);
    paintReading();
  });
  get('tarotZoom').addEventListener('click', function() {
    var card = current.reading.cards[current.reading.selected];
    openImgViewer(artPath(card), { preview: true, rotation: card.reversed ? 180 : 0 });
  });
  get('tarotWrite').addEventListener('click', function() {
    var reading = current.reading;
    reading.ownOpen = !reading.ownOpen;
    paintOwn(reading);
  });
  own.addEventListener('input', function() { current.reading.mine = own.value; });

  get('tarotShare').addEventListener('click', function() {
    var reading = current.reading;
    if (!reading || !allRevealed(reading) || !chat || chat.char !== char || !privatePlusCurrent(chat)) return;
    var cards = reading.cards.map(function(card, i) {
      return { position: position(reading, i).title, name: card.name, orientation: orientation(card), keywords: card.keywords };
    });
    var share = { kind: 'tarot', question: reading.question, drawnBy: reading.drawnBy, cards: cards, mine: (reading.mine || '').trim(),
      reader: nameOf(char), answer: reading.answer || '' };
    privatePlusPush(chat, share, formatTarotShare(share));
    screen.classList.remove('active');
    crStick(getActiveMsgListEl());
    if (typeof markChatActive === 'function') markChatActive();
  });

  ask.addEventListener('click', async function() {
    var role = char, session = current, reading = session.reading;
    if (!reading || !allRevealed(reading) || reading.busy || reading.answer) return;
    var index = findCharIdx(role.id), cfg = getApiCfg(role);
    if (index < 0 || !cfg.url || !cfg.key || !cfg.model) {
      showToast('配置主 API 并选好模型后，就能请 TA 解牌', 'plain');
      return;
    }
    reading.busy = true;
    reading.status = '';
    paintAnswer();
    var spread = reading.cards.map(function(card, i) {
      return { 牌位: position(reading, i).title, 牌: card.name, 方向: orientation(card), 提示: card.keywords };
    });
    try {
      reading.answer = await callApiOnce(charContextMsgs(index).concat(activityAsk(
        '【一起解牌】用户想和你一起解这次已经抽好的塔罗牌。问题：' + JSON.stringify(reading.question || '未指定，作为今天的反思') +
        '。牌面：' + JSON.stringify(spread) + (reading.mine && reading.mine.trim() ? '。用户自己的解读：' + JSON.stringify(reading.mine.trim()) : '') +
        '。把问题和对应牌位合起来说，每张只挑一个关键词，用自己的口吻给初学者讲清楚；最后给一个可以试的小行动或一个值得想的问题。逆位用来探索卡点。把牌当成反思的线索，避免断言未来、替用户做决定。不要重抽。约 120–260 字。'
      )), role);
    } catch (err) {
      reading.status = '这次没能解牌 · ' + explainError(err).title;
    } finally {
      reading.busy = false;
      if (current === session && session.reading === reading) paintAnswer();
    }
  });
})();

function tarotShareLines(card) {
  return card.cards.map(function(item) {
    return item.position + ' · ' + item.name + '（' + item.orientation + '）';
  });
}
function formatTarotShare(card) {
  return ['【塔罗 · ' + card.drawnBy + '抽牌】', card.question ? '问题：' + card.question : '']
    .concat(tarotShareLines(card).map(function(line, i) { return line + '：' + card.cards[i].keywords; }))
    .concat(card.mine ? '我的解读：' + card.mine : '', card.answer ? card.reader + '的解读：' + card.answer : '')
    .filter(Boolean).join('\n');
}
function renderTarotShare(bubble, card) {
  var label = document.createElement('strong'), list = document.createElement('div');
  bubble.classList.add('tarot-share-card');
  label.textContent = '塔罗 · ' + card.drawnBy + '抽牌';
  list.className = 'tarot-share-lines';
  list.textContent = tarotShareLines(card).join('\n');
  var details = document.createElement('details'), summary = document.createElement('summary');
  summary.textContent = '查看牌义与解读';
  details.appendChild(summary);
  var keywords = document.createElement('div');
  keywords.textContent = card.cards.map(function(item) { return item.name + ' · ' + item.keywords; }).join('\n');
  details.appendChild(keywords);
  [card.mine ? '我的解读：' + card.mine : '', card.answer ? card.reader + '的解读：' + card.answer : ''].filter(Boolean).forEach(function(reading) {
    var text = document.createElement('div');
    text.textContent = reading;
    details.appendChild(text);
  });
  bubble.replaceChildren(label);
  if (card.question) {
    var question = document.createElement('div');
    question.className = 'tarot-share-question';
    question.textContent = card.question;
    bubble.appendChild(question);
  }
  bubble.append(list, details);
}
