// Mock for src/i18n.js used by Jest unit tests.
// The real i18n.js contains a JSX component (I18nProvider) which requires
// @babel/plugin-transform-react-jsx to compile. Since pure-logic tests never
// render components, we stub the module to only export what format.js needs:
// DEFAULT_LANGUAGE, getDateNames, and translate.

const DEFAULT_LANGUAGE = 'en';

const DATE_NAMES = {
  en: {
    months: ['January', 'February', 'March', 'April', 'May', 'June',
             'July', 'August', 'September', 'October', 'November', 'December'],
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    weekdayLetters: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
    dayLabel: '{weekday}, {month} {day}',
    monthYear: '{month} {year}',
  },
  zh: {
    months: ['1月', '2月', '3月', '4月', '5月', '6月',
             '7月', '8月', '9月', '10月', '11月', '12月'],
    weekdays: ['週日', '週一', '週二', '週三', '週四', '週五', '週六'],
    weekdayLetters: ['日', '一', '二', '三', '四', '五', '六'],
    dayLabel: '{month}{day}日 {weekday}',
    monthYear: '{year}年{month}',
  },
  es: {
    months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
             'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    weekdays: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    weekdayLetters: ['D', 'L', 'M', 'X', 'J', 'V', 'S'],
    dayLabel: '{weekday}, {day} de {month}',
    monthYear: '{month} de {year}',
  },
};

const STRINGS = {
  en: {
    'date.today': 'Today',
    'date.yesterday': 'Yesterday',
  },
};

function getDateNames(language) {
  return DATE_NAMES[language] ?? DATE_NAMES.en;
}

function translate(language, key, vars) {
  const table = STRINGS[language] ?? STRINGS.en;
  let template = table[key] ?? (STRINGS.en[key] ?? key);
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] !== undefined ? String(vars[name]) : match
  );
}

// Stub React-dependent exports so any code that does `import { I18nProvider } from './i18n'`
// doesn't crash; tests simply won't call them.
const I18nProvider = () => null;
const useT = () => (key) => key;
const useLanguage = () => DEFAULT_LANGUAGE;

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '繁體中文' },
  { code: 'es', label: 'Español' },
];

module.exports = {
  DEFAULT_LANGUAGE,
  DATE_NAMES,
  LANGUAGES,
  getDateNames,
  translate,
  I18nProvider,
  useT,
  useLanguage,
};
