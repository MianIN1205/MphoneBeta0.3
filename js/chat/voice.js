// 眠花糖机 — 语音：点麦克风弹出录音小条（按住录、松手发、滑到 ✕ 取消）、语音气泡、波形、转写

// =============================================
// 麦克风键 — 点一下弹出录音小条，按住 🎙 录音 → 语音气泡
// =============================================
var crMicBtn      = document.getElementById('crMicBtn');
var _micTimer     = null;
var _mediaRecorder= null;
var _recordStart  = 0;
var _micStream    = null;
var _micHolding   = false;
var pendingVoiceMessages = new WeakMap();

// 麦克风授权后一直保持连接，离开聊天窗口或切到后台才释放：在同一次聊天里只问一次权限
// （网页拿不到永久权限；安卓选「使用应用时允许」会被浏览器记住，iPhone 会经常重新询问）
function getMicStream() {
  if (_micStream && _micStream.getAudioTracks().some(function(t) { return t.readyState === 'live'; })) {
    return Promise.resolve(_micStream);
  }
  return navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
    _micStream = stream;
    return stream;
  });
}
function releaseMic() {
  if (_mediaRecorder && _mediaRecorder.state !== 'inactive') return;   // 正在录音时不释放
  if (_micStream) { _micStream.getTracks().forEach(function(t) { t.stop(); }); _micStream = null; }
}
new MutationObserver(function() {
  if (!appChatRoom.classList.contains('active')) releaseMic();
}).observe(appChatRoom, { attributes: true, attributeFilter: ['class'] });
document.addEventListener('visibilitychange', function() {
  if (document.hidden) releaseMic();
});

// 录音小条里的时长和波纹
var _recTimerEl    = document.getElementById('recTimer');
var _recLiveCanvas = document.getElementById('recLiveCanvas');
var _recTimerInt   = null;
var _recAnimFrame  = null;
var _recAnalyser   = null;
var _recAudioCtx   = null;

function startLiveWaveform(stream) {
  try {
    _recAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var src = _recAudioCtx.createMediaStreamSource(stream);
    _recAnalyser = _recAudioCtx.createAnalyser();
    _recAnalyser.fftSize = 64;
    src.connect(_recAnalyser);
    var bufLen = _recAnalyser.frequencyBinCount;
    var dataArr = new Uint8Array(bufLen);
    var cvs = _recLiveCanvas;
    var W = cvs.width, H = cvs.height;
    var ctx = cvs.getContext('2d');
    var k = cvs.width / (cvs.clientWidth || cvs.width);   // 高清屏上画布是两倍大，柱子跟着放大
    var BAR_W = 3 * k, GAP = 2 * k;
    var barCount = Math.floor(W / (BAR_W + GAP));
    function draw() {
      _recAnimFrame = requestAnimationFrame(draw);
      _recAnalyser.getByteFrequencyData(dataArr);
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < barCount; i++) {
        var di = Math.floor(i * bufLen / barCount);
        var norm = dataArr[di] / 255;
        var barH = Math.max(3, norm * (H - 4));
        var x = i * (BAR_W + GAP);
        var y = (H - barH) / 2;
        ctx.fillStyle = 'rgba(200,80,120,' + (0.4 + norm * 0.55) + ')';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, BAR_W, barH, 1.5);
        else { ctx.rect(x, y, BAR_W, barH); }
        ctx.fill();
      }
    }
    draw();
  } catch(e) {}
}

// 绘制竖线柱状波形（AudioBuffer）
function drawWaveform(canvas, audioBuffer) {
  var ctx  = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  var data = audioBuffer.getChannelData(0);
  var BAR_W = 2.5, GAP = 2;
  var barCount = Math.floor(W / (BAR_W + GAP));
  var step = Math.max(1, Math.floor(data.length / barCount));
  var amp = H / 2;
  for (var i = 0; i < barCount; i++) {
    var sum = 0;
    for (var j = 0; j < step; j++) sum += Math.abs(data[i * step + j] || 0);
    var avg = sum / step;
    var barH = Math.max(3, avg * amp * 8);
    barH = Math.min(barH, H - 2);
    var x = i * (BAR_W + GAP);
    var y = (H - barH) / 2;
    ctx.fillStyle = 'rgba(160,80,120,0.55)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, BAR_W, barH, 1);
    else { ctx.rect(x, y, BAR_W, barH); }
    ctx.fill();
  }
}

