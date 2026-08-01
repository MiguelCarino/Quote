// i18n — fleet-standard localization for Quote (quote.carino.systems).
// English strings ARE the keys, so a missing entry falls back to English.
// The es/ja columns were salvaged from the old in-app i18next selector
// (en/es/ja) and extended with pt-BR and ru for the five-language fleet set.
// Locale comes from carino-lang.js: window.CarinoLang.current at load +
// the 'carino:langchange' event. Quote/catalog line items are business
// DATA (translate="no") and are never run through these dictionaries;
// a loaded config JSON may still merge extra entries (see index.html).
// Load order: carino-navbar.js -> carino-lang.js -> i18n.js (all deferred).

const I18N = {
    es: {
        // Sidebar chrome
        'Global Settings': 'Configuración global',
        'Target Currency': 'Moneda de destino',
        'VAT (%)': 'IVA (%)',
        'Quotation': 'Cotización',
        'Bill To (Client)': 'Facturar a (cliente)',
        'Quote #': 'N.º de cotización',
        'Valid Until': 'Válido hasta',
        'Item Details': 'Detalles del ítem',
        'Editing Item': 'Editando ítem',
        'Catalog': 'Catálogo',
        'Browse Catalog': 'Explorar catálogo',
        'Description': 'Descripción',
        'Qty': 'Cant.',
        'Price': 'Precio',
        'Currency': 'Moneda',
        'Price includes VAT (Strip it)': 'El precio incluye IVA (desglosarlo)',
        'Provider': 'Proveedor',
        'Link': 'Enlace',
        'Notes': 'Notas',
        'Add Item': 'Agregar ítem',
        'Update Item': 'Actualizar ítem',
        'Clear': 'Limpiar',
        'Actions & Export': 'Acciones y exportar',
        'Excel': 'Excel',
        'PDF': 'PDF',
        'Image': 'Imagen',
        'Email': 'Correo',
        'Load Config': 'Cargar configuración',
        'Config Loaded': 'Configuración cargada',
        'Drop JSON here or click': 'Arrastra un JSON aquí o haz clic',
        'Reset All': 'Reiniciar todo',
        // Catalog browser
        'Search products & services…': 'Buscar productos y servicios…',
        'All': 'Todos',
        'No matching items': 'Sin coincidencias',
        'Click to fill the form; use + to add directly': 'Clic para rellenar el formulario; usa + para agregar directamente',
        // Document / table
        'General Quotation': 'Cotización general',
        'Details': 'Detalles',
        'Unit (net)': 'Unit. (neto)',
        'Amount (net)': 'Importe (neto)',
        'Subtotal': 'Subtotal',
        'VAT': 'IVA',
        'TOTAL (Inc. VAT)': 'TOTAL (IVA incl.)',
        'incl. VAT': 'IVA incl.',
        'Date': 'Fecha',
        'Bill To': 'Facturar a',
        // Dialogs & messages
        'Delete all data?': '¿Borrar todos los datos?',
        'Remove this item?': '¿Quitar este ítem?',
        'Description and a price greater than 0 are required': 'Se requieren una descripción y un precio mayor que 0',
        'Invalid JSON file': 'Archivo JSON no válido',
        'Here is the quotation summary:': 'Aquí está el resumen de la cotización:',
        'Live exchange rates unavailable — converted amounts may be inaccurate.': 'Tipos de cambio no disponibles: los importes convertidos pueden ser inexactos.',
    },
    'pt-BR': {
        'Global Settings': 'Configurações globais',
        'Target Currency': 'Moeda de destino',
        'VAT (%)': 'IVA (%)',
        'Quotation': 'Orçamento',
        'Bill To (Client)': 'Faturar para (cliente)',
        'Quote #': 'Nº do orçamento',
        'Valid Until': 'Válido até',
        'Item Details': 'Detalhes do item',
        'Editing Item': 'Editando item',
        'Catalog': 'Catálogo',
        'Browse Catalog': 'Explorar catálogo',
        'Description': 'Descrição',
        'Qty': 'Qtd.',
        'Price': 'Preço',
        'Currency': 'Moeda',
        'Price includes VAT (Strip it)': 'O preço inclui IVA (removê-lo)',
        'Provider': 'Fornecedor',
        'Link': 'Link',
        'Notes': 'Observações',
        'Add Item': 'Adicionar item',
        'Update Item': 'Atualizar item',
        'Clear': 'Limpar',
        'Actions & Export': 'Ações e exportação',
        'Excel': 'Excel',
        'PDF': 'PDF',
        'Image': 'Imagem',
        'Email': 'E-mail',
        'Load Config': 'Carregar configuração',
        'Config Loaded': 'Configuração carregada',
        'Drop JSON here or click': 'Solte um JSON aqui ou clique',
        'Reset All': 'Redefinir tudo',
        'Search products & services…': 'Buscar produtos e serviços…',
        'All': 'Todos',
        'No matching items': 'Nenhum item encontrado',
        'Click to fill the form; use + to add directly': 'Clique para preencher o formulário; use + para adicionar direto',
        'General Quotation': 'Orçamento geral',
        'Details': 'Detalhes',
        'Unit (net)': 'Unit. (líquido)',
        'Amount (net)': 'Valor (líquido)',
        'Subtotal': 'Subtotal',
        'VAT': 'IVA',
        'TOTAL (Inc. VAT)': 'TOTAL (com IVA)',
        'incl. VAT': 'IVA incl.',
        'Date': 'Data',
        'Bill To': 'Faturar para',
        'Delete all data?': 'Apagar todos os dados?',
        'Remove this item?': 'Remover este item?',
        'Description and a price greater than 0 are required': 'São necessários uma descrição e um preço maior que 0',
        'Invalid JSON file': 'Arquivo JSON inválido',
        'Here is the quotation summary:': 'Segue o resumo do orçamento:',
        'Live exchange rates unavailable — converted amounts may be inaccurate.': 'Câmbio ao vivo indisponível: os valores convertidos podem estar imprecisos.',
    },
    ja: {
        'Global Settings': '全体設定',
        'Target Currency': '見積通貨',
        'VAT (%)': '消費税 (%)',
        'Quotation': '見積',
        'Bill To (Client)': '請求先 (顧客)',
        'Quote #': '見積番号',
        'Valid Until': '有効期限',
        'Item Details': 'アイテム詳細',
        'Editing Item': '編集中',
        'Catalog': 'カタログ',
        'Browse Catalog': 'カタログを見る',
        'Description': '説明',
        'Qty': '数量',
        'Price': '価格',
        'Currency': '通貨',
        'Price includes VAT (Strip it)': '税込価格 (税を抜く)',
        'Provider': '提供元',
        'Link': 'リンク',
        'Notes': '備考',
        'Add Item': '追加',
        'Update Item': '更新',
        'Clear': 'クリア',
        'Actions & Export': '操作とエクスポート',
        'Excel': 'Excel',
        'PDF': 'PDF',
        'Image': '画像',
        'Email': 'メール',
        'Load Config': '設定をロード',
        'Config Loaded': '設定を読み込みました',
        'Drop JSON here or click': 'JSONをドロップまたはクリック',
        'Reset All': 'すべてリセット',
        'Search products & services…': '製品・サービスを検索…',
        'All': 'すべて',
        'No matching items': '該当なし',
        'Click to fill the form; use + to add directly': 'クリックでフォームに入力、+ で直接追加',
        'General Quotation': '一般見積',
        'Details': '詳細',
        'Unit (net)': '単価 (税抜)',
        'Amount (net)': '金額 (税抜)',
        'Subtotal': '小計',
        'VAT': '消費税',
        'TOTAL (Inc. VAT)': '合計 (税込)',
        'incl. VAT': '税込',
        'Date': '日付',
        'Bill To': '請求先',
        'Delete all data?': 'すべてのデータを削除しますか？',
        'Remove this item?': 'このアイテムを削除しますか？',
        'Description and a price greater than 0 are required': '説明と0より大きい価格が必要です',
        'Invalid JSON file': '無効なJSONファイルです',
        'Here is the quotation summary:': '見積もりの概要です:',
        'Live exchange rates unavailable — converted amounts may be inaccurate.': '為替レートを取得できません — 換算額が不正確な場合があります。',
    },
    ru: {
        'Global Settings': 'Общие настройки',
        'Target Currency': 'Целевая валюта',
        'VAT (%)': 'НДС (%)',
        'Quotation': 'Смета',
        'Bill To (Client)': 'Плательщик (клиент)',
        'Quote #': 'Номер сметы',
        'Valid Until': 'Действительно до',
        'Item Details': 'Данные позиции',
        'Editing Item': 'Редактирование позиции',
        'Catalog': 'Каталог',
        'Browse Catalog': 'Открыть каталог',
        'Description': 'Описание',
        'Qty': 'Кол-во',
        'Price': 'Цена',
        'Currency': 'Валюта',
        'Price includes VAT (Strip it)': 'Цена включает НДС (вычесть его)',
        'Provider': 'Поставщик',
        'Link': 'Ссылка',
        'Notes': 'Примечания',
        'Add Item': 'Добавить позицию',
        'Update Item': 'Обновить позицию',
        'Clear': 'Очистить',
        'Actions & Export': 'Действия и экспорт',
        'Excel': 'Excel',
        'PDF': 'PDF',
        'Image': 'Изображение',
        'Email': 'Эл. почта',
        'Load Config': 'Загрузить конфиг',
        'Config Loaded': 'Конфиг загружен',
        'Drop JSON here or click': 'Перетащите JSON сюда или нажмите',
        'Reset All': 'Сбросить всё',
        'Search products & services…': 'Поиск товаров и услуг…',
        'All': 'Все',
        'No matching items': 'Ничего не найдено',
        'Click to fill the form; use + to add directly': 'Нажмите, чтобы заполнить форму; + добавляет сразу',
        'General Quotation': 'Общая смета',
        'Details': 'Детали',
        'Unit (net)': 'Цена (без НДС)',
        'Amount (net)': 'Сумма (без НДС)',
        'Subtotal': 'Промежуточный итог',
        'VAT': 'НДС',
        'TOTAL (Inc. VAT)': 'ИТОГО (с НДС)',
        'incl. VAT': 'с НДС',
        'Date': 'Дата',
        'Bill To': 'Плательщик',
        'Delete all data?': 'Удалить все данные?',
        'Remove this item?': 'Удалить эту позицию?',
        'Description and a price greater than 0 are required': 'Нужны описание и цена больше 0',
        'Invalid JSON file': 'Недопустимый файл JSON',
        'Here is the quotation summary:': 'Краткое содержание сметы:',
        'Live exchange rates unavailable — converted amounts may be inaccurate.': 'Актуальные курсы валют недоступны — пересчитанные суммы могут быть неточными.',
    },
};

