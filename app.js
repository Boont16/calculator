// ============================================================
// КАЛЬКУЛЯТОР РУЛОННЫХ ШТОР — ЛОГИКА
// ============================================================

// --- СОСТОЯНИЕ ---
var order = [];
var prevProductType = null;  // какой тип изделия был выбран до текущего переключения
var editingIndex = null;     // индекс редактируемой позиции (null — добавление новой)

// Оставляет в поле только цифры и один разделитель (запятую или точку).
// Используется для полей размеров, где допустимы миллиметры (например 38,4).
function sanitizeDecimal(input) {
  var v = input.value.replace(/[^0-9.,]/g, '');   // убрать всё кроме цифр и . ,
  v = v.replace(/[.,]/g, function (m, off) {        // оставить только первый разделитель
    return off === v.search(/[.,]/) ? m : '';
  });
  input.value = v;
}

// Прочитать размер из поля (понимает и запятую, и точку)
function parseSize(id) {
  var raw = String(document.getElementById(id).value).replace(',', '.');
  return parseFloat(raw);
}

// Сокращение стороны управления для отчёта: Правое→п, Левое→л, Левое+Правое→л.п
function sideShort(side) {
  if (side === 'Правое') { return 'п'; }
  if (side === 'Левое') { return 'л'; }
  if (side === 'Левое+Правое') { return 'л.п'; }
  return side;
}

// Короткое название изделия для карточек заказа (без приставки «Рулонные шторы»)
function shortName(productName) {
  return String(productName).replace('Рулонные шторы ', '');
}

// Экранирование пользовательского текста перед вставкой в HTML
// (защита от поломки вёрстки символами < > & и от подстановки чужого кода)
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- ВСПОМОГАТЕЛЬНЫЕ ---

function getProductConfig() {
  return PRODUCTS[document.getElementById('product-type').value];
}

function getProductType() {
  return document.getElementById('product-type').value;
}

function isRollerType(type) {
  return ['MINI', 'UNI1', 'MINIZEBRA', 'UNI1ZEBRA'].indexOf(type) >= 0;
}

// Ближайший размер из таблицы к введённому значению (в сантиметрах).
// Считаем в целых сантиметрах, чтобы не было ошибок дробных чисел.
// Если значение ровно посередине между двумя размерами — округляем ВВЕРХ
// (правило «5 и больше — вверх»).
function nearestSize(sizesMeters, valueCm) {
  var best = null, bestCm = null, bestDiff = 1e9;
  for (var i = 0; i < sizesMeters.length; i++) {
    var sizeCm = Math.round(sizesMeters[i] * 100);
    var diff = Math.abs(sizeCm - valueCm);
    if (diff < bestDiff || (diff === bestDiff && sizeCm > bestCm)) {
      bestDiff = diff; best = sizesMeters[i]; bestCm = sizeCm;
    }
  }
  return best;
}

// Индекс размера в массиве (по совпадению в сантиметрах)
function sizeIndex(sizesMeters, sizeMeters) {
  var target = Math.round(sizeMeters * 100);
  for (var i = 0; i < sizesMeters.length; i++) {
    if (Math.round(sizesMeters[i] * 100) === target) { return i; }
  }
  return -1;
}

// Поиск цены по таблице (с округлением размеров к ближайшему табличному)
function getPrice(cfg, cat, w, h) {
  var wMatch = nearestSize(cfg.widths, Math.round(w * 100));
  var hMatch = nearestSize(cfg.heights, Math.round(h * 100));
  if (wMatch === null || hMatch === null) { return null; }

  var table = cfg.prices[cat];
  if (!table) { return null; }
  var row = table[wMatch];
  if (!row) { return null; }

  var hIdx = sizeIndex(cfg.heights, hMatch);
  if (hIdx < 0 || row[hIdx] === undefined) { return null; }
  return row[hIdx];
}

// Округление до ближайшей сотни
function round100(v) {
  return Math.round(v / 100) * 100;
}

// --- ИНТЕРФЕЙС РАСЧЁТА ---

