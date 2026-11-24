/**
 * Authored daily-experience content, editorial pack v1. Selection is fully
 * deterministic (see interpretation engine). Text describes traditional
 * symbolism and invites reflection; it does not predict events.
 */

/** Transiting Moon counted from the natal Moon sign (1–12). */
export const MOON_TRANSIT_FROM_NATAL: { title: string; body: string }[] = [
  { title: 'The Moon returns to your Moon sign', body: 'Traditionally a day when feelings feel more personal and visible. A good moment to notice what you need, without judging it.' },
  { title: 'The Moon in your 2nd from Moon', body: 'Symbolism turns to resources and words. Notice how you speak about what you value.' },
  { title: 'The Moon in your 3rd from Moon', body: 'Traditionally read as a lively, communicative day. A short message to someone you have not spoken to in a while may feel natural.' },
  { title: 'The Moon in your 4th from Moon', body: 'Attention tends to turn homeward. Small acts of care for your space or family carry the symbolism of the day.' },
  { title: 'The Moon in your 5th from Moon', body: 'Traditionally linked with play and creativity. Make room for something you enjoy for its own sake.' },
  { title: 'The Moon in your 6th from Moon', body: 'A practical, tidy-up kind of symbolism: routines, health habits and clearing small obstacles.' },
  { title: 'The Moon in your 7th from Moon', body: 'The emphasis moves to others. Conversations with close people may take centre stage.' },
  { title: 'The Moon in your 8th from Moon', body: 'Traditionally a quieter, more inward day. Rest and privacy are reasonable choices.' },
  { title: 'The Moon in your 9th from Moon', body: 'Symbolism of learning and perspective. A good day to read, study or ask a bigger question.' },
  { title: 'The Moon in your 10th from Moon', body: 'Attention turns to work and responsibilities. Notice what you want to be known for.' },
  { title: 'The Moon in your 11th from Moon', body: 'Traditionally a sociable, hopeful position. Friends and shared goals are in focus.' },
  { title: 'The Moon in your 12th from Moon', body: 'A day traditionally suited to rest, reflection and letting go of what has run its course.' },
];

export const TITHI_NOTES: Record<string, string> = {
  Pratipada: 'The first lunar day — traditionally a time for beginnings and planning.',
  Dwitiya: 'The second lunar day, traditionally suited to steady, constructive work.',
  Tritiya: 'Tritiya is traditionally regarded as favourable for creative and auspicious activity.',
  Chaturthi: 'Chaturthi is associated with Ganesha; it is one of the Rikta (empty) tithis, traditionally avoided for major beginnings.',
  Panchami: 'Panchami is traditionally associated with learning and knowledge.',
  Shashthi: 'Shashthi is associated with Skanda (Kartikeya) and with protection.',
  Saptami: 'Saptami is associated with Surya, the Sun.',
  Ashtami: 'Ashtami is associated with Durga and with discipline and observance.',
  Navami: 'Navami is a Rikta tithi, traditionally associated with intensity and devotion.',
  Dashami: 'Dashami is traditionally regarded as favourable for completing tasks.',
  Ekadashi: 'Ekadashi is widely observed with fasting and devotion to Vishnu.',
  Dwadashi: 'Dwadashi follows Ekadashi; many observers break their fast today.',
  Trayodashi: 'Trayodashi is associated with Pradosh, an evening observance for Shiva.',
  Chaturdashi: 'Chaturdashi is a Rikta tithi; in the dark fortnight it is associated with Shiva.',
  Purnima: 'Purnima, the full moon, is traditionally a day of fullness, gratitude and observance.',
  Amavasya: 'Amavasya, the new moon, is traditionally a day for quiet, remembrance of ancestors and release.',
};

export const PHASE_NOTES: Record<string, string> = {
  'New Moon': 'The Moon is dark. Many traditions treat this as a time to rest and set intentions quietly.',
  'Waxing Crescent': 'The light is returning. Traditionally a time to take first small steps.',
  'First Quarter': 'Half the Moon is lit and growing. Momentum and decisions are in the symbolism.',
  'Waxing Gibbous': 'The Moon is nearly full. Refine and keep going.',
  'Full Moon': 'The Moon is full. Traditionally a time of culmination, celebration and seeing clearly.',
  'Waning Gibbous': 'The light begins to recede. Share what you have learned.',
  'Last Quarter': 'Half lit and shrinking. Traditionally a time to review and release.',
  'Waning Crescent': 'A thin, fading Moon. Rest and simplify before the next cycle.',
};

