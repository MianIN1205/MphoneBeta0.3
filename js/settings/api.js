// 眠花糖机 — 设置页：打开 / 关闭、顶部分页、主 API（地址、密钥、模型列表）、API 预设和字体预设、温度

// 设置界面开关
const settingsScreen = document.getElementById('settingsScreen');
const dockSettings   = document.getElementById('dockSettings');
const backBtn        = document.getElementById('backBtn');

dockSettings.addEventListener('click', function() {
  settingsScreen.classList.add('active');
  if (apiUrlInput.value.trim() && apiKey.value.trim()) {
    refreshBtn.click();
  }
});
backBtn.addEventListener('click', function() {
  settingsScreen.classList.remove('active');
  setApiModelPopup(false);
});

// 设置界面 — 顶栏下方固定横向菜单切换（主API / 语音API / 生图API / 辅助功能）
document.querySelectorAll('#settingsSubnav .settings-subnav-item').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var stab = this.dataset.stab;
    document.querySelectorAll('#settingsSubnav .settings-subnav-item').forEach(function(b) {
      b.classList.remove('active');
    });
    this.classList.add('active');
    document.querySelectorAll('#settingsScreen .settings-subpanel').forEach(function(panel) {
      panel.classList.toggle('active', panel.dataset.spanel === stab);
    });
    settingsScreen.querySelector('.settings-content').scrollTop = 0;
  });
});

// 眼睛图标切换
const eyeBtn  = document.getElementById('eyeBtn');
const apiKey  = document.getElementById('apiKey');
const apiUrlInput = document.getElementById('apiUrl');
const eyeIcon = document.getElementById('eyeIcon');

eyeBtn.addEventListener('click', function() {
  const isHidden = apiKey.type === 'password';
  apiKey.type = isHidden ? 'text' : 'password';
  eyeBtn.classList.toggle('visible', isHidden);
  eyeIcon.innerHTML = isHidden
    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
});

const refreshBtn = document.getElementById('refreshBtn');
var apiModelRequest = 0;

function resetApiModelList() {
  apiModelRequest++;
  refreshBtn.classList.remove('spinning');
  modelPopup.replaceChildren();
  setApiModelPopup(false);
}

function onApiConnectionEdit() {
  resetApiModelList();
  setDraftApiModel('');
}
apiUrlInput.addEventListener('input', onApiConnectionEdit);
apiKey.addEventListener('input', onApiConnectionEdit);

// 模型弹窗
const modelSelectBtn = document.getElementById('modelSelectBtn');
const modelPopup     = document.getElementById('modelPopup');
const modelDisplay   = document.getElementById('modelDisplay');
const modelChevron   = document.getElementById('modelChevron');

function setApiModelPopup(open) {
  modelPopup.classList.toggle('open', open);
  modelChevron.classList.toggle('open', open);
  modelSelectBtn.setAttribute('aria-expanded', String(open));
}
modelSelectBtn.addEventListener('click', function(event) {
  event.stopPropagation();
  if (modelPopup.children.length) setApiModelPopup(!modelPopup.classList.contains('open'));
  else refreshApiModels(true);
});
modelSelectBtn.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') setApiModelPopup(false);
});

function setDraftApiModel(model) {
  modelDisplay.textContent = model || '请选择模型';
  modelPopup.querySelectorAll('.model-popup-item').forEach(function(item) {
    item.classList.toggle('selected', item.dataset.model === model);
  });
  renderApiConnectionStatus();
}

document.addEventListener('click', function() {
  setApiModelPopup(false);
});

// API、字体、钱包和世界书共用命名弹窗。
const presetModal     = document.getElementById('presetModal');
const modalCancel     = document.getElementById('modalCancel');
const modalConfirm    = document.getElementById('modalConfirm');
const presetNameInput = document.getElementById('presetNameInput');
var presetModalMode = '';
var apiPresetNameAction = null;
var apiPresets = mphoneStore.load('mphone_api_presets', []);
if (!Array.isArray(apiPresets)) apiPresets = [];
var fontPresets = mphoneStore.load('mphone_font_presets', []);

const apiPresetSelect = document.getElementById('apiPresetSelect');
const apiPresetApply = document.getElementById('apiPresetApply');
const apiPresetUpdate = document.getElementById('apiPresetUpdate');
const apiPresetRename = document.getElementById('apiPresetRename');
const apiPresetDelete = document.getElementById('apiPresetDelete');
const apiPresetInfo = document.getElementById('apiPresetInfo');
const apiConnectionStatus = document.getElementById('apiConnectionStatus');