function onProductChange() {
  var cfg = getProductConfig();
  var type = getProductType();
  var catSel = document.getElementById('cat');
  var catRow = document.getElementById('cat-row');
  var fabricRow = document.getElementById('fabric-row');
  var prevW = parseSize('width');
  var prevH = parseSize('height');
  var html = '';

  if (cfg.type === 'sqm') {
    // Жалюзи — расчёт по площади
    catRow.style.display = 'none';
    fabricRow.style.display = 'block';
    document.getElementById('fabric').style.display = 'block';

    var wLabel = cfg.maxWidth ? 'Ширина (см) — до ' + cfg.maxWidth : 'Ширина (см)';
    var hLabel = cfg.maxHeight ? 'Высота (см) — до ' + cfg.maxHeight : 'Высота (см)';
    document.getElementById('width-label').textContent = wLabel;
    document.getElementById('height-label').textContent = hLabel;
    document.getElementById('width').min = 1;
    document.getElementById('width').max = cfg.maxWidth || 9999;
    document.getElementById('height').min = 1;
    document.getElementById('height').max = cfg.maxHeight || 9999;

    var fabSel = document.getElementById('fabric-vert');
    if (cfg.sqmPrice) {
      // Горизонтальные жалюзи — фиксированная цена
      fabSel.style.display = 'none';
      document.getElementById('fabric-vert-label').style.display = 'none';
      document.getElementById('fabric-label').textContent = 'Название ленты';
      document.getElementById('fabric').placeholder = 'Например: белая 25мм';
    } else {
      // Вертикальные жалюзи — выбор ткани из списка
      document.getElementById('fabric-vert-label').style.display = 'block';
      document.getElementById('fabric-label').textContent = 'Цвет';
      document.getElementById('fabric').placeholder = 'Например: белый';
      var fhtml = '<option value="">— выберите ткань —</option>';
      var names = Object.keys(cfg.fabrics);
      for (var i = 0; i < names.length; i++) {
        fhtml += '<option value="' + names[i] + '">' + names[i] + ' (' + cfg.fabrics[names[i]].toLocaleString('ru-RU') + ')</option>';
      }
      fabSel.innerHTML = fhtml;
      fabSel.style.display = 'block';
    }
    document.getElementById('width').value = '';
    document.getElementById('height').value = '';

  } else {
    // Рулонные шторы — расчёт по таблице
    catRow.style.display = 'block';
    document.getElementById('fabric-vert').style.display = 'none';
    document.getElementById('fabric-vert-label').style.display = 'none';
    document.getElementById('fabric').style.display = 'block';
    document.getElementById('fabric-label').textContent = 'Название ткани';
    document.getElementById('fabric').placeholder = 'Например: Блэкаут белый';

    for (var i = 0; i < cfg.categories.length; i++) {
      var c = cfg.categories[i];
      html += '<option value="' + c + '">' + cfg.catLabels[c] + '</option>';
    }
    catSel.innerHTML = html;

    var ws = cfg.widths;
    var hs = cfg.heights;
    document.getElementById('width-label').textContent = 'Ширина (см) — от ' + Math.round(ws[0] * 100) + ' до ' + Math.round(ws[ws.length - 1] * 100);
    document.getElementById('height-label').textContent = 'Высота (см) — от ' + Math.round(hs[0] * 100) + ' до ' + Math.round(hs[hs.length - 1] * 100);
    document.getElementById('width').min = Math.round(ws[0] * 100);
    document.getElementById('width').max = Math.round(ws[ws.length - 1] * 100);
    document.getElementById('height').min = Math.round(hs[0] * 100);
    document.getElementById('height').max = Math.round(hs[hs.length - 1] * 100);

    // Переносим размеры только если И прошлое, И новое изделие — рулонные шторы.
    // При переходе на/с жалюзи или Свободновисящей размеры сбрасываем.
    if (isRollerType(type) && isRollerType(prevProductType) && prevW && prevW > 0) {
      document.getElementById('width').value = prevW;
      document.getElementById('height').value = prevH;
    } else {
      document.getElementById('width').value = '';
      document.getElementById('height').value = '';
    }
  }

  prevProductType = type;
  calcPrice();
}