// 绘制随机占位竖线波形（解码失败时）
function drawFlatWaveform(canvas) {
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  var BAR_W = 2.5, GAP = 2;
  var barCount = Math.floor(W / (BAR_W + GAP));
  var amp = H / 2;
  for (var i = 0; i < barCount; i++) {
    var barH = Math.random() * amp * 0.7 + 3;
    var x = i * (BAR_W + GAP);
    var y = (H - barH) / 2;
    ctx.fillStyle = 'rgba(160,80,120,0.32)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, BAR_W, barH, 1);
    else { ctx.rect(x, y, BAR_W, barH); }
    ctx.fill();
  }
}

// 创建语音气泡并添加到消息列表
// dataURL → 字节
function dataUrlToBytes(src) {
  var b64 = String(src).split(',')[1] || '';
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function getDecodeCtx() {
  if (!window._mphoneDecodeCtx) window._mphoneDecodeCtx = new (window.AudioContext || window.webkitAudioContext)();
  return window._mphoneDecodeCtx;
}
function decodeAudioBytes(bytes) {
  return new Promise(function(resolve, reject) {
    try { getDecodeCtx().decodeAudioData(bytes.buffer.slice(0), resolve, reject); } catch (e) { reject(e); }
  });
}

// 语音消息气泡：m = { role: 'user', content: '[语音消息]', voice: { src: dataURL, dur: 秒 }, transcript }
// 返回行元素；转写区作为附属元素（删除消息时一起移除）
function createVoiceBubble(m, list, empty) {
  if (empty) empty.style.display = 'none';
  var durationSec = m.voice.dur || 1;
  var mins   = Math.floor(durationSec / 60);
  var secs   = Math.round(durationSec % 60);
  var durStr = mins + ':' + String(secs).padStart(2, '0');
  var audio  = new Audio(m.voice.src || '');

  // 气泡宽度按时长自适应（短语音 120px … ≥18s→220px）
  var bubbleW = Math.min(220, Math.max(120, 92 + durationSec * 7));

  var row = document.createElement('div');
  var role = m.role === 'assistant' ? 'ai' : 'user';
  row.className = 'chat-msg-row ' + role;
  row.appendChild(createMsgAvatar(role));

  // 气泡（点击非播放键区域 → 展开/收起转文字）
  var bubble = document.createElement('div');
  bubble.className = 'chat-msg-bubble';
  bubble.style.cssText = 'padding:8px 10px;cursor:pointer;user-select:none;-webkit-user-select:none;width:' + bubbleW + 'px;box-sizing:border-box;';

  var inner = document.createElement('div');
  inner.className = 'voice-bubble-inner';

  var playBtn = document.createElement('button');
  playBtn.className = 'voice-play-btn';
  playBtn.setAttribute('aria-label', '播放语音');
  playBtn.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" fill="rgba(160,80,120,0.85)"><polygon points="3,2 14,8 3,14"/></svg>';

  // 波形宽度 = 气泡宽 − 左右内边距 20 − 播放键 28 − 两个间距 14 − 时长 32
  var cvsW = Math.max(24, bubbleW - 94);
  var cvs = document.createElement('canvas');
  cvs.className = 'voice-waveform';
  cvs.width = cvsW; cvs.height = 28;

  var durEl = document.createElement('span');
  durEl.className = 'voice-duration';
  durEl.textContent = durStr;

  if (m.voice.src) inner.appendChild(playBtn);   // 打字发的语音没有录音，不显示播放键
  inner.appendChild(cvs);
  inner.appendChild(durEl);
  bubble.appendChild(inner);
  row.appendChild(bubble);

  // 展开时直接显示随消息保存的文字。
  var transcriptWrap = document.createElement('div');
  transcriptWrap.className = 'voice-transcript-wrap' + (m.role === 'assistant' ? ' incoming' : '');
  transcriptWrap.inert = true;
  var transcriptEl = document.createElement('div');
  transcriptEl.className = 'voice-transcript';
  transcriptEl.setAttribute('contenteditable', 'true');
  transcriptEl.setAttribute('data-placeholder', m.voice.src ? '未识别内容' : '点这里输入文字');
  transcriptEl.textContent = m.transcript || '';
  transcriptWrap.appendChild(transcriptEl);
  var transcriptStatus = document.createElement('div');
  transcriptStatus.className = 'voice-transcript-status';
  transcriptStatus.textContent = '部分转写';
  transcriptStatus.hidden = m.voice.transcriptStatus !== 'partial';
  transcriptWrap.appendChild(transcriptStatus);
  transcriptWrap.appendChild(createVoiceSummary(m, transcriptWrap));

  transcriptEl.addEventListener('blur', function() {
    var txt = this.textContent.trim();
    if (txt === (m.transcript || '')) return;
    m.transcript = txt;
    delete m.voice.transcriptStatus;
    if (!m.voice.summaryEdited) delete m.voice.summary;
    transcriptStatus.hidden = true;
    saveHistories();
  });

  // 解码绘制静态波形（结果缓存供停止播放后重绘）
  var _decoded = null;
  function drawStaticWave() {
    if (_decoded) drawWaveform(cvs, _decoded); else drawFlatWaveform(cvs);
  }
  (m.voice.src ? decodeAudioBytes(dataUrlToBytes(m.voice.src)) : Promise.reject())
    .then(function(decoded) { _decoded = decoded; drawWaveform(cvs, decoded); })
    .catch(function() { drawFlatWaveform(cvs); });

  // 播放时波纹动画
  var _waveAnim = null;
  function startWaveAnim() {
    var ctx2 = cvs.getContext('2d');
    var W = cvs.width, H = cvs.height;
    var BAR_W = 2.5, GAP = 2;
    var barCount = Math.floor(W / (BAR_W + GAP));
    var phase = 0;
    function frame() {
      if (audio.paused || audio.ended) return;
      _waveAnim = requestAnimationFrame(frame);
      phase += 0.10;
      ctx2.clearRect(0, 0, W, H);
      for (var i = 0; i < barCount; i++) {
        var wave = 0.5 + 0.5 * Math.sin(phase + i * 0.38);
        var barH = 3 + wave * (H - 8);
        var x = i * (BAR_W + GAP);
        var y = (H - barH) / 2;
        ctx2.fillStyle = 'rgba(200,80,120,' + (0.35 + wave * 0.58) + ')';
        ctx2.beginPath();
        if (ctx2.roundRect) ctx2.roundRect(x, y, BAR_W, barH, 1);
        else { ctx2.rect(x, y, BAR_W, barH); }
        ctx2.fill();
      }
    }
    _waveAnim = requestAnimationFrame(frame);
  }
  function stopWaveAnim() {
    cancelAnimationFrame(_waveAnim); _waveAnim = null;
    drawStaticWave();
  }

  // 播放 / 停止
  var _playing = false;
  var PLAY_SVG  = '<svg viewBox="0 0 16 16" width="12" height="12" fill="rgba(160,80,120,0.85)"><polygon points="3,2 14,8 3,14"/></svg>';
  var PAUSE_SVG = '<svg viewBox="0 0 16 16" width="12" height="12" fill="rgba(160,80,120,0.85)"><rect x="2" y="2" width="4" height="12"/><rect x="10" y="2" width="4" height="12"/></svg>';
  playBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (_playing) {
      audio.pause(); audio.currentTime = 0;
      playBtn.innerHTML = PLAY_SVG; _playing = false; stopWaveAnim();
    } else {
      audio.play().catch(function(){});
      playBtn.innerHTML = PAUSE_SVG; _playing = true; startWaveAnim();
    }
  });
  audio.addEventListener('ended', function() {
    playBtn.innerHTML = PLAY_SVG; _playing = false; stopWaveAnim();
  });

  // 点击波纹或时长展开文字，播放键独立操作。
  bubble.addEventListener('click', function(e) {
    if (e.target === playBtn || playBtn.contains(e.target)) return;
    transcriptWrap.inert = !transcriptWrap.classList.toggle('open');
    transcriptWrap.querySelector('.voice-summary').dispatchEvent(new Event('summaryupdate'));
    list.scrollTop = list.scrollHeight;
  });

  list.appendChild(row);
  list.appendChild(transcriptWrap);
  row._msg = m;
  row._extras = [transcriptWrap];
  list.scrollTop = list.scrollHeight;
  return row;
}

