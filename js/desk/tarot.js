// 同一副大阿卡纳牌库供聊天工具和一起解牌使用。
(function() {
  var get = function(id) { return document.getElementById(id); };
  var screen = get('appTarot'), input = get('tarotQuestion'), reverse = get('tarotReverse');
  var draw = get('tarotDraw'), ask = get('tarotAsk'), cardsEl = get('tarotCards');
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
  var romans = '0 I II III IV V VI VII VIII IX X XI XII XIII XIV XV XVI XVII XVIII XIX XX XXI'.split(' ');
  var sessions = new Map(), char = null, current = null;

  function nameOf(role) { return role.charAlias || role.charName || 'TA'; }
  function position(reading, index) { return spreads[reading.cards.length][index]; }
  function orientation(card) { return card.reversed ? '逆位' : '正位'; }

  function showCard(reading) {
    var card = reading.cards[reading.selected];
    var index = MB_TAROT.findIndex(function(row) { return row[0] === card.name; });
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

  function paintReading() {
    var reading = current.reading, question = get('tarotDrawnQuestion');
    get('tarotResult').hidden = !reading;
    draw.textContent = reading ? '重新抽牌' : '翻牌';
    if (!reading) return;
    question.hidden = !reading.question;
    question.textContent = '这次问的是「' + reading.question + '」';
    cardsEl.replaceChildren();
    cardsEl.classList.toggle('single', reading.cards.length === 1);
    reading.cards.forEach(function(card, index) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'tarot-card';
      button.innerHTML = '<span class="tarot-position"></span><span class="tarot-face"><span class="tarot-number"></span><span class="tarot-mark" aria-hidden="true">✧</span><b></b><small></small></span>';
      button.querySelector('.tarot-position').textContent = position(reading, index).title;
      button.querySelector('.tarot-number').textContent = romans[MB_TAROT.findIndex(function(row) { return row[0] === card.name; })];
      button.querySelector('b').textContent = card.name;
      button.querySelector('small').textContent = orientation(card);
      button.classList.toggle('reversed', card.reversed);
      button.addEventListener('click', function() { reading.selected = index; showCard(reading); });
      cardsEl.appendChild(button);
    });
    showCard(reading);
    paintAnswer();
  }

  function updateCounts() {
    counts.forEach(function(button) {
      button.setAttribute('aria-pressed', String(+button.dataset.tarotCount === current.count));
    });
  }

  window.openTarotReading = function(role) {
    if (!role || role.isGroup) return;
    char = role;
    if (!sessions.has(role.id)) sessions.set(role.id, { count: 1, reverse: true, question: '', reading: null });
    current = sessions.get(role.id);
    get('tarotPartner').textContent = '和' + nameOf(role) + '一起看';
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
  draw.addEventListener('click', function() {
    current.reading = { question: input.value.trim(), cards: drawTarotCards(current.count, reverse.checked), selected: 0 };
    paintReading();
  });

  ask.addEventListener('click', async function() {
    var role = char, session = current, reading = session.reading;
    if (!reading || reading.busy || reading.answer) return;
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
        '。牌面：' + JSON.stringify(spread) +
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