function calcPrice() {
  var cfg = getProductConfig();
  var wcm = parseSize('width');
  var hcm = parseSize('height');
  var alertEl = document.getElementById('price-alert');
  alertEl.innerHTML = '';

  // Пустые поля — не считаем
  if (!wcm || !hcm || isNaN(wcm) || isNaN(hcm)) {
    document.getElementById('price-out').textContent = '—';
    return;
  }

  var w = Math.round(wcm) / 100;
  var h = Math.round(hcm) / 100;
  var qtyRaw = parseInt(document.getElementById('qty').value, 10);
  if (!isNaN(qtyRaw) && qtyRaw < 1) {
    document.getElementById('price-out').textContent = '—';
    alertEl.innerHTML = '<div class="alert">Количество должно быть больше нуля.</div>';
    return;
  }
  var qty = (!isNaN(qtyRaw) && qtyRaw > 0) ? qtyRaw : 1;
  var p = null;

  if (cfg.type === 'sqm') {
    // Проверка максимальных размеров
    if (cfg.maxWidth && wcm > cfg.maxWidth) {
      document.getElementById('price-out').textContent = '—';
      alertEl.innerHTML = '<div class="alert">Максимальная ширина — ' + cfg.maxWidth + ' см.</div>';
      return;
    }
    if (cfg.maxHeight && hcm > cfg.maxHeight) {
      document.getElementById('price-out').textContent = '—';
      alertEl.innerHTML = '<div class="alert">Максимальная высота — ' + cfg.maxHeight + ' см.</div>';
      return;
    }

    var sqm = w * h;
    if (sqm < 1) { sqm = 1; }

    if (cfg.sqmPrice) {
      p = round100(cfg.sqmPrice * sqm);
    } else {
      var fabricName = document.getElementById('fabric-vert').value;
      if (!fabricName) {
        document.getElementById('price-out').textContent = '—';
        return;
      }
      p = round100(cfg.fabrics[fabricName] * sqm);
    }

  } else {
    // Проверка максимальных размеров по таблице
    var wMax = cfg.widths[cfg.widths.length - 1];
    var hMax = cfg.heights[cfg.heights.length - 1];
    if (w > wMax + 0.001) {
      document.getElementById('price-out').textContent = '—';
      alertEl.innerHTML = '<div class="alert">Максимальная ширина — ' + Math.round(wMax * 100) + ' см.</div>';
      return;
    }
    if (h > hMax + 0.001) {
      document.getElementById('price-out').textContent = '—';
      alertEl.innerHTML = '<div class="alert">Максимальная высота — ' + Math.round(hMax * 100) + ' см.</div>';
      return;
    }

    var cat = document.getElementById('cat').value;
    p = getPrice(cfg, cat, w, h);
    if (p === null) {
      document.getElementById('price-out').textContent = 'Нет данных';
      return;
    }

    // Подсказка об округлении (через ту же логику, что и расчёт цены)
    var wMatchCm = Math.round(nearestSize(cfg.widths, Math.round(wcm)) * 100);
    var hMatchCm = Math.round(nearestSize(cfg.heights, Math.round(hcm)) * 100);
    if (wMatchCm !== Math.round(wcm) || hMatchCm !== Math.round(hcm)) {
      alertEl.innerHTML = '<div class="alert" style="color:#7a5c00;background:#fffbe6;border:1px solid #ffe58f">Цена рассчитана по ближайшему размеру: ' + wMatchCm + ' × ' + hMatchCm + ' см</div>';
    }
  }

  var total = p * qty;
  var text = total.toLocaleString('ru-RU') + ' ₽';
  if (qty > 1) { text += ' (' + p.toLocaleString('ru-RU') + ' × ' + qty + ')'; }
  document.getElementById('price-out').textContent = text;
}

// --- ЗАКАЗ ---

function addToOrder() {
  var cfg = getProductConfig();
  var type = getProductType();
  var wcm = parseSize('width');
  var hcm = parseSize('height');
  var qtyRaw = parseInt(document.getElementById('qty').value, 10);
  var qty = (!isNaN(qtyRaw) && qtyRaw > 0) ? qtyRaw : 1;
  var note = document.getElementById('note').value;
  var side = document.getElementById('side').value;
  var cat, catName, fabric, p;
  var w = Math.round(wcm) / 100;
  var h = Math.round(hcm) / 100;

  if (!wcm || !hcm || isNaN(wcm) || isNaN(hcm)) {
    alert('Введите ширину и высоту');
    return;
  }
  if (!isNaN(qtyRaw) && qtyRaw < 1) {
    alert('Количество должно быть больше нуля.');
    return;
  }

  if (cfg.type === 'sqm') {
    if (cfg.maxWidth && wcm > cfg.maxWidth) { alert('Максимальная ширина — ' + cfg.maxWidth + ' см.'); return; }
    if (cfg.maxHeight && hcm > cfg.maxHeight) { alert('Максимальная высота — ' + cfg.maxHeight + ' см.'); return; }

    var sqm = w * h;
    if (sqm < 1) { sqm = 1; }

    if (cfg.sqmPrice) {
      fabric = document.getElementById('fabric').value;
      cat = 'fixed';
      catName = cfg.sqmPrice.toLocaleString('ru-RU') + ' ₽/кв.м';
      p = round100(cfg.sqmPrice * sqm);
    } else {
      fabric = document.getElementById('fabric-vert').value;
      if (!fabric) { alert('Выберите ткань'); return; }
      cat = fabric;
      catName = fabric;
      p = round100(cfg.fabrics[fabric] * sqm);
    }

  } else {
    var wMax = cfg.widths[cfg.widths.length - 1];
    var hMax = cfg.heights[cfg.heights.length - 1];
    if (w > wMax + 0.001) { alert('Максимальная ширина — ' + Math.round(wMax * 100) + ' см.'); return; }
    if (h > hMax + 0.001) { alert('Максимальная высота — ' + Math.round(hMax * 100) + ' см.'); return; }

    cat = document.getElementById('cat').value;
    catName = cfg.catLabels[cat];
    fabric = document.getElementById('fabric').value;
    p = getPrice(cfg, cat, w, h);
    if (p === null) { alert('Нет цены для этого размера'); return; }
  }

  var newItem = {
    productType: type,
    productName: cfg.name,
    cat: cat,
    catName: catName,
    w: wcm,
    h: hcm,
    qty: qty,
    note: note,
    side: side,
    fabric: fabric,
    unitPrice: p
  };

  var wasEditing = (editingIndex !== null);
  if (wasEditing) {
    order[editingIndex] = newItem;
    editingIndex = null;
  } else {
    order.push(newItem);
  }

  renderOrder();
  updateAddButton();

  // Все параметры остаются заполненными для удобства ввода похожих позиций

  // После сохранения правки возвращаемся на вкладку «Заказ»
  if (wasEditing) {
    showTab('order');
  }

  var btn = document.getElementById('add-btn');
  if (btn) {
    btn.textContent = wasEditing ? '✓ Сохранено!' : '✓ Добавлено!';
    btn.style.background = '#2a7a2a';
    setTimeout(function() { btn.style.background = ''; updateAddButton(); }, 1500);
  }
}