export const DASHA_THEMES: Record<string, string> = {
  ketu: 'Ketu periods are traditionally associated with detachment, introspection and simplifying.',
  venus: 'Venus periods are traditionally associated with relationships, comfort, art and enjoyment.',
  sun: 'Sun periods are traditionally associated with visibility, authority and self-definition.',
  moon: 'Moon periods are traditionally associated with emotional life, home and care.',
  mars: 'Mars periods are traditionally associated with drive, courage and decisive action.',
  rahu: 'Rahu periods are traditionally associated with ambition, novelty and unconventional paths.',
  jupiter: 'Jupiter periods are traditionally associated with learning, growth, teachers and generosity.',
  saturn: 'Saturn periods are traditionally associated with responsibility, patience and long-term building.',
  mercury: 'Mercury periods are traditionally associated with learning, communication and commerce.',
};

export const REFLECTION_PROMPTS: string[] = [
  'What is one thing you want more of this week, and one thing you want less of?',
  'Who made today easier for you? Have you told them?',
  'What did you avoid today, and what would one small step toward it look like?',
  'Which conversation would you like to have differently next time?',
  'What does rest actually look like for you right now?',
  'What are you proud of that nobody else saw?',
  'Where did you feel most like yourself today?',
  'What is a belief you have outgrown?',
  'What would you tell a friend who was in your situation?',
  'What small ritual helps you begin your day well?',
  'Which relationship deserves more of your attention this month?',
  'What are you learning slowly, and how can you be patient with it?',
  'When did you last feel genuinely curious? What were you doing?',
  'What would “enough” look like in one area of your life?',
  'What did today teach you about your energy?',
  'What boundary would make next week calmer?',
  'Which promise to yourself do you want to keep this week?',
  'What is something beautiful you noticed today?',
  'Where are you being too hard on yourself?',
  'What are you ready to let go of before the next new moon?',
  'Who are you becoming, and what helps that person grow?',
  'What question are you carrying that you have not said aloud?',
  'What did you do today purely for joy?',
  'Which habit is quietly serving you well?',
  'What would make tomorrow ten percent kinder?',
  'What part of your story do you want to retell with more compassion?',
  'What is one thing you can finish this week?',
  'What do you need to hear today?',
  'What are you grateful for in your body today?',
  'What would it mean to trust your own timing?',
];

export interface Ritual {
  key: string;
  title: string;
  description: string;
  steps: string[];
  durationMinutes: number;
  tradition: string;
  tags: string[];
  /** Deterministic selection hints. */
  phases?: string[];
  tithis?: string[];
  weekdays?: number[];
}