function apiConfig(url, key, model, temp) {
  var degrees = parseFloat(temp);
  return { url: url || '', key: key || '', model: model || '', temp: Number.isFinite(degrees) ? degrees : 0.8 };
}
function readDraftApiConfig() {
  var model = modelDisplay.textContent.trim();
  return apiConfig(apiUrlInput.value.trim(), apiKey.value.trim(), model === '请选择模型' ? '' : model, tempSlider.value);
}
function readAppliedApiConfig() {
  return apiConfig(mphoneStore.load('mphone_api_url', ''), mphoneStore.load('mphone_api_key', ''),
    mphoneStore.load('mphone_model', ''), mphoneStore.load('mphone_temperature', '0.80'));
}
function sameApiConfig(a, b) {
  return a.url === b.url && a.key === b.key && a.model === b.model && a.temp === b.temp;
}
function presetApiConfig(preset) {
  return apiConfig(preset.url, preset.key, preset.model, preset.temp);
}

function renderApiConnectionStatus() {
  var applied = readAppliedApiConfig();
  var dirty = !sameApiConfig(applied, readDraftApiConfig());
  var status = dirty ? '有修改待应用' : applied.model ? '当前模型：' + applied.model : '未选择模型';
  if (apiConnectionStatus.textContent !== status) apiConnectionStatus.textContent = status;
}

function apiPresetIndex() {
  return apiPresetSelect.value === '' ? -1 : Number(apiPresetSelect.value);
}
function renderApiPresetActions() {
  var preset = apiPresets[apiPresetIndex()];
  [apiPresetApply, apiPresetUpdate, apiPresetRename, apiPresetDelete].forEach(function(button) {
    button.disabled = !preset;
  });
  apiPresetInfo.textContent = preset
    ? (preset.model || '未选择模型') + ' · 温度 ' + presetApiConfig(preset).temp.toFixed(2)
    : '';
}
function renderApiPresets(index) {
  var selected = index === undefined ? apiPresetIndex() : index;
  apiPresetSelect.replaceChildren(new Option('选择已保存的预设', ''));
  apiPresets.forEach(function(preset, i) {
    if (preset && typeof preset.name === 'string') apiPresetSelect.add(new Option(preset.name, String(i)));
  });
  if (apiPresets[selected]) apiPresetSelect.value = String(selected);
  renderApiPresetActions();
}
function saveApiPresets(index) {
  mphoneStore.save('mphone_api_presets', apiPresets);
  renderApiPresets(index);
}

function setDraftApiConfig(cfg) {
  resetApiModelList();
  apiUrlInput.value = cfg.url;
  apiKey.value = cfg.key;
  tempSlider.value = cfg.temp;
  setDraftApiModel(cfg.model);
  updateSliderThumb();
}
function applyApiConfig(cfg) {
  mphoneStore.save('mphone_api_url', cfg.url);
  mphoneStore.save('mphone_api_key', cfg.key);
  mphoneStore.save('mphone_temperature', cfg.temp.toFixed(2));
  if (cfg.model) mphoneStore.save('mphone_model', cfg.model);
  else mphoneStore.remove('mphone_model');
  renderApiConnectionStatus();
  showToast('✓ 主 API 配置已应用', 'success');
}
function openApiPresetName(title, name, onName) {
  presetModalMode = 'api';
  apiPresetNameAction = onName;
  document.querySelector('#presetModal .modal-title').textContent = title;
  presetNameInput.value = name;
  presetModal.classList.add('open');
  presetNameInput.focus();
}
function isApiPresetNameAvailable(name, index) {
  if (!apiPresets.some(function(preset, i) { return i !== index && preset && preset.name === name; })) return true;
  showToast('已有同名预设，换一个名字吧', 'error');
  return false;
}

apiPresetSelect.addEventListener('change', renderApiPresetActions);
apiPresetApply.addEventListener('click', function() {
  var preset = apiPresets[apiPresetIndex()];
  if (!preset) return;
  var cfg = presetApiConfig(preset);
  setDraftApiConfig(cfg);
  applyApiConfig(readDraftApiConfig());
});

apiPresetUpdate.addEventListener('click', function() {
  var index = apiPresetIndex(), preset = apiPresets[index];
  if (!preset) return;
  var cfg = readDraftApiConfig();
  openConfirm('保存到「' + preset.name + '」？', function() {
    Object.assign(preset, cfg, { temp: cfg.temp.toFixed(2) });
    saveApiPresets(index);
    showToast('✓ 预设已更新', 'success');
  }, { desc: '把下方表单写入这份预设。', okText: '保存修改' });
});

document.getElementById('btnSavePreset').addEventListener('click', function() {
  var cfg = readDraftApiConfig();
  openApiPresetName('另存为连接预设', '', function(name) {
    if (!isApiPresetNameAvailable(name, -1)) return false;
    apiPresets.push(Object.assign({ name: name }, cfg, { temp: cfg.temp.toFixed(2) }));
    saveApiPresets(apiPresets.length - 1);
    showToast('✓ 已另存为预设', 'success');
  });
});