// Текст кнопки добавления зависит от режима (добавление / сохранение правки)
function updateAddButton() {
  var btn = document.getElementById('add-btn');
  if (!btn) { return; }
  btn.textContent = (editingIndex !== null) ? '✓ Сохранить изменения' : '+ Добавить в заказ';
}

// Загрузить позицию обратно в калькулятор для редактирования
function editItem(idx) {
  var it = order[idx];
  editingIndex = idx;
  showTab('calc');

  document.getElementById('product-type').value = it.productType;
  onProductChange();  // перестроит поля категории/ткани под изделие

  var cfg = PRODUCTS[it.productType];
  if (cfg.type === 'sqm') {
    if (cfg.sqmPrice) {
      document.getElementById('fabric').value = it.fabric || '';      // лента (горизонтальные)
    } else {
      document.getElementById('fabric-vert').value = it.fabric || ''; // ткань из списка (вертикальные)
    }
  } else {
    document.getElementById('cat').value = it.cat;
    document.getElementById('fabric').value = it.fabric || '';
  }
  document.getElementById('width').value = it.w;
  document.getElementById('height').value = it.h;
  document.getElementById('qty').value = it.qty;
  document.getElementById('side').value = it.side;
  document.getElementById('note').value = it.note || '';

  updateAddButton();
  calcPrice();
  if (window.scrollTo) { window.scrollTo({ top: 0, behavior: 'smooth' }); }
}

function removeItem(idx) {
  order.splice(idx, 1);
  if (editingIndex !== null) { editingIndex = null; updateAddButton(); }
  renderOrder();
}

function renderOrder() {
  var list = document.getElementById('items-list');
  var cnt = document.getElementById('order-count');
  cnt.style.display = order.length ? 'inline' : 'none';
  cnt.textContent = order.length;

  if (!order.length) {
    list.innerHTML = '<div class="empty">Нет добавленных позиций</div>';
    recalcTotal();
    return;
  }

  var html = '';
  for (var i = 0; i < order.length; i++) {
    var it = order[i];

    // Заголовок (жирным): короткий тип изделия + ткань
    var title = escapeHtml(shortName(it.productName));
    if (it.fabric) { title += ' · ' + escapeHtml(it.fabric); }

    // Размер — отдельной заметной строкой
    var sizeLine = it.w + ' × ' + it.h + ' см';

    // Второстепенное (серым): категория, сторона, примечание
    var meta = [];
    if (it.catName && it.catName !== it.fabric) { meta.push(escapeHtml(it.catName)); }
    if (it.side) { meta.push(escapeHtml(it.side)); }
    if (it.note) { meta.push(escapeHtml(it.note)); }

    var lineTotal = (it.unitPrice * it.qty).toLocaleString('ru-RU');
    var qtyHint = it.qty + ' шт × ' + it.unitPrice.toLocaleString('ru-RU') + ' ₽';

    html += '<div class="item-row">';
    html += '<div class="item-info">';
    html += '<div class="item-title">' + title + '</div>';
    html += '<div class="item-size">' + sizeLine + '</div>';
    if (meta.length) { html += '<div class="item-meta">' + meta.join(' · ') + '</div>'; }
    html += '</div>';
    html += '<div class="item-right">';
    html += '<div class="item-price">' + lineTotal + ' ₽</div>';
    if (it.qty > 1) { html += '<div class="item-qty">' + qtyHint + '</div>'; }
    html += '</div>';
    html += '<div class="item-actions">';
    html += '<button class="btn" onclick="editItem(' + i + ')" style="padding:6px 9px" title="Изменить">✎</button>';
    html += '<button class="btn btn-danger" onclick="removeItem(' + i + ')" style="padding:6px 9px" title="Удалить">✕</button>';
    html += '</div>';
    html += '</div>';
  }
  list.innerHTML = html;
  recalcTotal();
}

