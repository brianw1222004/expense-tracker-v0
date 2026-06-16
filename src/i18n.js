import { createContext, useCallback, useContext } from 'react';

// App-wide localization. The language lives in settings (per user, default
// 'en'); I18nProvider re-renders everything on change. translate() is exported
// separately for non-component code (e.g. day labels built in deriveViewData).
// Missing keys fall back to English, then to the key itself, so a new string
// never renders blank in a partially translated language.

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '繁體中文' },
  { code: 'es', label: 'Español' },
];

export const DEFAULT_LANGUAGE = 'en';

const STRINGS = {
  en: {
    'tabs.add': 'Add expense',

    'common.close': 'Close',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',

    'empty.title': 'No expenses yet',
    'empty.hint': 'Start tracking your spending by recording your first expense.',
    'empty.addFirst': 'Add your first expense',
    'empty.loadDemo': 'or try with sample data',

    'dash.today': 'Today',
    'dash.expenses': 'Expenses',
    'dash.avgPerDay': 'Avg / day',
    'dash.trend': 'This Month',
    'dash.monthlySpending': 'Monthly Spending',
    'dash.vsLastMonth': 'vs last month',
    'dash.daysLeft': 'Days left',
    'dash.budgetUsed': 'Budget',

    'budget.title': 'Budget',
    'budget.spentOf': '{spent} of {budget}',
    'budget.remaining': 'Remaining',
    'budget.overBy': 'Over budget',
    'budget.edit': 'Edit budgets',
    'budget.categoryTitle': 'Category budgets',
    'budget.sheetTitle': 'Budgets',
    'budget.currencySection': 'Display currency',
    'budget.currencyNote': 'All totals, charts and budgets use this currency. Entries keep their original amount.',
    'budget.overallSection': 'Overall monthly budget',
    'budget.overallNote': 'One limit for all spending. Leave empty to budget by category only.',
    'budget.categorySection': 'Category budgets',
    'budget.categoryNote': 'Monthly limits for the categories you want to watch. Leave a category empty for no limit.',
    'budget.externalSection': 'External categories',
    'budget.externalNote': 'External categories (e.g. rent, tuition) are tracked separately and don’t count toward your overall budget.',
    'budget.noBudget': 'No budget set',
    'budget.externalTotal': 'External',

    'list.title': 'Expenses',
    'list.all': 'All',
    'list.noMatch': 'No {category} expenses yet.',
    'list.noneOnDay': 'No expenses on this day.',
    'list.deleteTitle': 'Delete expense?',

    'add.title': 'Add expense',
    'add.notePlaceholder': 'What was it for?',
    'add.save': 'Add expense',
    'add.chooseDate': 'Choose date',
    'add.prevDay': 'Previous day',
    'add.nextDay': 'Next day',
    'add.prevMonth': 'Previous month',
    'add.nextMonth': 'Next month',
    'add.added': 'Expense added',

    'edit.title': 'Edit expense',
    'edit.save': 'Save changes',

    'cats.title': 'Categories',
    'cats.emptyHint': 'Add a few expenses to see how each category trends month over month.',
    'cats.newCat': 'new',
    'cats.addCategory': 'Add Category',
    'cats.editCategory': 'Edit Category',
    'cats.categoryName': 'Name',
    'cats.pickIcon': 'Icon',
    'cats.pickColor': 'Color',
    'cats.external': 'External',
    'cats.externalHint': 'Won’t count toward your overall budget',
    'cats.save': 'Save',

    'acct.title': 'Account',
    'acct.section': 'Account',
    'acct.localTitle': 'Local device',
    'acct.localNote': 'Your data is stored only on this device.',
    'acct.syncedNote': 'Your expenses are synced to this account and available on any device.',
    'acct.signOut': 'Sign out',
    'acct.signOutBody': 'Your expenses stay synced to your account.',
    'acct.language': 'Language',
    'acct.theme': 'Theme',
    'theme.vivid': 'Vivid',
    'theme.slate': 'Slate',
    'theme.sand': 'Sand',
    'theme.neutral': 'Neutral',
    'theme.plum': 'Plum',
    'acct.comingSoon': 'Coming soon',
    'acct.exportCsv': 'Export CSV',
    'acct.soon': 'Soon',

    'auth.title': 'Expense Tracker',
    'auth.signInSubtitle': 'Sign in to see your expenses on any device.',
    'auth.signUpSubtitle': 'Create an account to keep your expenses backed up.',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.passwordNew': 'Password (min. 6 characters)',
    'auth.signIn': 'Sign in',
    'auth.signUp': 'Create account',
    'auth.switchToSignUpPrefix': 'New here? ',
    'auth.switchToSignUpAction': 'Create an account',
    'auth.switchToSignInPrefix': 'Already have an account? ',
    'auth.switchToSignInAction': 'Sign in',
    'auth.missingFields': 'Enter your email and a password.',
    'auth.confirmTitle': 'Check your email',
    'auth.confirmBody': 'We sent a confirmation link to {email}. Tap the link to activate your account, then come back to sign in.',
    'auth.backToSignIn': 'Back to sign in',
    'auth.network': "Couldn't reach the server. Check your connection and try again.",

    'cat.food': 'Food',
    'cat.groceries': 'Groceries',
    'cat.transport': 'Transport',
    'cat.shopping': 'Shopping',
    'cat.fun': 'Fun',
    'cat.health': 'Health',
    'cat.bills': 'Bills',
    'cat.other': 'Other',

    'onboard.welcome': 'Welcome!',
    'onboard.subtitle': "Let's set up your preferences.",
    'onboard.budget': 'Monthly budget',
    'onboard.budgetHint': 'A spending limit for the month. You can always change it later.',
    'onboard.budgetPlaceholder': 'e.g. 1000',
    'onboard.language': 'Language',
    'onboard.getStarted': 'Get started',

    'date.today': 'Today',
    'date.yesterday': 'Yesterday',
  },

  zh: {
    'tabs.add': '新增支出',

    'common.close': '關閉',
    'common.cancel': '取消',
    'common.delete': '刪除',

    'empty.title': '還沒有任何支出',
    'empty.hint': '記下你的第一筆支出，開始追蹤花費。',
    'empty.addFirst': '新增第一筆支出',
    'empty.loadDemo': '或使用範例資料體驗',

    'dash.today': '今天',
    'dash.expenses': '筆數',
    'dash.avgPerDay': '日均',
    'dash.trend': '本月趨勢',
    'dash.monthlySpending': '每月支出',
    'dash.vsLastMonth': '較上月',
    'dash.daysLeft': '剩餘天數',
    'dash.budgetUsed': '預算',

    'budget.title': '預算',
    'budget.spentOf': '已花 {spent}／{budget}',
    'budget.remaining': '剩餘',
    'budget.overBy': '超支',
    'budget.edit': '編輯預算',
    'budget.categoryTitle': '分類預算',
    'budget.sheetTitle': '預算',
    'budget.currencySection': '顯示貨幣',
    'budget.currencyNote': '所有總額、圖表與預算都以此貨幣顯示，每筆支出仍保留原始金額。',
    'budget.overallSection': '每月總預算',
    'budget.overallNote': '所有支出共用一個上限；留空則僅使用分類預算。',
    'budget.categorySection': '分類預算',
    'budget.categoryNote': '為想留意的分類設定每月上限，留空表示不設限。',
    'budget.externalSection': '外部分類',
    'budget.externalNote': '外部分類（如房租、學費）獨立追蹤，不計入總預算。',
    'budget.noBudget': '尚未設定預算',
    'budget.externalTotal': '外部支出',

    'list.title': '支出',
    'list.all': '全部',
    'list.noMatch': '還沒有「{category}」的支出。',
    'list.noneOnDay': '這天沒有支出。',
    'list.deleteTitle': '刪除這筆支出？',

    'add.title': '新增支出',
    'add.notePlaceholder': '這筆花在哪裡？',
    'add.save': '新增支出',
    'add.chooseDate': '選擇日期',
    'add.prevDay': '前一天',
    'add.nextDay': '後一天',
    'add.prevMonth': '上個月',
    'add.nextMonth': '下個月',
    'add.added': '已新增支出',

    'edit.title': '編輯支出',
    'edit.save': '儲存變更',

    'cats.title': '分類',
    'cats.emptyHint': '記幾筆支出後，就能看到各分類逐月的變化。',
    'cats.newCat': '新',
    'cats.addCategory': '新增分類',
    'cats.editCategory': '編輯分類',
    'cats.categoryName': '名稱',
    'cats.pickIcon': '圖示',
    'cats.pickColor': '顏色',
    'cats.external': '外部',
    'cats.externalHint': '不計入總預算',
    'cats.save': '儲存',

    'acct.title': '帳戶',
    'acct.section': '帳戶',
    'acct.localTitle': '本機模式',
    'acct.localNote': '資料只儲存在這台裝置上。',
    'acct.syncedNote': '支出已同步至此帳戶，任何裝置都能存取。',
    'acct.signOut': '登出',
    'acct.signOutBody': '你的支出仍會保留在帳戶中。',
    'acct.language': '語言',
    'acct.theme': '主題',
    'theme.vivid': '鮮彩',
    'theme.slate': '石板',
    'theme.sand': '沙岩',
    'theme.neutral': '中性',
    'theme.plum': '梅紫',
    'acct.comingSoon': '即將推出',
    'acct.exportCsv': '匯出 CSV',
    'acct.soon': '即將推出',

    'auth.title': '記帳本',
    'auth.signInSubtitle': '登入後即可在任何裝置查看你的支出。',
    'auth.signUpSubtitle': '建立帳戶以備份你的支出。',
    'auth.email': '電子郵件',
    'auth.password': '密碼',
    'auth.passwordNew': '密碼（至少 6 個字元）',
    'auth.signIn': '登入',
    'auth.signUp': '建立帳戶',
    'auth.switchToSignUpPrefix': '第一次使用？',
    'auth.switchToSignUpAction': '建立帳戶',
    'auth.switchToSignInPrefix': '已經有帳戶了？',
    'auth.switchToSignInAction': '登入',
    'auth.missingFields': '請輸入電子郵件和密碼。',
    'auth.confirmTitle': '請查看你的信箱',
    'auth.confirmBody': '我們已將確認連結寄到 {email}。點擊連結啟用帳戶，然後回來登入。',
    'auth.backToSignIn': '返回登入',
    'auth.network': '無法連線到伺服器，請檢查網路後再試一次。',

    'cat.food': '餐飲',
    'cat.groceries': '雜貨',
    'cat.transport': '交通',
    'cat.shopping': '購物',
    'cat.fun': '娛樂',
    'cat.health': '健康',
    'cat.bills': '帳單',
    'cat.other': '其他',

    'onboard.welcome': '歡迎！',
    'onboard.subtitle': '先來設定你的偏好。',
    'onboard.budget': '每月預算',
    'onboard.budgetHint': '每月的支出上限，之後隨時可以修改。',
    'onboard.budgetPlaceholder': '例如 1000',
    'onboard.language': '語言',
    'onboard.getStarted': '開始使用',

    'date.today': '今天',
    'date.yesterday': '昨天',
  },

  es: {
    'tabs.add': 'Añadir gasto',

    'common.close': 'Cerrar',
    'common.cancel': 'Cancelar',
    'common.delete': 'Eliminar',

    'empty.title': 'Aún no hay gastos',
    'empty.hint': 'Empieza a controlar tus gastos registrando el primero.',
    'empty.addFirst': 'Añadir tu primer gasto',
    'empty.loadDemo': 'o prueba con datos de ejemplo',

    'dash.today': 'Hoy',
    'dash.expenses': 'Gastos',
    'dash.avgPerDay': 'Media/día',
    'dash.trend': 'Este mes',
    'dash.monthlySpending': 'Gasto mensual',
    'dash.vsLastMonth': 'vs mes anterior',
    'dash.daysLeft': 'Días restantes',
    'dash.budgetUsed': 'Presupuesto',

    'budget.title': 'Presupuesto',
    'budget.spentOf': '{spent} de {budget}',
    'budget.remaining': 'Restante',
    'budget.overBy': 'Sobre presupuesto',
    'budget.edit': 'Editar presupuestos',
    'budget.categoryTitle': 'Presupuestos por categoría',
    'budget.sheetTitle': 'Presupuestos',
    'budget.currencySection': 'Moneda de visualización',
    'budget.currencyNote': 'Todos los totales, gráficos y presupuestos usan esta moneda. Cada gasto conserva su importe original.',
    'budget.overallSection': 'Presupuesto mensual total',
    'budget.overallNote': 'Un límite para todo el gasto. Déjalo vacío para presupuestar solo por categoría.',
    'budget.categorySection': 'Presupuestos por categoría',
    'budget.categoryNote': 'Límites mensuales para las categorías que quieras vigilar. Deja una categoría vacía para no fijar límite.',
    'budget.externalSection': 'Categorías externas',
    'budget.externalNote': 'Las categorías externas (ej. alquiler, matrícula) se siguen por separado y no cuentan en tu presupuesto total.',
    'budget.noBudget': 'Sin presupuesto',
    'budget.externalTotal': 'Externo',

    'list.title': 'Gastos',
    'list.all': 'Todo',
    'list.noMatch': 'Aún no hay gastos de {category}.',
    'list.noneOnDay': 'Sin gastos en este día.',
    'list.deleteTitle': '¿Eliminar gasto?',

    'add.title': 'Añadir gasto',
    'add.notePlaceholder': '¿En qué fue?',
    'add.save': 'Añadir gasto',
    'add.chooseDate': 'Elegir fecha',
    'add.prevDay': 'Día anterior',
    'add.nextDay': 'Día siguiente',
    'add.prevMonth': 'Mes anterior',
    'add.nextMonth': 'Mes siguiente',
    'add.added': 'Gasto añadido',

    'edit.title': 'Editar gasto',
    'edit.save': 'Guardar cambios',

    'cats.title': 'Categorías',
    'cats.emptyHint': 'Añade algunos gastos para ver la tendencia mensual de cada categoría.',
    'cats.newCat': 'nuevo',
    'cats.addCategory': 'Añadir categoría',
    'cats.editCategory': 'Editar categoría',
    'cats.categoryName': 'Nombre',
    'cats.pickIcon': 'Icono',
    'cats.pickColor': 'Color',
    'cats.external': 'Externa',
    'cats.externalHint': 'No cuenta para tu presupuesto total',
    'cats.save': 'Guardar',

    'acct.title': 'Cuenta',
    'acct.section': 'Cuenta',
    'acct.localTitle': 'Dispositivo local',
    'acct.localNote': 'Tus datos se guardan solo en este dispositivo.',
    'acct.syncedNote': 'Tus gastos se sincronizan con esta cuenta y están disponibles en cualquier dispositivo.',
    'acct.signOut': 'Cerrar sesión',
    'acct.signOutBody': 'Tus gastos seguirán sincronizados con tu cuenta.',
    'acct.language': 'Idioma',
    'acct.theme': 'Tema',
    'theme.vivid': 'Vívido',
    'theme.slate': 'Pizarra',
    'theme.sand': 'Arena',
    'theme.neutral': 'Neutro',
    'theme.plum': 'Ciruela',
    'acct.comingSoon': 'Próximamente',
    'acct.exportCsv': 'Exportar CSV',
    'acct.soon': 'Pronto',

    'auth.title': 'Expense Tracker',
    'auth.signInSubtitle': 'Inicia sesión para ver tus gastos en cualquier dispositivo.',
    'auth.signUpSubtitle': 'Crea una cuenta para mantener tus gastos respaldados.',
    'auth.email': 'Correo electrónico',
    'auth.password': 'Contraseña',
    'auth.passwordNew': 'Contraseña (mín. 6 caracteres)',
    'auth.signIn': 'Iniciar sesión',
    'auth.signUp': 'Crear cuenta',
    'auth.switchToSignUpPrefix': '¿Primera vez? ',
    'auth.switchToSignUpAction': 'Crea una cuenta',
    'auth.switchToSignInPrefix': '¿Ya tienes cuenta? ',
    'auth.switchToSignInAction': 'Inicia sesión',
    'auth.missingFields': 'Introduce tu correo y una contraseña.',
    'auth.confirmTitle': 'Revisa tu correo',
    'auth.confirmBody': 'Enviamos un enlace de confirmación a {email}. Toca el enlace para activar tu cuenta y luego vuelve para iniciar sesión.',
    'auth.backToSignIn': 'Volver a iniciar sesión',
    'auth.network': 'No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.',

    'cat.food': 'Comida',
    'cat.groceries': 'Súper',
    'cat.transport': 'Transporte',
    'cat.shopping': 'Compras',
    'cat.fun': 'Ocio',
    'cat.health': 'Salud',
    'cat.bills': 'Facturas',
    'cat.other': 'Otros',

    'onboard.welcome': '¡Bienvenido!',
    'onboard.subtitle': 'Configura tus preferencias.',
    'onboard.budget': 'Presupuesto mensual',
    'onboard.budgetHint': 'Un límite de gasto mensual. Puedes cambiarlo en cualquier momento.',
    'onboard.budgetPlaceholder': 'ej. 1000',
    'onboard.language': 'Idioma',
    'onboard.getStarted': 'Empezar',

    'date.today': 'Hoy',
    'date.yesterday': 'Ayer',
  },
};