function createVoiceSummary(message, transcriptWrap) {
  var row = document.createElement('div');
  row.className = 'voice-summary voice-transcript-status';
  var label = document.createElement('span');
  var input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 200;
  input.placeholder = '写一句语音摘要';
  input.setAttribute('aria-label', '语音摘要');
  input.hidden = true;
  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'voice-summary-edit';
  var pencil = DRAMA_HEAD_ICONS.edit;
  var check = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
  function paint() {
    label.textContent = message.voice.summary ? '摘要 · ' + message.voice.summary : '摘要';
    label.hidden = !input.hidden;
    button.innerHTML = input.hidden ? pencil : check;
    button.setAttribute('aria-label', input.hidden ? '编辑语音摘要' : '保存语音摘要');
  }
  function done(save) {
    if (input.hidden) return;
    if (save) {
      var value = input.value.trim();
      if (value) message.voice.summary = value;
      else delete message.voice.summary;
      message.voice.summaryEdited = true;
      saveHistories();
    }
    input.hidden = true;
    paint();
  }
  button.addEventListener('pointerdown', function(e) { if (!input.hidden) e.preventDefault(); });
  button.addEventListener('click', function() {
    if (!input.hidden) { done(true); return; }
    input.value = message.voice.summary || '';
    input.hidden = false;
    paint();
    input.focus();
  });
  input.addEventListener('blur', function() { done(true); });
  input.addEventListener('keydown', function(e) {
    if (e.isComposing || (e.key !== 'Enter' && e.key !== 'Escape')) return;
    e.preventDefault();
    done(e.key === 'Enter');
    button.focus();
  });
  row.addEventListener('summaryupdate', function() {
    if (!transcriptWrap.classList.contains('open')) done(true);
    paint();
  });
  row.append(label, input, button);
  paint();
  return row;
}