function recalcTotal() {
  var sum = 0;
  for (var i = 0; i < order.length; i++) { sum += order[i].unitPrice * order[i].qty; }
  var extra = parseFloat(document.getElementById('extra-cost').value) || 0;
  var disc = parseFloat(document.getElementById('discount').value) || 0;
  var total = Math.max(0, sum + extra - disc);
  var prepayEl = document.getElementById('prepay');
  var prepay = parseFloat(prepayEl.value) || 0;
  var warnEl = document.getElementById('prepay-warn');
  // Предоплата не может быть больше суммы заказа и не может быть отрицательной
  if (prepay > total) {
    prepay = total;
    prepayEl.value = total;
    if (warnEl) { warnEl.style.display = 'block'; }
  } else {
    if (warnEl) { warnEl.style.display = 'none'; }
  }
  if (prepay < 0) { prepay = 0; prepayEl.value = 0; }
  var remaining = Math.max(0, total - prepay);
  document.getElementById('sum-items').textContent = sum.toLocaleString('ru-RU') + ' ₽';
  document.getElementById('total-out').textContent = total.toLocaleString('ru-RU') + ' ₽';
  document.getElementById('remaining-out').textContent = remaining.toLocaleString('ru-RU') + ' ₽';
}

function clearOrder() {
  if (!confirm('Очистить весь заказ?')) { return; }
  order = [];
  editingIndex = null;
  document.getElementById('extra-cost').value = 0;
  document.getElementById('discount').value = 0;
  document.getElementById('prepay').value = 0;
  document.getElementById('client-name').value = '';
  document.getElementById('client-phone').value = '';
  document.getElementById('client-addr').value = '';
  document.getElementById('client-comment').value = '';
  document.getElementById('report-block').style.display = 'none';
  updateAddButton();
  renderOrder();
}

// --- ВКЛАДКИ ---

function showTab(t) {
  var ids = ['calc', 'order', 'prices'];
  for (var i = 0; i < ids.length; i++) {
    document.getElementById('tab-' + ids[i]).style.display = (ids[i] === t) ? 'block' : 'none';
  }
  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) {
    if (ids[i] === t) { tabs[i].className = tabs[i].className.replace(' active', '') + ' active'; }
    else { tabs[i].className = tabs[i].className.replace(' active', ''); }
  }
  if (t === 'prices') { renderPriceEditor(); }
}

// --- РЕДАКТОР ЦЕН ---