apiPresetRename.addEventListener('click', function() {
  var index = apiPresetIndex(), preset = apiPresets[index];
  if (!preset) return;
  openApiPresetName('重命名连接预设', preset.name, function(name) {
    if (name === preset.name) return;
    if (!isApiPresetNameAvailable(name, index)) return false;
    // 旧预设可能同名。角色原本跟随的是同名预设中的第一份。
    var linked = apiPresets.find(function(item) { return item && item.name === preset.name; }) === preset
      ? charList.filter(function(char) { return char.apiPresetName === preset.name; }) : [];
    preset.name = name;
    linked.forEach(function(char) { char.apiPresetName = name; });
    saveApiPresets(index);
    if (linked.length) saveCharList();
    showToast('✓ 预设已重命名', 'success');
  });
});

apiPresetDelete.addEventListener('click', function() {
  var index = apiPresetIndex(), preset = apiPresets[index];
  if (!preset) return;
  openConfirm('删除预设「' + preset.name + '」？', function() {
    apiPresets.splice(index, 1);
    saveApiPresets(-1);
    showToast('✓ 预设已删除', 'success');
  });
});

function closePresetModal() {
  presetModal.classList.remove('open');
  apiPresetNameAction = null;
}
modalCancel.addEventListener('click', closePresetModal);
presetNameInput.addEventListener('keydown', function(event) {
  if (event.key === 'Enter' && !event.isComposing && presetModalMode === 'api') modalConfirm.click();
});

// 字体预设：点击芯片 → 填入并应用；✕ 删除
function renderFontPresets() {
  var wrap = document.getElementById('fontPresetChips');
  wrap.innerHTML = '';
  fontPresets.forEach(function(fp, i) {
    var chip = document.createElement('span');
    chip.className = 'font-preset-chip';
    chip.title = fp.value;
    var label = document.createElement('span');
    label.textContent = fp.name;
    var del = document.createElement('button');
    del.className = 'font-preset-chip-del';
    del.textContent = '×';
    del.addEventListener('click', function(e) {
      e.stopPropagation();
      fontPresets.splice(i, 1);
      mphoneStore.save('mphone_font_presets', fontPresets);
      renderFontPresets();
    });
    chip.appendChild(label);
    chip.appendChild(del);
    chip.addEventListener('click', function() {
      fontInput.value = fp.value;
      fontApplyBtn.click();
    });
    wrap.appendChild(chip);
  });
}

modalConfirm.addEventListener('click', function() {
  var name = presetNameInput.value.trim();
  if (!name) {
    presetNameInput.classList.remove('shake');
    void presetNameInput.offsetWidth;
    presetNameInput.classList.add('shake');
    presetNameInput.addEventListener('animationend', function() {
      presetNameInput.classList.remove('shake');
    }, { once: true });
    return;
  }

  if (presetModalMode === 'wallet') {
    if (!confirmWalletTopup(name)) { shakeEl(presetNameInput); return; }
    presetModal.classList.remove('open');
    return;
  }

  if (presetModalMode === 'wbFolder') {
    presetModal.classList.remove('open');
    if (_wbFolderNameCb) _wbFolderNameCb(name);
    _wbFolderNameCb = null;
    return;
  }

  if (presetModalMode === 'font') {
    fontPresets.push({ name: name, value: fontInput.value.trim() });
    mphoneStore.save('mphone_font_presets', fontPresets);
    renderFontPresets();
    presetModal.classList.remove('open');
    showToast('✓ 已保存字体预设', 'success');
    return;
  }

  if (presetModalMode === 'api' && apiPresetNameAction && apiPresetNameAction(name) !== false) {
    closePresetModal();
  }
});

closeOnBackdrop(presetModal, closePresetModal);

// 温度滑条
const tempSlider       = document.getElementById('tempSlider');
const sliderThumb      = document.getElementById('sliderThumb');
const tempValueDisplay = document.getElementById('tempValueDisplay');

function updateSliderThumb() {
  const min = parseFloat(tempSlider.min);
  const max = parseFloat(tempSlider.max);
  const val = parseFloat(tempSlider.value);
  const pct = (val - min) / (max - min);
  // 滑块的触点宽 18px，中心在轨道两端内侧各 9px。
  sliderThumb.style.left = 'calc(' + (pct * 100) + '% + (' + (9 - pct * 18) + 'px))';
  tempValueDisplay.textContent = val.toFixed(2);
}

tempSlider.addEventListener('input', function() {
  updateSliderThumb();
  renderApiConnectionStatus();
});
