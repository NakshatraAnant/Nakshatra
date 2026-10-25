import type { ArchetypeKey } from '../astro/archetype';
import type { Element, Modality } from '../astro/constants';

/**
 * Cosmic ID archetypes, Nakshatra editorial pack v2.
 * One archetype per element × modality. Ten keep names from the original product
 * discussions; "Silver Thread" was added for earth × mutable, and "Moon Static"
 * now names fixed air. Each is a symbolic portrait of a chart's emphasis — a
 * language for reflection, not a personality test or a prediction.
 */
export interface Archetype {
  key: ArchetypeKey;
  name: string;
  element: Element;
  modality: Modality;
  /** One line that works on a share card. */
  essence: string;
  portrait: string;
  gifts: [string, string, string];
  growthEdge: string;
  inBonds: string;
  /** Art direction: ink is the ground, glow the light, accent the mark. */
  palette: { ink: string; glow: string; accent: string };
}

export const ELEMENT_MEANING: Record<Element, string> = {
  fire: 'Fire (Mesha, Simha, Dhanu) is the tradition’s language of spirit, will and warmth.',
  earth: 'Earth (Vrishabha, Kanya, Makara) is the language of the body, craft and what endures.',
  air: 'Air (Mithuna, Tula, Kumbha) is the language of thought, exchange and relationship.',
  water: 'Water (Karka, Vrischika, Meena) is the language of feeling, memory and intuition.',
};

export const MODALITY_MEANING: Record<Modality, string> = {
  cardinal: 'Cardinal (chara, movable) signs begin things.',
  fixed: 'Fixed (sthira) signs hold and deepen what has begun.',
  mutable: 'Mutable (dvisvabhava, dual) signs adapt, translate and carry things across.',
};