function renderPriceEditor() {
  var sel = document.getElementById('price-product-sel');
  var productType = sel ? sel.value : Object.keys(PRODUCTS)[0];
  var cfg = PRODUCTS[productType];
  var container = document.getElementById('price-editor');
  var keys = Object.keys(PRODUCTS);
  var i, ci, wi, hi;

  // Селектор типа изделия
  var selHtml = '<div style="margin-bottom:12px"><label>Тип изделия</label><select onchange="renderPriceEditor()" id="price-product-sel" style="max-width:300px">';
  for (i = 0; i < keys.length; i++) {
    selHtml += '<option value="' + keys[i] + '"' + (keys[i] === productType ? ' selected' : '') + '>' + PRODUCTS[keys[i]].name + '</option>';
  }
  selHtml += '</select></div>';
  selHtml += '<div style="margin-bottom:14px;padding:10px 12px;background:#fffbe6;border:1px solid #ffe58f;border-radius:8px;font-size:13px;color:#7a5c00">⚠ Изменения цен здесь временные — они действуют только до перезагрузки страницы. Постоянное сохранение появится после подключения базы данных.</div>';

  // Редактор для жалюзи (по площади)
  if (cfg.type === 'sqm') {
    var names = Object.keys(cfg.fabrics);

    // Горизонтальные — только цена за кв.м
    if (cfg.sqmPrice !== undefined && names.length === 0) {
      container.innerHTML = selHtml +
        '<div style="border:1px solid #e0e0e0;border-radius:8px;padding:16px">' +
        '<div style="font-weight:600;margin-bottom:12px">Цена за кв.м</div>' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<input type="number" data-ptype="' + productType + '" data-sqmprice="1" value="' + cfg.sqmPrice + '" style="width:120px;font-size:14px;padding:6px 10px;border:1px solid #ddd;border-radius:6px">' +
        '<span style="color:#666">₽/кв.м</span></div></div>';
      return;
    }

    // Вертикальные — список тканей
    var tableHtml = '<table style="font-size:12px;border-collapse:collapse;width:100%"><thead><tr>' +
      '<th style="padding:6px 10px;text-align:left;color:#666;border-bottom:1px solid #eee">Ткань</th>' +
      '<th style="padding:6px 10px;color:#666;border-bottom:1px solid #eee;text-align:left">Цена (₽/кв.м)</th>' +
      '</tr></thead><tbody>';
    for (var ni = 0; ni < names.length; ni++) {
      var nm = names[ni];
      tableHtml += '<tr><td style="padding:5px 10px">' + nm + '</td>' +
        '<td style="padding:5px 10px"><input type="number" data-ptype="' + productType + '" data-fabric="' + nm + '" value="' + cfg.fabrics[nm] + '" style="width:100px;font-size:12px;padding:4px 6px;border:1px solid #ddd;border-radius:4px"></td></tr>';
    }
    tableHtml += '</tbody></table>';
    container.innerHTML = selHtml +
      '<div style="border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">' +
      '<div style="padding:10px 14px;background:#f9f9f9;font-weight:600">Список тканей</div>' +
      '<div style="padding:12px;overflow-x:auto">' + tableHtml + '</div></div>';
    return;
  }

  // Рулонные шторы — таблицы по категориям
  var tablesHtml = '';
  for (ci = 0; ci < cfg.categories.length; ci++) {
    var cat = cfg.categories[ci];
    var rowCount = (cfg.prices[cat][cfg.widths[0]] || []).length;
    var tableHtml = '<table style="font-size:11px;border-collapse:collapse"><thead><tr>' +
      '<th style="padding:4px 8px;text-align:left;color:#666;border-bottom:1px solid #eee">В↓ / Ш→</th>';
    for (wi = 0; wi < cfg.widths.length; wi++) {
      tableHtml += '<th style="padding:4px 6px;color:#666;border-bottom:1px solid #eee">' + cfg.widths[wi] + '</th>';
    }
    tableHtml += '</tr></thead><tbody>';
    for (hi = 0; hi < rowCount; hi++) {
      tableHtml += '<tr><td style="padding:4px 8px;color:#666;font-weight:600">' + cfg.heights[hi] + '</td>';
      for (wi = 0; wi < cfg.widths.length; wi++) {
        var val = (cfg.prices[cat][cfg.widths[wi]] || [])[hi] || '';
        tableHtml += '<td style="padding:2px"><input type="number" data-ptype="' + productType + '" data-cat="' + cat + '" data-w="' + cfg.widths[wi] + '" data-hidx="' + hi + '" value="' + val + '" style="width:62px;font-size:11px;padding:3px;text-align:center;border:1px solid #ddd;border-radius:4px"></td>';
      }
      tableHtml += '</tr>';
    }
    tableHtml += '</tbody></table>';
    tablesHtml +=
      '<div style="margin-bottom:10px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">' +
      '<div class="cat-header" style="padding:10px 14px;background:#f9f9f9" onclick="toggleEdit(\'' + cat + '\')">' +
      '<span style="font-weight:600">' + cfg.catLabels[cat] + '</span>' +
      '<span style="font-size:12px;color:#999"> ▾ раскрыть</span></div>' +
      '<div id="edit-' + cat + '" class="edit-panel" style="padding:0 12px 12px">' +
      '<div style="overflow-x:auto;margin-top:8px">' + tableHtml + '</div></div></div>';
  }
  container.innerHTML = selHtml + tablesHtml;
}

function toggleEdit(cat) {
  var el = document.getElementById('edit-' + cat);
  if (el.className.indexOf('open') >= 0) { el.className = el.className.replace(' open', ''); }
  else { el.className += ' open'; }
}