export const RITUALS: Ritual[] = [
  { key: 'diya_intention', title: 'Lamp and intention', description: 'Light a lamp or candle at dusk and hold one intention in mind.', steps: ['Light a diya or candle in a safe place.', 'Sit for one minute and breathe slowly.', 'Name one intention for the coming fortnight.', 'Write it down and keep it somewhere visible.'], durationMinutes: 5, tradition: 'Widely practised in Hindu households at sandhya (dusk).', tags: ['intention', 'evening'], phases: ['New Moon', 'Waxing Crescent'] },
  { key: 'gratitude_three', title: 'Three gratitudes', description: 'Note three specific things you are grateful for today.', steps: ['Pause before sleep.', 'Write three specific moments from today.', 'Read them once aloud.'], durationMinutes: 5, tradition: 'Secular reflection practice.', tags: ['gratitude', 'evening'], phases: ['Full Moon', 'Waxing Gibbous'] },
  { key: 'surya_namaskar', title: 'Morning salutation', description: 'A gentle sun salutation sequence at your own pace.', steps: ['Face east if you can.', 'Move through a few rounds of sun salutation or simple stretches.', 'Finish with three slow breaths.'], durationMinutes: 10, tradition: 'Yoga tradition; Sunday is traditionally associated with Surya.', tags: ['movement', 'morning'], weekdays: [0] },
  { key: 'moon_water', title: 'Moonlit pause', description: 'Spend a few quiet minutes looking at the Moon or the night sky.', steps: ['Step outside or to a window.', 'Find the Moon if it is visible.', 'Notice its shape and how you feel.'], durationMinutes: 5, tradition: 'Contemplative practice; Monday is traditionally associated with Chandra.', tags: ['night', 'calm'], weekdays: [1], phases: ['Full Moon'] },
  { key: 'declutter_one', title: 'Release one thing', description: 'Choose one object, file or commitment to let go of.', steps: ['Pick one small thing that no longer serves you.', 'Donate, delete or decline it.', 'Notice the space it leaves.'], durationMinutes: 10, tradition: 'Often paired with the waning Moon in modern practice.', tags: ['release'], phases: ['Waning Gibbous', 'Last Quarter', 'Waning Crescent'] },
  { key: 'ekadashi_simplicity', title: 'Ekadashi simplicity', description: 'Many observe Ekadashi with fasting or simple food. Choose a form of simplicity that is safe for you.', steps: ['Decide on a simple meal plan or a mindful pause from something (only if it is safe for your health).', 'Spend a few minutes in prayer, chanting or quiet.', 'Note how simplicity felt.'], durationMinutes: 15, tradition: 'Vaishnava observance on the 11th lunar day. Fasting is optional and should never compromise health.', tags: ['observance'], tithis: ['Ekadashi'] },
  { key: 'ancestors_remembrance', title: 'Remembering ancestors', description: 'Take a moment to remember people who came before you.', steps: ['Sit quietly with a photo or a name in mind.', 'Offer water or a few words of thanks, as your tradition suggests.', 'Share one memory with someone in your family.'], durationMinutes: 10, tradition: 'Amavasya is traditionally associated with honouring ancestors (pitru).', tags: ['remembrance'], tithis: ['Amavasya'] },
  { key: 'purnima_gratitude', title: 'Full-moon gratitude', description: 'Celebrate something that has come to fruition.', steps: ['Name one thing that feels complete.', 'Thank someone who helped.', 'If you observe Satyanarayan katha or another puja, follow your family’s practice.'], durationMinutes: 10, tradition: 'Purnima observances vary by family and region.', tags: ['celebration'], tithis: ['Purnima'] },
  { key: 'tulsi_water', title: 'Plant care', description: 'Water a plant — tulsi if you keep one — with attention.', steps: ['Water slowly.', 'Notice new growth.', 'Spend a breath or two in appreciation.'], durationMinutes: 3, tradition: 'Caring for tulsi is a daily practice in many Hindu homes.', tags: ['morning', 'care'] },
  { key: 'mantra_108', title: 'Japa practice', description: 'Repeat a mantra or a calm phrase 108 times with a mala or by counting breaths.', steps: ['Choose a mantra from your tradition or a simple phrase.', 'Sit comfortably.', 'Repeat it, keeping count with a mala or your fingers.'], durationMinutes: 15, tradition: 'Japa is common across Hindu, Buddhist and Jain traditions.', tags: ['practice'], weekdays: [4] },
  { key: 'letter_kindness', title: 'A note of kindness', description: 'Send a short, sincere note to someone.', steps: ['Think of someone who would appreciate hearing from you.', 'Write two or three honest sentences.', 'Send it without expecting a reply.'], durationMinutes: 5, tradition: 'Secular practice; Friday is traditionally associated with Shukra (Venus).', tags: ['connection'], weekdays: [5] },
  { key: 'saturday_service', title: 'Quiet service', description: 'Do one helpful thing without announcing it.', steps: ['Find one small way to help someone.', 'Do it quietly.', 'Reflect on how it felt.'], durationMinutes: 15, tradition: 'Saturday is traditionally associated with Shani (Saturn) and with service and patience.', tags: ['service'], weekdays: [6] },
  { key: 'learning_ten', title: 'Ten minutes of learning', description: 'Read or study something that interests you for ten minutes.', steps: ['Choose a book, lesson or article.', 'Read for ten focused minutes.', 'Note one idea you want to remember.'], durationMinutes: 10, tradition: 'Wednesday is traditionally associated with Budha (Mercury) and learning.', tags: ['learning'], weekdays: [3] },
  { key: 'tuesday_courage', title: 'One brave step', description: 'Take one small step toward something you have been postponing.', steps: ['Name the thing you are avoiding.', 'Choose the smallest possible next step.', 'Do it today.'], durationMinutes: 10, tradition: 'Tuesday is traditionally associated with Mangala (Mars).', tags: ['courage'], weekdays: [2] },
];