// Date-name tables used by format.js (kept here so all language data lives in
// one file). Weekday letters are the calendar header (Sunday-first).
const DATE_NAMES = {
  en: {
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    weekdayLetters: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
    dayLabel: '{weekday}, {month} {day}',
    monthYear: '{month} {year}',
  },
  zh: {
    months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    weekdays: ['週日', '週一', '週二', '週三', '週四', '週五', '週六'],
    weekdayLetters: ['日', '一', '二', '三', '四', '五', '六'],
    dayLabel: '{month}{day}日 {weekday}',
    monthYear: '{year}年{month}',
  },
  es: {
    months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    weekdays: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    weekdayLetters: ['D', 'L', 'M', 'X', 'J', 'V', 'S'],
    dayLabel: '{weekday}, {day} de {month}',
    monthYear: '{month} de {year}',
  },
};

export function getDateNames(language) {
  return DATE_NAMES[language] ?? DATE_NAMES.en;
}

function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] !== undefined ? String(vars[name]) : match
  );
}

export function translate(language, key, vars) {
  const table = STRINGS[language] ?? STRINGS.en;
  const template = table[key] ?? STRINGS.en[key] ?? key;
  return interpolate(template, vars);
}

const I18nContext = createContext(DEFAULT_LANGUAGE);

export function I18nProvider({ language, children }) {
  return <I18nContext.Provider value={language || DEFAULT_LANGUAGE}>{children}</I18nContext.Provider>;
}

// Components: const t = useT(); t('budget.spentOf', { spent: '$12', budget: '$50' })
export function useT() {
  const language = useContext(I18nContext);
  return useCallback((key, vars) => translate(language, key, vars), [language]);
}

export function useLanguage() {
  return useContext(I18nContext);
}