function savePrices() {
  var inputs = document.querySelectorAll('[data-ptype]');
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i];
    var pt = inp.getAttribute('data-ptype');
    var val = parseInt(inp.value);
    if (isNaN(val)) { continue; }

    var isSqmPrice = inp.getAttribute('data-sqmprice');
    var fabricName = inp.getAttribute('data-fabric');

    if (isSqmPrice) {
      PRODUCTS[pt].sqmPrice = val;
    } else if (fabricName) {
      PRODUCTS[pt].fabrics[fabricName] = val;
    } else {
      var cat = inp.getAttribute('data-cat');
      var w = parseFloat(inp.getAttribute('data-w'));
      var hIdx = parseInt(inp.getAttribute('data-hidx'));
      if (!PRODUCTS[pt].prices[cat][w]) { PRODUCTS[pt].prices[cat][w] = []; }
      PRODUCTS[pt].prices[cat][w][hIdx] = val;
    }
  }
  alert('Цены сохранены!');
  calcPrice();
}

// --- ОТЧЁТ ---

function buildReportText() {
  var name = document.getElementById('client-name').value;
  var phone = document.getElementById('client-phone').value;
  var addr = document.getElementById('client-addr').value;
  var comment = document.getElementById('client-comment').value;
  var extra = parseFloat(document.getElementById('extra-cost').value) || 0;
  var extraLabel = document.getElementById('extra-label').value || 'Доп. расходы';
  var disc = parseFloat(document.getElementById('discount').value) || 0;
  var prepay = parseFloat(document.getElementById('prepay').value) || 0;
  var sum = 0;
  for (var i = 0; i < order.length; i++) { sum += order[i].unitPrice * order[i].qty; }
  var total = Math.max(0, sum + extra - disc);

  var lines = [];

  // Шапка: адрес, имя клиента, телефон
  if (addr)  { lines.push(addr); }
  if (name)  { lines.push(name); }
  if (phone) { lines.push(phone); }

  // Позиции, сгруппированные по «тип + ткань + категория»
  // (одинаковые изделия идут под одним заголовком, как в образце)
  var lastGroupKey = null;
  for (var i = 0; i < order.length; i++) {
    var it = order[i];
    var fabricLine = it.fabric || '';
    // Категория в скобках рядом с тканью (только для рулонных, где есть catName-категория)
    var cfg = PRODUCTS[it.productType];
    var isRoller = cfg && cfg.type !== 'sqm';
    if (isRoller && it.catName) {
      var catShort = it.catName.replace(' категория', ' кат.');
      fabricLine = (fabricLine ? fabricLine + ' ' : '') + '(' + catShort + ')';
    }
    var groupKey = it.productType + '|' + fabricLine;

    if (groupKey !== lastGroupKey) {
      lines.push('');                              // пустая строка перед новым изделием
      lines.push(shortName(it.productName));       // тип без «Рулонные шторы»
      if (fabricLine) { lines.push(fabricLine); }  // ткань (+категория в скобках)
      lines.push('');                              // пустая строка перед списком размеров
      lastGroupKey = groupKey;
    }

    // Примечание над размером
    if (it.note) { lines.push(it.note); }

    // Строка размера: ширина:высота(сторона) + «-Nшт.» если больше 1
    var sizeStr = it.w + ':' + it.h + '(' + sideShort(it.side) + ')';
    if (it.qty > 1) { sizeStr += '-' + it.qty + 'шт.'; }
    lines.push(sizeStr);
  }

  // Доп.расходы и скидка — над предоплатой, отделены пустой строкой
  var hasExtras = (extra || disc);
  if (hasExtras) {
    lines.push('');
    if (extra) { lines.push(extraLabel + ': +' + extra.toLocaleString('ru-RU')); }
    if (disc)  { lines.push('Скидка: −' + disc.toLocaleString('ru-RU')); }
  }

  // Предоплата и итог
  lines.push('');
  if (prepay) { lines.push('Предоплата: ' + prepay.toLocaleString('ru-RU')); }
  lines.push('Всего: ' + total.toLocaleString('ru-RU'));

  // Комментарий к заказу — через пустую строку после итога
  if (comment) {
    lines.push('');
    lines.push(comment);
  }

  // Склейка с удалением возможной пустой строки в самом начале
  while (lines.length && lines[0] === '') { lines.shift(); }
  var result = '';
  for (var i = 0; i < lines.length; i++) { result += lines[i] + '\n'; }
  return result;
}

function generateReport() {
  if (!order.length) { alert('Добавьте хотя бы одну позицию'); return; }
  document.getElementById('report-content').textContent = buildReportText();
  var block = document.getElementById('report-block');
  block.style.display = 'block';
  block.scrollIntoView({ behavior: 'smooth' });
}

function copyReport() {
  var text = document.getElementById('report-content').textContent;
  var btn = document.getElementById('copy-btn');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function() {
      btn.textContent = 'Скопировано!';
      setTimeout(function() { btn.textContent = 'Скопировать'; }, 1500);
    });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = 'Скопировано!';
    setTimeout(function() { btn.textContent = 'Скопировать'; }, 1500);
  }
}