export interface DailyLesson { key: string; title: string; body: string; quiz?: { question: string; options: string[]; answer: number } }

export const DAILY_LESSONS: DailyLesson[] = [
  { key: 'zodiacs', title: 'Two zodiacs, one sky', body: 'Western astrology usually uses the tropical zodiac, anchored to the equinoxes. Vedic astrology uses the sidereal zodiac, anchored to the stars. The difference (the ayanamsa) is about 24° today, so your Vedic Sun sign is often the sign before your Western one.', quiz: { question: 'What is the ayanamsa?', options: ['A house system', 'The offset between tropical and sidereal zodiacs', 'A type of dasha'], answer: 1 } },
  { key: 'nakshatras', title: 'What is a nakshatra?', body: 'The 27 nakshatras divide the zodiac into segments of 13°20′. Your Janma Nakshatra is the one the Moon occupied at birth. Each is divided into four padas of 3°20′.', quiz: { question: 'How many nakshatras are there?', options: ['12', '27', '36'], answer: 1 } },
  { key: 'ascendant', title: 'Why birth time matters', body: 'The Ascendant (Lagna) is the sign rising on the eastern horizon at your birth moment. It moves through all twelve signs in about a day, so even a few minutes can change it. That is why Nakshatra marks the Ascendant as uncertain when your birth time is approximate.' },
  { key: 'houses', title: 'Houses are areas of life', body: 'Signs describe style; houses describe areas of life — home, work, partnership and so on. Different house systems divide the sky differently. Vedic astrology commonly uses whole-sign houses; many Western astrologers use Placidus.' },
  { key: 'dashas', title: 'Dasha periods', body: 'Vimshottari dasha divides a 120-year cycle among nine grahas. The starting period is set by your Moon’s nakshatra. Dashas are a traditional way of describing chapters of life, not a calendar of guaranteed events.' },
  { key: 'tithi', title: 'Tithi: the lunar day', body: 'A tithi is the time the Moon takes to gain 12° on the Sun. There are 30 in a lunar month — 15 in the bright fortnight (Shukla) and 15 in the dark fortnight (Krishna). Tithis do not line up with midnight, so a calendar day can contain two.' },
  { key: 'aspects', title: 'Aspects', body: 'An aspect is an angle between two planets. Western astrology uses conjunctions (0°), sextiles (60°), squares (90°), trines (120°) and oppositions (180°). In Vedic astrology every graha aspects the 7th sign from itself, and Mars, Jupiter and Saturn have special aspects.' },
  { key: 'retrograde', title: 'Retrograde motion', body: 'A planet appears to move backwards when Earth overtakes it (or it overtakes Earth) in orbit. The planet does not actually reverse; it is a line-of-sight effect. Astrology traditionally reads retrograde periods as times for review.' },
  { key: 'guna', title: 'Guna Milan in brief', body: 'Ashtakoota Guna Milan compares two Moon positions across eight factors worth 36 points. It is a traditional framework used in many Indian families; it is not a measured predictor of relationship success.' },
  { key: 'panchang', title: 'The five limbs of the Panchang', body: 'Panchang means “five limbs”: tithi (lunar day), vara (weekday), nakshatra (Moon’s star), yoga (Sun + Moon combination) and karana (half a tithi).' },
  { key: 'rahu_ketu', title: 'Rahu and Ketu', body: 'Rahu and Ketu are not physical bodies. They are the two points where the Moon’s orbit crosses the ecliptic — the lunar nodes — and are always exactly opposite each other.' },
  { key: 'elements', title: 'Elements and modalities', body: 'Each sign belongs to an element (fire, earth, air, water) and a modality (cardinal, fixed, mutable). Counting where your planets fall gives a simple picture of emphasis in your chart.' },
];

export const DAILY_COLOR_BY_WEEKDAY = ['Saffron', 'White', 'Red', 'Green', 'Yellow', 'Pastel blue', 'Indigo'];
