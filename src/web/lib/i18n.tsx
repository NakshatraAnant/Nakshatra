import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * Structured localisation. English is the source; Hindi covers navigation, core
 * actions and astrological terminology. Missing keys fall back to English and are
 * tracked in docs/IMPLEMENTATION_STATUS.md. Astrological terms use one canonical
 * translation per term (see TERMS) so they are consistent across screens.
 */
export type Locale = 'en' | 'hi';

const en = {
  'nav.home': 'Home', 'nav.merch': 'Merch', 'nav.membership': 'Nakshatra+', 'nav.discover': 'Discover', 'nav.create': 'Create', 'nav.profile': 'Profile', 'nav.identity': 'Identity', 'nav.thoughts': 'Thoughts', 'nav.circles': 'Circles', 'nav.play': 'Play', 'nav.invite': 'Invite friends',
  'nav.today': 'Daily sky', 'nav.cosmicId': 'Cosmic ID', 'nav.chart': 'Chart', 'nav.calendar': 'Calendar', 'nav.journey': 'Journey', 'nav.progress': 'Quests & streaks',
  'nav.bonds': 'Bonds', 'nav.social': 'Community', 'nav.messages': 'Messages', 'nav.dating': 'Dating', 'nav.matchmaking': 'Matchmaking',
  'nav.experts': 'Experts', 'nav.learn': 'Learn', 'nav.shop': 'Shop', 'nav.weddings': 'Weddings', 'nav.rewards': 'Rewards',
  'nav.settings': 'Settings', 'nav.admin': 'Admin', 'nav.notifications': 'Notifications', 'nav.search': 'Search', 'nav.more': 'More',
  'action.save': 'Save', 'action.cancel': 'Cancel', 'action.continue': 'Continue', 'action.back': 'Back', 'action.signIn': 'Sign in',
  'action.signUp': 'Create account', 'action.signOut': 'Sign out', 'action.share': 'Share', 'action.delete': 'Delete', 'action.edit': 'Edit',
  'action.retry': 'Try again', 'action.close': 'Close', 'action.confirm': 'Confirm', 'action.send': 'Send', 'action.search': 'Search',
  'greeting.morning': 'Good morning', 'greeting.afternoon': 'Good afternoon', 'greeting.evening': 'Good evening',
  'today.briefing': 'Your daily briefing', 'today.panchang': 'Panchang', 'today.ritual': 'Today’s ritual', 'today.reflect': 'Reflect',
  'today.lesson': 'Chart lesson', 'today.upcoming': 'Coming up',
  'state.loading': 'Loading…', 'state.empty': 'Nothing here yet', 'state.error': 'Something went wrong',
  'onboarding.title': 'When did your story begin?',
  'term.rashi': 'Rashi', 'term.lagna': 'Lagna', 'term.nakshatra': 'Nakshatra', 'term.tithi': 'Tithi', 'term.dasha': 'Dasha', 'term.sunSign': 'Sun sign',
  'term.moonSign': 'Moon sign', 'term.rising': 'Rising', 'term.pada': 'Pada', 'term.panchang': 'Panchang', 'term.muhurat': 'Muhurat',
};

type Key = keyof typeof en;

const hi: Partial<Record<Key, string>> = {
  'nav.home': 'होम', 'nav.merch': 'मर्च', 'nav.membership': 'नक्षत्र+', 'nav.discover': 'खोजें', 'nav.create': 'बनाएँ', 'nav.profile': 'प्रोफ़ाइल', 'nav.identity': 'पहचान', 'nav.thoughts': 'विचार', 'nav.circles': 'सर्कल', 'nav.play': 'खेल', 'nav.invite': 'दोस्तों को बुलाएँ',
  'nav.today': 'आज', 'nav.cosmicId': 'कॉस्मिक आईडी', 'nav.chart': 'कुंडली', 'nav.calendar': 'पंचांग', 'nav.journey': 'यात्रा',
  'nav.bonds': 'संबंध', 'nav.social': 'समुदाय', 'nav.messages': 'संदेश', 'nav.dating': 'डेटिंग', 'nav.matchmaking': 'रिश्ते',
  'nav.experts': 'विशेषज्ञ', 'nav.learn': 'सीखें', 'nav.shop': 'दुकान', 'nav.weddings': 'विवाह', 'nav.rewards': 'पुरस्कार',
  'nav.settings': 'सेटिंग्स', 'nav.admin': 'प्रशासन', 'nav.notifications': 'सूचनाएँ', 'nav.search': 'खोजें', 'nav.more': 'और',
  'action.save': 'सहेजें', 'action.cancel': 'रद्द करें', 'action.continue': 'आगे बढ़ें', 'action.back': 'वापस', 'action.signIn': 'साइन इन',
  'action.signUp': 'खाता बनाएँ', 'action.signOut': 'साइन आउट', 'action.share': 'साझा करें', 'action.delete': 'हटाएँ', 'action.edit': 'संपादित करें',
  'action.retry': 'फिर से कोशिश करें', 'action.close': 'बंद करें', 'action.confirm': 'पुष्टि करें', 'action.send': 'भेजें', 'action.search': 'खोजें',
  'greeting.morning': 'सुप्रभात', 'greeting.afternoon': 'नमस्कार', 'greeting.evening': 'शुभ संध्या',
  'today.briefing': 'आज का सार', 'today.panchang': 'पंचांग', 'today.ritual': 'आज का अनुष्ठान', 'today.reflect': 'चिंतन',
  'today.lesson': 'कुंडली पाठ', 'today.upcoming': 'आगामी',
  'state.loading': 'लोड हो रहा है…', 'state.empty': 'अभी यहाँ कुछ नहीं है', 'state.error': 'कुछ गलत हो गया',
  'onboarding.title': 'आपकी कहानी कब शुरू हुई?',
  'term.rashi': 'राशि', 'term.lagna': 'लग्न', 'term.nakshatra': 'नक्षत्र', 'term.tithi': 'तिथि', 'term.dasha': 'दशा', 'term.sunSign': 'सूर्य राशि',
  'term.moonSign': 'चंद्र राशि', 'term.rising': 'लग्न', 'term.pada': 'पद', 'term.panchang': 'पंचांग', 'term.muhurat': 'मुहूर्त',
};

const DICTS: Record<Locale, Partial<Record<Key, string>>> = { en, hi };

interface I18n { locale: Locale; t: (k: Key) => string; dateLocale: string }
const Ctx = createContext<I18n>({ locale: 'en', t: (k) => en[k], dateLocale: 'en-IN' });

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18n>(() => ({
    locale,
    t: (k) => DICTS[locale][k] ?? en[k] ?? k,
    dateLocale: locale === 'hi' ? 'hi-IN' : 'en-IN',
  }), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
export type { Key as I18nKey };