// =============================================
// 点麦克风：输入栏上方弹出一个小条 [✕ 取消] [🎙 按住说话] [时长] [波纹] [提示]
// · 按住 🎙 开始录音，松手就发送；录音时把手指滑到左边的红色 ✕ 上再松手，就是取消
// · 再点一次麦克风、点别处、打开表情 / 加号抽屉、切到剧情，小条都会收起
// =============================================
var voicePop    = document.getElementById('voicePop');
var voiceRecBtn = document.getElementById('voiceRecBtn');
var voiceCancel = document.getElementById('voiceCancel');
var voiceHint   = document.getElementById('voiceHint');
var VOICE_HOLD_MS = 80;    // 按住这么久才开始录，免得轻点一下就录（以前 200，用户嫌前摇长）
var _voiceZone = '';   // 录音时手指停在哪：'cancel' 左边 ✕ / 'text' 右边「文」

function voiceHintText(t) { if (voiceHint) voiceHint.textContent = t; }
var voiceToText = document.getElementById('voiceToText');
// 小条最下面一行小字：提示当前模型会收到录音还是转写。
function voiceCapPaint() {
  var el = document.getElementById('voiceCap'), c = charList[openingChatCharIdx];
  var cfg = c && typeof getApiCfg === 'function' ? getApiCfg(c) : null;
  if (!cfg || !cfg.model) { el.textContent = ''; return; }
  var can = typeof llmCaps === 'function' && llmCaps(cfg).audio;
  el.textContent = can ? '这个模型可以听录音' : '这个模型会读语音转写';
}
function openVoicePop() {
  if (typeof closeCrPlusPanel === 'function') closeCrPlusPanel();
  voicePop.classList.add('open');
  crMicBtn.classList.add('active');
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) getMicStream().catch(function() {});   // 先把麦克风准备好，按下去马上就能录（第一次会在这里问权限）
  voiceHintText('按住说话');
  voiceCapPaint();
  _recTimerEl.textContent = '0:00';
  var c = _recLiveCanvas.getContext('2d'); c.clearRect(0, 0, _recLiveCanvas.width, _recLiveCanvas.height);
}
function closeVoicePop() {
  if (!voicePop.classList.contains('open')) return;
  if (_micHolding) finishRecording(false);
  voicePop.classList.remove('open');
  crMicBtn.classList.remove('active');
}
crMicBtn.addEventListener('click', function() {
  if (voicePop.classList.contains('open')) closeVoicePop(); else openVoicePop();
});
// 点小条和麦克风以外的地方：收起
document.addEventListener('pointerdown', function(e) {
  if (!voicePop.classList.contains('open') || _micHolding) return;
  if (voicePop.contains(e.target) || crMicBtn.contains(e.target)) return;
  closeVoicePop();
});
new MutationObserver(function() {
  if (!appChatRoom.classList.contains('active')) closeVoicePop();
}).observe(appChatRoom, { attributes: true, attributeFilter: ['class'] });

