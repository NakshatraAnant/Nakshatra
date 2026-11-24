/**
 * Authored sign content, Nakshatra editorial pack v1.
 * Written as reflective descriptions of traditional symbolism — never as predictions.
 * `identity` frames the Sun, `emotion` the Moon, `approach` the Ascendant.
 */
export interface SignContent {
  keywords: string[];
  identity: string;
  emotion: string;
  approach: string;
  vedicNote: string;
}

export const SIGN_CONTENT: SignContent[] = [
  {
    keywords: ['initiative', 'courage', 'directness'],
    identity: 'Aries symbolism centres on beginnings. People who identify with it often describe a pull toward action, a preference for honest directness and a restlessness when things stall.',
    emotion: 'A Moon in Aries is traditionally read as feelings that arrive quickly and clear quickly. Movement, a candid conversation or a physical outlet often helps more than waiting.',
    approach: 'With Aries rising, the first impression is traditionally brisk and energetic — someone who enters a room ready to begin.',
    vedicNote: 'Mesha is ruled by Mangala (Mars) and is the exaltation sign of Surya (Sun).',
  },
  {
    keywords: ['steadiness', 'senses', 'loyalty'],
    identity: 'Taurus symbolism values what lasts: steady effort, comfort, beauty and trust built slowly. Its archetype is patient and does not like to be hurried.',
    emotion: 'A Moon in Taurus is traditionally associated with emotional steadiness and a need for physical comfort, routine and reliable people.',
    approach: 'With Taurus rising, people often come across as calm, grounded and quietly appreciative of their surroundings.',
    vedicNote: 'Vrishabha is ruled by Shukra (Venus) and is the exaltation sign of Chandra (Moon).',
  },
  {
    keywords: ['curiosity', 'language', 'versatility'],
    identity: 'Gemini symbolism is about connection through ideas: curiosity, wordplay, many interests and the joy of figuring things out with others.',
    emotion: 'A Moon in Gemini is traditionally read as processing feelings by talking or writing them through, and needing variety and mental stimulation.',
    approach: 'With Gemini rising, the first impression is often lively, quick and conversational.',
    vedicNote: 'Mithuna is ruled by Budha (Mercury).',
  },
  {
    keywords: ['care', 'memory', 'belonging'],
    identity: 'Cancer symbolism centres on care and belonging — home, family (chosen or given) and protecting what matters.',
    emotion: 'A Moon in Cancer is the Moon in its own sign: traditionally deep, responsive feelings and a strong need for emotional safety.',
    approach: 'With Cancer rising, people are often perceived as warm, attentive and a little reserved until trust is established.',
    vedicNote: 'Karka is ruled by Chandra (Moon) and is the exaltation sign of Guru (Jupiter).',
  },
  {
    keywords: ['expression', 'warmth', 'generosity'],
    identity: 'Leo symbolism is about creative self-expression and warmth — the wish to make something wholehearted and to be recognised for it.',
    emotion: 'A Moon in Leo is traditionally read as a need for appreciation and for feelings to be met with enthusiasm rather than indifference.',
    approach: 'With Leo rising, the first impression is often confident, expressive and generous.',
    vedicNote: 'Simha is ruled by Surya (Sun).',
  },
  {
    keywords: ['craft', 'discernment', 'service'],
    identity: 'Virgo symbolism values craft and usefulness: noticing details, improving systems and caring through practical help.',
    emotion: 'A Moon in Virgo is traditionally associated with feeling settled when life is orderly, and with expressing care by doing something helpful.',
    approach: 'With Virgo rising, people often come across as thoughtful, observant and modest.',
    vedicNote: 'Kanya is ruled by Budha (Mercury) and is Mercury’s exaltation sign.',
  },
  {
    keywords: ['balance', 'partnership', 'fairness'],
    identity: 'Libra symbolism is about relationship and balance — fairness, beauty, diplomacy and seeing more than one side.',
    emotion: 'A Moon in Libra is traditionally read as a need for harmony and companionship, and discomfort with unresolved conflict.',
    approach: 'With Libra rising, the first impression is often gracious, sociable and considerate.',
    vedicNote: 'Tula is ruled by Shukra (Venus) and is the exaltation sign of Shani (Saturn).',
  },
  {
    keywords: ['depth', 'intensity', 'transformation'],
    identity: 'Scorpio symbolism centres on depth: loyalty, privacy, intensity and the willingness to look beneath the surface.',
    emotion: 'A Moon in Scorpio is traditionally associated with strong, private feelings and a need for trust that is earned rather than assumed.',
    approach: 'With Scorpio rising, people often come across as composed, perceptive and hard to read at first.',
    vedicNote: 'Vrishchika is ruled by Mangala (Mars); it is the debilitation sign of Chandra (Moon).',
  },
  {
    keywords: ['meaning', 'exploration', 'candour'],
    identity: 'Sagittarius symbolism is about the search for meaning — travel, study, philosophy and an honest, optimistic outlook.',
    emotion: 'A Moon in Sagittarius is traditionally read as needing space, humour and a sense that life is going somewhere.',
    approach: 'With Sagittarius rising, the first impression is often open, enthusiastic and frank.',
    vedicNote: 'Dhanu is ruled by Guru (Jupiter).',
  },
  {
    keywords: ['responsibility', 'ambition', 'patience'],
    identity: 'Capricorn symbolism values responsibility and long-term building — discipline, reliability and earned achievement.',
    emotion: 'A Moon in Capricorn is traditionally associated with emotional self-containment and finding security in competence and structure.',
    approach: 'With Capricorn rising, people often come across as serious, capable and self-possessed.',
    vedicNote: 'Makara is ruled by Shani (Saturn) and is the exaltation sign of Mangala (Mars).',
  },
  {
    keywords: ['independence', 'ideals', 'community'],
    identity: 'Aquarius symbolism is about independent thinking in service of a wider community — ideals, invention and friendship.',
    emotion: 'A Moon in Aquarius is traditionally read as needing personal freedom and processing feelings with some detachment.',
    approach: 'With Aquarius rising, the first impression is often friendly, original and a little unconventional.',
    vedicNote: 'Kumbha is ruled by Shani (Saturn).',
  },
  {
    keywords: ['imagination', 'compassion', 'intuition'],
    identity: 'Pisces symbolism centres on imagination and compassion — art, spirituality, empathy and dissolving boundaries.',
    emotion: 'A Moon in Pisces is traditionally associated with sensitivity to atmosphere and a need for quiet, creativity or retreat.',
    approach: 'With Pisces rising, people often come across as gentle, receptive and dreamy.',
    vedicNote: 'Meena is ruled by Guru (Jupiter) and is the exaltation sign of Shukra (Venus).',
  },
];