let LOCALE = 'en';

function setLocale(l) {
    LOCALE = (l === 'en' || I18N[l]) ? l : 'en';
    document.documentElement.lang = LOCALE;
}

function t(key) {
    const dict = I18N[LOCALE];
    return (dict && dict[key]) || key;
}

// Static markup: elements carrying data-i18n use their original English text
// as the key (captured on first pass so locale switches stay reversible).
// Code that swaps an element's label (Add Item <-> Update Item, Load Config
// -> Config Loaded) also updates el.dataset.i18nKey so the swap survives.
function applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        if (!el.dataset.i18nKey) el.dataset.i18nKey = el.textContent.trim();
        el.textContent = t(el.dataset.i18nKey);
    });
}

// Re-translate the page: static markup, then whatever dynamic surfaces the
// app registered (placeholders + rendered quotation in index.html).
function refreshI18n() {
    applyStaticI18n();
    if (typeof window.onLanguageApplied === 'function') window.onLanguageApplied();
}

// carino-lang.js is deferred ahead of this file, so the resolved fleet
// language is already available at execute time; DOMContentLoaded applies it
// to the DOM and the langchange event keeps live switches in sync.
if (window.CarinoLang) setLocale(window.CarinoLang.current);

document.addEventListener('DOMContentLoaded', () => {
    if (window.CarinoLang) setLocale(window.CarinoLang.current);
    refreshI18n();
});

window.addEventListener('carino:langchange', (e) => {
    setLocale(e.detail.lang);
    refreshI18n();
});