export const ARCHETYPES: Record<ArchetypeKey, Archetype> = {
  celestial_rush: {
    key: 'celestial_rush', name: 'Celestial Rush', element: 'fire', modality: 'cardinal',
    essence: 'You move first and light the way by moving.',
    portrait: 'Fire that begins. Charts with this emphasis gather around the spark of starting: the first step, the first word, the decision made before the room has finished deliberating. The tradition reads it as courage expressed through motion, and those who recognise themselves here often say momentum feels like oxygen and waiting feels like weather.',
    gifts: ['Turning intention into action', 'Courage in uncertain moments', 'Energy that lifts other people'],
    growthEdge: 'Letting something finish before the next thing begins.',
    inBonds: 'Brings initiative and honesty; asks for a partner who does not mistake speed for carelessness.',
    palette: { ink: '#1a0b07', glow: '#ff7a3d', accent: '#ffd27a' },
  },
  echo_flame: {
    key: 'echo_flame', name: 'Echo Flame', element: 'fire', modality: 'fixed',
    essence: 'A warmth that stays lit long after the room has emptied.',
    portrait: 'Fire that holds. This is the steady hearth rather than the spark: loyalty, conviction and a creative heat that keeps returning to the same few loves until they become a body of work. The tradition associates it with dignity and generosity, and people who identify with it often describe a need to make something that carries their name.',
    gifts: ['Loyalty that outlasts difficulty', 'Creative stamina', 'Generous presence'],
    growthEdge: 'Treating a change of mind as growth rather than defeat.',
    inBonds: 'Offers constancy and warmth; needs to feel seen for what it gives.',
    palette: { ink: '#170a05', glow: '#e8a33a', accent: '#fff1c9' },
  },
  neon_riot: {
    key: 'neon_riot', name: 'Neon Riot', element: 'fire', modality: 'mutable',
    essence: 'Many flames, all yours, burning in different directions.',
    portrait: 'Fire that travels. Here enthusiasm is restless and wide: a new idea, a new city, a new philosophy, each embraced completely for a while. The tradition links it with the seeker and the teacher, and people who recognise it often describe meaning found in the journey itself, and an allergy to any life that feels pre-written.',
    gifts: ['Contagious enthusiasm', 'Quick, honest perspective', 'Finding meaning in movement'],
    growthEdge: 'Choosing a few fires and tending them on purpose.',
    inBonds: 'Brings adventure and humour; thrives with room to roam and someone to return to.',
    palette: { ink: '#14061a', glow: '#ff4fa3', accent: '#ffcf4a' },
  },
  obsidian_mind: {
    key: 'obsidian_mind', name: 'Obsidian Mind', element: 'earth', modality: 'cardinal',
    essence: 'Pressure, patience, and a plan cut sharp as volcanic glass.',
    portrait: 'Earth that builds. This emphasis gathers around structure and ambition: setting a long goal and walking toward it one practical decision at a time. The tradition reads it through Shani’s patience and the mountain goat’s climb, and people who identify with it often describe quiet pride in responsibility and a dislike of promises without plans.',
    gifts: ['Strategic patience', 'Reliability under pressure', 'Building things that last'],
    growthEdge: 'Letting rest count as part of the work.',
    inBonds: 'Shows love through commitment and effort; appreciates a partner who values follow-through.',
    palette: { ink: '#08090b', glow: '#6f7a8a', accent: '#c9b27a' },
  },
  sol_bloom: {
    key: 'sol_bloom', name: 'Sol Bloom', element: 'earth', modality: 'fixed',
    essence: 'Slow sunlight, deep roots, a life grown rather than forced.',
    portrait: 'Earth that endures. This is the garden more than the field: comfort, beauty, appetite for the good things and the patience to let them ripen. The tradition places the Moon at its happiest here, and people who recognise this emphasis often describe calm as something they make with their hands — a meal, a room, a routine that holds.',
    gifts: ['Steadiness others lean on', 'A keen sense for quality and beauty', 'Patience that compounds'],
    growthEdge: 'Welcoming change before it has to be forced.',
    inBonds: 'Offers devotion and physical warmth; needs trust built at its own pace.',
    palette: { ink: '#0d1006', glow: '#c9a03c', accent: '#9fc27a' },
  },
  silver_thread: {
    key: 'silver_thread', name: 'Silver Thread', element: 'earth', modality: 'mutable',
    essence: 'The careful hand that mends what everyone else overlooked.',
    portrait: 'Earth that refines. This emphasis is about craft and service: noticing the small fault, the better method, the detail that makes a thing work. The tradition associates it with discernment, and those who recognise it often describe a quiet satisfaction in being genuinely useful, and a mind that keeps improving whatever it touches — including itself.',
    gifts: ['Precision and care', 'Practical problem-solving', 'Service without spectacle'],
    growthEdge: 'Accepting good enough as a finished state.',
    inBonds: 'Loves through attention and help; flourishes with appreciation spoken aloud.',
    palette: { ink: '#0b0d0e', glow: '#b9c4c9', accent: '#7fa38c' },
  },
  nova_drift: {
    key: 'nova_drift', name: 'Nova Drift', element: 'air', modality: 'cardinal',
    essence: 'A sudden new light that changes the shape of the conversation.',
    portrait: 'Air that initiates. This emphasis begins with other people: proposing the idea, making the introduction, restoring the balance in a room. The tradition reads it through Tula’s scales, and those who identify with it often describe a gift for seeing every side and a need for fairness that can make choosing a single side feel costly.',
    gifts: ['Diplomacy and grace', 'Starting meaningful conversations', 'An eye for harmony'],
    growthEdge: 'Stating a preference before weighing everyone else’s.',
    inBonds: 'Brings partnership as an art; needs a partner who meets them halfway.',
    palette: { ink: '#0a0b1a', glow: '#9fb6ff', accent: '#f2c6e0' },
  },
  moon_static: {
    key: 'moon_static', name: 'Moon Static', element: 'air', modality: 'fixed',
    essence: 'A steady signal tuned to a frequency only some can hear.',
    portrait: 'Air that holds a principle. This emphasis gathers around ideas worth keeping: a cause, a community, a vision of how things could be. The tradition reads it through Kumbha’s water-bearer, pouring knowledge for everyone, and people who recognise it often describe feeling slightly ahead of or apart from the crowd while deeply caring what happens to it.',
    gifts: ['Original thinking', 'Loyalty to ideals and friends', 'Seeing the system behind the moment'],
    growthEdge: 'Letting feelings be as valid as reasons.',
    inBonds: 'Offers friendship at the core of love; needs space to stay themselves.',
    palette: { ink: '#060a12', glow: '#67e0e8', accent: '#e6e9ff' },
  },
  lucid_haze: {
    key: 'lucid_haze', name: 'Lucid Haze', element: 'air', modality: 'mutable',
    essence: 'Thoughts in motion, clear as morning and twice as quick.',
    portrait: 'Air that translates. This emphasis is curiosity itself: questions, stories, many tabs open at once and the delight of connecting them. The tradition reads it through Budha, the messenger, and those who identify with it often describe understanding something by talking it through, and a mind that is happiest when it is learning.',
    gifts: ['Quick understanding', 'Bridging people and ideas', 'Wit and adaptability'],
    growthEdge: 'Staying with one question long enough for it to deepen.',
    inBonds: 'Brings conversation and play; needs a partner who is also a good interlocutor.',
    palette: { ink: '#0b0a14', glow: '#c9b8ff', accent: '#ffe39a' },
  },
  crimson_tide: {
    key: 'crimson_tide', name: 'Crimson Tide', element: 'water', modality: 'cardinal',
    essence: 'A tide that rises to protect whatever it calls home.',
    portrait: 'Water that begins. This emphasis moves from feeling into care: building a home, defending the people inside it, remembering what others forget. The tradition places the Moon in its own sign here, and those who recognise it often describe emotions as a compass for action and a fierce, private loyalty that only shows its strength when tested.',
    gifts: ['Protective care', 'Emotional memory and intuition', 'Creating belonging'],
    growthEdge: 'Caring for themselves with the same instinct they offer others.',
    inBonds: 'Offers safety and devotion; needs reassurance that the home is shared.',
    palette: { ink: '#0d0510', glow: '#c2304a', accent: '#f0d7c0' },
  },
  velvet_void: {
    key: 'velvet_void', name: 'Velvet Void', element: 'water', modality: 'fixed',
    essence: 'Depth that does not explain itself, and does not need to.',
    portrait: 'Water that holds. This emphasis gathers around intensity and privacy: the feeling held for years, the bond that is total or nothing, the transformation that happens quietly underground. The tradition reads Vrischika as a sign of hidden depths, and people who identify with it often describe trust as a long test and loyalty, once given, as almost unbreakable.',
    gifts: ['Emotional depth and courage', 'Insight into what is unspoken', 'Capacity for transformation'],
    growthEdge: 'Letting others in before the test is over.',
    inBonds: 'Offers profound commitment; needs honesty above comfort.',
    palette: { ink: '#05040b', glow: '#5b3fa8', accent: '#d8c3ff' },
  },
  aether_veil: {
    key: 'aether_veil', name: 'Aether Veil', element: 'water', modality: 'mutable',
    essence: 'A thin curtain between this world and the next idea.',
    portrait: 'Water that dissolves boundaries. This emphasis is imagination and empathy: absorbing the mood of a room, dreaming in images, feeling the story under the story. The tradition places Shukra exalted in Meena, and those who recognise it often describe compassion that arrives before judgement, and a need for solitude to find their own outline again.',
    gifts: ['Empathy and imagination', 'Spiritual and artistic sensitivity', 'Gentleness that heals'],
    growthEdge: 'Keeping a boundary as a form of kindness.',
    inBonds: 'Brings tenderness and romance; needs a partner who protects their quiet.',
    palette: { ink: '#050a12', glow: '#5fb8c9', accent: '#efe4ff' },
  },
};

export const ARCHETYPE_DISCLAIMER = 'Archetypes are a symbolic summary of which elements and modalities are emphasised in your chart, using documented weights. They are a language for reflection — not a scientific personality measure and not a prediction.';