// --- ОТПРАВКА ---

function sendWhatsApp() {
  var text = document.getElementById('report-content').textContent;
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}
function sendTelegram() {
  var text = document.getElementById('report-content').textContent;
  window.open('https://t.me/share/url?url=%20&text=' + encodeURIComponent(text), '_blank');
}
function sendVK() {
  var text = document.getElementById('report-content').textContent;
  window.open('https://vk.com/share.php?comment=' + encodeURIComponent(text), '_blank');
}
function sendMax() {
  var text = document.getElementById('report-content').textContent;
  window.open('https://max.ru/share?text=' + encodeURIComponent(text), '_blank');
}
function sendNotes() {
  var text = document.getElementById('report-content').textContent;
  var blob = new Blob([text], { type: 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'zakaz.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- ПЕЧАТЬ ---

function printOrder() {
  if (!order.length) { alert('Нет позиций для печати'); return; }
  var name = document.getElementById('client-name').value;
  var phone = document.getElementById('client-phone').value;
  var addr = document.getElementById('client-addr').value;
  var comment = document.getElementById('client-comment').value;
  var extra = parseFloat(document.getElementById('extra-cost').value) || 0;
  var extraLabel = document.getElementById('extra-label').value || 'Доп. расходы';
  var disc = parseFloat(document.getElementById('discount').value) || 0;
  var prepay = parseFloat(document.getElementById('prepay').value) || 0;
  var sum = 0;
  for (var i = 0; i < order.length; i++) { sum += order[i].unitPrice * order[i].qty; }
  var total = Math.max(0, sum + extra - disc);
  var remaining = Math.max(0, total - prepay);
  var now = new Date().toLocaleDateString('ru-RU');
  var rows = '';
  for (var i = 0; i < order.length; i++) {
    var it = order[i];
    var pos = escapeHtml(shortName(it.productName)) + (it.note ? ' («' + escapeHtml(it.note) + '»)' : '');
    rows += '<tr><td>' + (i + 1) + '</td><td>' + pos + '</td><td>' + escapeHtml(it.catName) + '</td><td>' + (it.fabric && it.fabric !== it.catName ? escapeHtml(it.fabric) : '—') + '</td><td>' + escapeHtml(it.side) + '</td><td>' + it.w + ' × ' + it.h + ' см</td><td>' + it.qty + '</td><td>' + it.unitPrice.toLocaleString('ru-RU') + '</td><td>' + (it.unitPrice * it.qty).toLocaleString('ru-RU') + '</td></tr>';
  }
  var meta = (name ? '<b>Клиент:</b> ' + escapeHtml(name) + '<br>' : '') + (phone ? '<b>Телефон:</b> ' + escapeHtml(phone) + '<br>' : '') + (addr ? '<b>Адрес:</b> ' + escapeHtml(addr) + '<br>' : '') + (comment ? '<b>Примечание:</b> ' + escapeHtml(comment) + '<br>' : '') + '<b>Дата:</b> ' + now;
  var fin = 'Сумма позиций: ' + sum.toLocaleString('ru-RU') + ' ₽<br>' + (extra ? escapeHtml(extraLabel) + ': +' + extra.toLocaleString('ru-RU') + ' ₽<br>' : '') + (disc ? 'Скидка: −' + disc.toLocaleString('ru-RU') + ' ₽<br>' : '') + '<br><b>Сумма заказа: ' + total.toLocaleString('ru-RU') + ' ₽</b>' + (prepay ? '<br>Предоплата: ' + prepay.toLocaleString('ru-RU') + ' ₽<br><b>Остаток к оплате: ' + remaining.toLocaleString('ru-RU') + ' ₽</b>' : '');
  var pw = window.open('', '_blank');
  pw.document.write('<html><head><meta charset="utf-8"><title>Заказ</title><style>body{font-family:Arial,sans-serif;font-size:13px;padding:20px}table{width:100%;border-collapse:collapse;margin-bottom:16px}th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#f5f5f5}.total{text-align:right}.meta{margin-bottom:16px;line-height:1.8}</style></head><body><h2>Заказ</h2><div class="meta">' + meta + '</div><table><thead><tr><th>#</th><th>Позиция</th><th>Категория</th><th>Ткань</th><th>Сторона</th><th>Размер</th><th>Кол.</th><th>Цена</th><th>Итого</th></tr></thead><tbody>' + rows + '</tbody></table><div class="total">' + fin + '</div></body></html>');
  pw.document.close();
  pw.print();
}

// --- ИНИЦИАЛИЗАЦИЯ ---
onProductChange();
renderOrder();