/** Authored themes for the 27 nakshatras (traditional symbolism, editorial pack v1). */
export const NAKSHATRA_CONTENT: string[] = [
  'Ashwini is associated with the divine physicians and with swift help. Its symbolism emphasises fresh starts, quick responses and healing energy.',
  'Bharani is linked with Yama and the cycle of life. Its symbolism speaks of carrying responsibility, restraint and the capacity to hold intense experiences.',
  'Krittika is linked with Agni, the fire that purifies. Its symbolism emphasises clarity, sharp discernment and protective strength.',
  'Rohini, the Moon’s favoured star, is associated with growth and beauty. Its symbolism emphasises creativity, fertility of ideas and a love of comfort.',
  'Mrigashira, the searching deer, is associated with curiosity. Its symbolism emphasises seeking, gentleness and a mind that enjoys exploring.',
  'Ardra is linked with Rudra and the storm. Its symbolism speaks of intensity that clears the air and of renewal after upheaval.',
  'Punarvasu, “return of the light”, is linked with Aditi. Its symbolism emphasises renewal, optimism and coming home to oneself.',
  'Pushya, the nourisher, is linked with Brihaspati. It is traditionally regarded as one of the most auspicious stars, associated with care and steady support.',
  'Ashlesha, the coiled serpent, is linked with the Nagas. Its symbolism emphasises perception, intuition and the wisdom of boundaries.',
  'Magha, the royal throne, is linked with the ancestors. Its symbolism emphasises lineage, dignity and honouring those who came before.',
  'Purva Phalguni is linked with Bhaga and enjoyment. Its symbolism emphasises rest, pleasure, creativity and affection.',
  'Uttara Phalguni is linked with Aryaman and agreements. Its symbolism emphasises reliability, friendship and commitments kept.',
  'Hasta, the hand, is linked with Savitr. Its symbolism emphasises skill, craftsmanship and practical ingenuity.',
  'Chitra, the bright jewel, is linked with Tvashtar the divine architect. Its symbolism emphasises design, beauty and making things well.',
  'Swati, the young shoot moved by the wind, is linked with Vayu. Its symbolism emphasises independence, adaptability and gentle persistence.',
  'Vishakha, the triumphal arch, is linked with Indra and Agni. Its symbolism emphasises dedication to a goal and the patience it takes.',
  'Anuradha, the lotus, is linked with Mitra. Its symbolism emphasises friendship, devotion and flourishing in difficult places.',
  'Jyeshtha, the eldest, is linked with Indra. Its symbolism emphasises responsibility, protection and earned seniority.',
  'Mula, the root, is linked with Nirriti. Its symbolism emphasises going to the root of things, research and letting go.',
  'Purva Ashadha is linked with the waters. Its symbolism emphasises conviction, purification and early victories.',
  'Uttara Ashadha is linked with the universal gods. Its symbolism emphasises principled, lasting achievement.',
  'Shravana, the ear, is linked with Vishnu. Its symbolism emphasises listening, learning and connecting people.',
  'Dhanishta, the drum, is linked with the Vasus. Its symbolism emphasises rhythm, music, prosperity and teamwork.',
  'Shatabhisha, “a hundred healers”, is linked with Varuna. Its symbolism emphasises healing, solitude and seeing hidden patterns.',
  'Purva Bhadrapada is linked with Aja Ekapada. Its symbolism emphasises idealism, intensity and transformation through commitment.',
  'Uttara Bhadrapada is linked with Ahir Budhnya, the serpent of the deep. Its symbolism emphasises depth, calm and wisdom.',
  'Revati, the final star, is linked with Pushan the protector of travellers. Its symbolism emphasises guidance, kindness and safe journeys.',
];

