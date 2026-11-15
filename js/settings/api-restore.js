// 眠花糖机 — 恢复主 API 配置、应用表单和刷新模型列表
(function loadSavedConfig() {
  var cfg = readAppliedApiConfig();
  setDraftApiConfig(cfg);
  var match = apiPresets.findIndex(function(preset) {
    return preset && sameApiConfig(presetApiConfig(preset), cfg);
  });
  renderApiPresets(match);
})();

document.getElementById('btnApply').addEventListener('click', function() {
  applyApiConfig(readDraftApiConfig());
});

function refreshApiModels(openPopup) {
  if (refreshBtn.classList.contains('spinning')) return;
  var cfg = readDraftApiConfig();
  if (!cfg.url || !cfg.key) {
    showToast('请先填接口地址和 API 密钥', 'plain');
    return;
  }
  var request = ++apiModelRequest;
  refreshBtn.classList.add('spinning');
  llmListModels(cfg.url, cfg.key).then(function(models) {
    if (request !== apiModelRequest) return;
    if (!models.length) throw new Error('接口没有返回模型');
    modelPopup.replaceChildren();
    models.forEach(function(id) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'model-popup-item';
      item.dataset.model = id;
      item.textContent = id;
      item.addEventListener('click', function(event) {
        event.stopPropagation();
        setDraftApiModel(id);
        setApiModelPopup(false);
      });
      modelPopup.appendChild(item);
    });
    // 保留已填的模型。接口未列出它时，仍可在列表里手动换一个。
    setDraftApiModel(readDraftApiConfig().model || models[0]);
    if (openPopup && settingsScreen.classList.contains('active') && modelSelectBtn.getClientRects().length) setApiModelPopup(true);
    showToast('✓ 刷新成功', 'success');
  }).catch(function(err) {
    if (request !== apiModelRequest) return;
    console.warn('[Mphone] 获取模型列表失败:', err);
    showToast('✗ 获取失败：' + (err && err.message ? String(err.message).slice(0, 60) : ''), 'error');
  }).finally(function() {
    if (request === apiModelRequest) refreshBtn.classList.remove('spinning');
  });
}
refreshBtn.addEventListener('click', function(event) {
  event.stopPropagation();
  refreshApiModels(false);
});