function startRecOverlay() {
  voicePop.classList.add('recording');
  voiceHintText(VOICE_HINT);
  if (navigator.vibrate) { try { navigator.vibrate(15); } catch (_) {} }   // 开始录了：轻轻震一下（手感）
  var t = 0;
  _recTimerEl.textContent = '0:00';
  _recTimerInt = setInterval(function() {
    t++;
    var m = Math.floor(t / 60), s = t % 60;
    _recTimerEl.textContent = m + ':' + String(s).padStart(2, '0');
  }, 1000);
}
function stopRecOverlay() {
  voicePop.classList.remove('recording');
  voiceCancel.classList.remove('armed');
  voiceToText.classList.remove('armed');
  _voiceZone = '';
  voiceHintText('按住说话');
  clearInterval(_recTimerInt);
  cancelAnimationFrame(_recAnimFrame);
  if (_recAudioCtx) { try { _recAudioCtx.close(); } catch(e){} _recAudioCtx = null; }
  _recAnalyser = null;
}

// ---------- 手机 / 浏览器自带的语音识别（保底转文字，不靠模型） ----------
// 录音的同时让浏览器边听边转成文字，存进这条语音的转写：能听音频的模型照样听录音，听不了的就用这段文字
// · 设置 → 识图与语音 →「录音时用手机自带的识别」可以关（mediaCfg.liveStt）
// · 浏览器识别不到时保留录音，转写区域显示「未识别内容」
var VoiceSR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
var _liveSR = null;
function liveSttOn() { return !!VoiceSR && mediaCfg.liveStt !== false; }
function startLiveStt() {
  _liveSR = null;
  if (!liveSttOn()) return;
  try {
    var sr = new VoiceSR();
    var capture = { recognizer: sr, finalText: '', interimText: '', interrupted: false, finishing: false };
    sr.lang = (navigator.language && /^zh/i.test(navigator.language)) ? navigator.language : 'zh-CN';
    sr.continuous = true;
    sr.interimResults = true;
    sr.onresult = function(ev) {
      var fin = '', mid = '';
      for (var i = 0; i < ev.results.length; i++) {
        var t = ev.results[i][0] ? ev.results[i][0].transcript : '';
        if (ev.results[i].isFinal) fin += t; else mid += t;
      }
      capture.finalText = fin; capture.interimText = mid;
    };
    sr.onerror = function() { capture.interrupted = true; };
    capture.done = new Promise(function(resolve) {
      sr.onend = function() {
        if (!capture.finishing) capture.interrupted = true;
        resolve();
      };
    });
    sr.start();
    _liveSR = capture;
  } catch (err) { console.warn('[Mphone] 自带语音识别没用上:', err); }
}
function stopLiveStt() {
  var capture = _liveSR;
  _liveSR = null;
  if (!capture) return Promise.resolve({ text: '' });
  capture.finishing = true;
  try { capture.recognizer.stop(); } catch (_) {}
  var timer;
  var deadline = new Promise(function(resolve) { timer = setTimeout(function() { resolve(true); }, 2000); });
  return Promise.race([capture.done, deadline]).then(function(timedOut) {
    clearTimeout(timer);
    if (timedOut) {
      try { capture.recognizer.abort(); } catch (_) {}
    }
    var text = (capture.finalText + capture.interimText).replace(/\s+/g, ' ').trim();
    return { text: text, partial: !!(capture.interimText || capture.interrupted || timedOut) };
  });
}
function abortLiveStt() {
  var capture = _liveSR;
  _liveSR = null;
  if (capture) { try { capture.recognizer.abort(); } catch (_) {} }
}