export const HOUSE_THEMES: { title: string; theme: string }[] = [
  { title: 'Self', theme: 'self-presentation, body and personal initiative' },
  { title: 'Resources', theme: 'resources, values, speech and family of origin' },
  { title: 'Communication', theme: 'communication, siblings, courage and short journeys' },
  { title: 'Home', theme: 'home, roots, emotional foundations and inner peace' },
  { title: 'Creativity', theme: 'creativity, romance, children and learning' },
  { title: 'Daily work', theme: 'daily work, health routines, service and resolving obstacles' },
  { title: 'Partnership', theme: 'partnership, marriage and one-to-one relationships' },
  { title: 'Transformation', theme: 'shared resources, transformation and what is hidden' },
  { title: 'Meaning', theme: 'beliefs, higher learning, teachers and long journeys' },
  { title: 'Vocation', theme: 'vocation, public role and reputation' },
  { title: 'Community', theme: 'friends, networks, gains and aspirations' },
  { title: 'Retreat', theme: 'rest, retreat, spirituality and letting go' },
];

export const PLANET_THEMES: Record<string, { theme: string; verb: string }> = {
  sun: { theme: 'identity, vitality and purpose', verb: 'seeks to shine through' },
  moon: { theme: 'emotions, needs and care', verb: 'looks for comfort in' },
  mercury: { theme: 'thinking, speech and learning', verb: 'thinks and talks about' },
  venus: { theme: 'love, beauty and values', verb: 'finds pleasure and harmony in' },
  mars: { theme: 'drive, courage and conflict', verb: 'puts energy into' },
  jupiter: { theme: 'growth, wisdom and generosity', verb: 'grows and teaches through' },
  saturn: { theme: 'responsibility, limits and endurance', verb: 'learns patience and structure through' },
  uranus: { theme: 'change and originality', verb: 'seeks freedom and change in' },
  neptune: { theme: 'imagination and ideals', verb: 'dreams and idealises' },
  pluto: { theme: 'power and transformation', verb: 'transforms through' },
  rahu: { theme: 'appetite, novelty and ambition', verb: 'hungers for experience in' },
  ketu: { theme: 'detachment, insight and past mastery', verb: 'feels detached yet skilled in' },
};