// 按住 🎙：开始录音
voiceRecBtn.addEventListener('pointerdown', function(e) {
  e.preventDefault();
  voiceRecBtn.classList.add('pressing');   // 按下去一沉
  // 捕获指针：手指滑出按钮（比如滑到 ✕ 上）也能收到松手
  try { voiceRecBtn.setPointerCapture(e.pointerId); } catch (_) {}
  _micHolding = false;
  clearTimeout(_micTimer);
  _micTimer = setTimeout(function() {
    _micHolding = true;
    getMicStream()
      .then(function(stream) {
        // 等待麦克风授权期间已经松手 → 不再开始录音
        if (!_micHolding) return;
        var recorder = new MediaRecorder(stream);
        recorder.chunks = [];
        recorder.ondataavailable = function(ev) {
          if (ev.data && ev.data.size > 0) recorder.chunks.push(ev.data);
        };
        _mediaRecorder = recorder;
        recorder.start();
        _recordStart = Date.now();
        startLiveStt();
        startRecOverlay();
        startLiveWaveform(stream);
      })
      .catch(function(err) {
        console.warn('[Mphone] 麦克风访问失败:', err);
        showToast('✗ 无法访问麦克风', 'error');
        _micHolding = false;
      });
  }, VOICE_HOLD_MS);
});
// 录音时手指在 ✕ 上（取消）还是「文」上（转成文字发）
var VOICE_HINT = '松手发送，左滑取消，右滑转文字';
voiceRecBtn.addEventListener('pointermove', function(e) {
  if (!_micHolding) return;
  var over = function(el) { var r = el.getBoundingClientRect(), pad = 12; return e.clientX >= r.left - pad && e.clientX <= r.right + pad && e.clientY >= r.top - pad && e.clientY <= r.bottom + pad; };
  var z = over(voiceCancel) ? 'cancel' : over(voiceToText) ? 'text' : '';
  if (z === _voiceZone) return;
  _voiceZone = z;
  voiceCancel.classList.toggle('armed', z === 'cancel');
  voiceToText.classList.toggle('armed', z === 'text');
  voiceHintText(z === 'cancel' ? '松手取消' : z === 'text' ? '松手转成文字发出去' : VOICE_HINT);
  if (z && navigator.vibrate) { try { navigator.vibrate(10); } catch (_) {} }
});
voiceRecBtn.addEventListener('pointerup', function() { voiceRecBtn.classList.remove('pressing'); finishRecording(_voiceZone !== 'cancel', _voiceZone === 'text'); });
voiceRecBtn.addEventListener('pointercancel', function() { voiceRecBtn.classList.remove('pressing'); finishRecording(false); });
voiceRecBtn.addEventListener('contextmenu', function(e) { e.preventDefault(); });

// 结束录音：send = true 发出去，false 丢掉；asText = 转成文字、当普通消息发（转不出来就还是发语音）
function finishRecording(send, asText) {
  clearTimeout(_micTimer);
  stopRecOverlay();
  if (!_micHolding || !_mediaRecorder || _mediaRecorder.state === 'inactive') {
    _micHolding = false; return;
  }
  _micHolding = false;
  var duration = (Date.now() - _recordStart) / 1000;
  var recorder = _mediaRecorder;
  if (!send || duration < 0.6 || openingChatCharIdx === -1) {
    abortLiveStt();
    recorder.onstop = function() {
      if (!appChatRoom.classList.contains('active') || document.hidden) releaseMic();
    };
    recorder.stop();
    if (!send) showToast('已取消', 'plain');
    else if (duration < 0.6) showToast('录音时间太短', 'error');
    return;
  }
  var time = Date.now(), quote = pendingQuote;
  var hist = getChatHistory(openingChatCharIdx);
  if (quote) clearQuote();
  var recognition = stopLiveStt();
  var audio = new Promise(function(resolve, reject) {
    recorder.onstop = function() {
      if (!appChatRoom.classList.contains('active') || document.hidden) releaseMic();
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.onerror = function() { reject(reader.error); };
      reader.readAsDataURL(new Blob(recorder.chunks, { type: (recorder.mimeType || 'audio/webm').split(';')[0] }));
    };
    recorder.stop();
  });
  var ready = Promise.all([pendingVoiceMessages.get(hist), audio, recognition]).then(function([, src, transcript]) {
    var m = { role: 'user', content: '[语音消息]', time: time };
    if (quote) m.quote = quote;
    if (asText && transcript.text) {
      m.content = transcript.text;
    } else {
      if (asText) showToast('没转出文字，先发成语音了', 'plain');
      m.voice = { src: src, dur: Math.round(duration * 10) / 10 };
      if (transcript.text) {
        m.transcript = transcript.text;
        if (transcript.partial) m.voice.transcriptStatus = 'partial';
      }
    }
    var at = hist.findIndex(function(item) { return item.time > time; });
    if (at < 0) hist.push(m);
    else hist.splice(at, 0, m);
    saveHistories();
    if (appChatRoom.classList.contains('active') && openingChatCharIdx >= 0 && hist === getActiveHistory(openingChatCharIdx)) {
      if (at < 0) renderHistMsg(m, document.getElementById('chatMsgList'), document.getElementById('chatRoomEmpty'));
      else renderRoomLists(openingChatCharIdx);
    }
  }).catch(function(err) {
    console.warn('[Mphone] 保存语音失败:', err);
    showToast('语音没能保存', 'error');
  });
  pendingVoiceMessages.set(hist, ready);
  ready.then(function() {
    if (pendingVoiceMessages.get(hist) === ready) pendingVoiceMessages.delete(hist);
  });
}
