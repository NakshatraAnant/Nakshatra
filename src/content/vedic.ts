/**
 * Vedic sign content, Nakshatra editorial pack v2.
 * Written separately from the Western pack so that Rashi, Lagna and Surya read
 * through Jyotish ideas — manas (mind), deha (body and temperament), atma (self),
 * sign lords and dignities — instead of repeating tropical text. Reflective
 * descriptions of traditional symbolism, never predictions. Index = sidereal sign.
 */

/** Moon sign (Rashi): how the mind settles and what steadies it. */
export const RASHI_TEXT: string[] = [
  'With the Moon in Mesha, the mind is traditionally quick to kindle and quick to clear. Mangala, the sign’s lord, lends the manas urgency: feelings ask to be acted on, not filed away. Many with this Rashi find calm returns through movement or a frank conversation rather than through waiting it out.',
  'Vrishabha is the Moon’s sign of exaltation, where the mind is said to rest most easily. Under Shukra, the manas steadies through the senses — food, music, touch, a familiar routine. People with this Rashi often describe contentment as something built slowly and protected carefully.',
  'With the Moon in Mithuna, Budha’s sign, the mind is traditionally curious and conversational. Feelings are understood by naming them: a message, a journal, a long call. Many with this Rashi notice their mood follows their mental diet, lifting with new ideas and fraying with monotony.',
  'Karka is the Moon’s own sign, so tradition reads this Rashi as feeling at home in itself. The manas is tender, retentive and protective — it remembers kindness and slights alike. Many with this Rashi find steadiness through belonging: a place, a family, chosen or given, to care for.',
  'With the Moon in Simha, the Sun’s sign, the mind is traditionally warm, proud and generous. The manas wants to be met with recognition and responds with loyalty. People with this Rashi often describe feeling most like themselves when they can create, lead or simply be seen without having to ask.',
  'With the Moon in Kanya, Budha’s second sign, the mind is traditionally discerning and analytical. The manas settles by sorting: a list, a plan, a problem solved. Many with this Rashi recognise a quiet restlessness when things are disordered, and a deep satisfaction in being useful.',
  'With the Moon in Tula, Shukra’s airy sign, the mind is traditionally relational and fair-minded. The manas weighs, compares and seeks balance, and can feel unsettled by conflict it cannot resolve. People with this Rashi often find peace through beauty, good company and agreements that feel just.',
  'Vrischika is the Moon’s sign of debilitation in classical texts — not a flaw, but a place where feeling runs deep and private. Under Mangala, the manas is intense, perceptive and slow to trust. Many with this Rashi describe emotions that are total, and a capacity to rebuild themselves after change.',
  'With the Moon in Dhanu, Guru’s fiery sign, the mind is traditionally optimistic and searching. The manas steadies through meaning — a philosophy, a teacher, a journey. People with this Rashi often say that a sense of purpose matters more to their mood than comfort does.',
  'With the Moon in Makara, Shani’s earthy sign, the mind is traditionally reserved and responsible. The manas finds safety in structure and in effort that shows results over time. Many with this Rashi describe feelings that are real but practical, expressed through reliability more than words.',
  'With the Moon in Kumbha, Shani’s airy sign, the mind is traditionally independent and principled. The manas cares about the group and the idea, sometimes more comfortably than about its own moods. People with this Rashi often need room to think before they can feel clearly.',
  'With the Moon in Meena, Guru’s watery sign, the mind is traditionally imaginative, porous and compassionate. The manas absorbs atmospheres easily and needs solitude to recover its own outline. Many with this Rashi describe intuition that arrives before reasons, and kindness that comes naturally.',
];

/** Ascendant (Lagna): temperament, body and how life is approached; the lord becomes the chart ruler. */
export const LAGNA_TEXT: string[] = [
  'A Mesha Lagna makes Mangala the chart’s ruler. Tradition describes a direct, energetic temperament that meets life head-on and prefers to begin rather than wait. The body is often read as active and restless when idle; where Mangala sits in the chart shows where that drive is spent.',
  'A Vrishabha Lagna makes Shukra the chart’s ruler. Tradition describes a steady, patient temperament with a strong sense of comfort and value. Life is approached by building slowly and keeping what works; the placement of Shukra shows where pleasure and stability are sought.',
  'A Mithuna Lagna makes Budha the chart’s ruler. Tradition describes a curious, adaptable temperament that approaches life through conversation and learning. Many with this Lagna stay youthful in manner; Budha’s placement shows which subjects keep the mind most engaged.',
  'A Karka Lagna makes Chandra the chart’s ruler, so moods colour the whole chart more than usual. Tradition describes a caring, receptive temperament that approaches life by protecting what it loves. The Moon’s sign and nakshatra become especially important for reading this chart.',
  'A Simha Lagna makes Surya the chart’s ruler. Tradition describes a dignified, warm temperament that approaches life as something to lead and create. People with this Lagna often carry visible presence; the Sun’s house shows where they most want to shine.',
  'A Kanya Lagna makes Budha the chart’s ruler. Tradition describes a careful, observant temperament that approaches life by improving it. Health, routine and craft are recurring themes; Budha’s placement shows where precision is most rewarding.',
  'A Tula Lagna makes Shukra the chart’s ruler. Tradition describes a gracious, diplomatic temperament that approaches life through relationships and balance. Shani is exalted in this sign and is traditionally a friendly planet for this Lagna, linked with patience and fairness.',
  'A Vrischika Lagna makes Mangala the chart’s ruler. Tradition describes an intense, private, determined temperament that approaches life by going beneath the surface. People with this Lagna often keep their strength in reserve; Mangala’s house shows where that intensity is directed.',
  'A Dhanu Lagna makes Guru the chart’s ruler. Tradition describes an open, principled, adventurous temperament that approaches life as a search for meaning. Teaching, travel and belief recur as themes; Guru’s placement shows where wisdom is gathered and shared.',
  'A Makara Lagna makes Shani the chart’s ruler. Tradition describes a disciplined, practical temperament that approaches life as a long climb. Many with this Lagna are said to grow more at ease with age; Shani’s placement shows where effort is most tested and rewarded.',
  'A Kumbha Lagna makes Shani the chart’s ruler in its airy sign. Tradition describes an independent, humane temperament that approaches life through ideas and communities. People with this Lagna often value principle over convention; Shani’s house shows where responsibility to others is felt.',
  'A Meena Lagna makes Guru the chart’s ruler in its watery sign. Tradition describes a gentle, imaginative, intuitive temperament that approaches life with compassion. Shukra is exalted here; Guru’s placement shows where faith, learning and care find their outlet.',
];

/** Sidereal Sun (Surya): the atma, vitality and sense of purpose, with classical dignities. */
export const SURYA_TEXT: string[] = [
  'Surya is exalted in Mesha, the classical sign of its greatest strength. Tradition associates this placement with confidence, initiative and a clear sense of self. The atma expresses itself through courage and leadership, and through learning to direct that fire without scorching others.',
  'Surya in Vrishabha, Shukra’s sign, is traditionally read as a steady, resourceful sense of self. The atma finds purpose in building and keeping something of value — skills, savings, beauty, family. Strength here grows slowly and lasts.',
  'Surya in Mithuna, Budha’s sign, links the sense of self with intellect and communication. The atma is expressed through learning, writing, trade and exchange. Tradition reads this as a self that is many-sided and stays curious throughout life.',
  'Surya in Karka, the Moon’s sign, is traditionally read as a self defined through care and belonging. The atma finds purpose in nurturing, protecting and remembering. Confidence grows when home feels secure.',
  'Surya in Simha is in its own sign and moolatrikona, where classical texts consider it dignified and comfortable. Tradition associates it with natural authority, generosity and creative pride. The atma is expressed by leading, performing or simply standing in its own light.',
  'Surya in Kanya, Budha’s earthy sign, is traditionally read as a self expressed through skill, analysis and service. The atma finds purpose in doing things well and in being useful. Recognition often comes through competence rather than display.',
  'Surya is debilitated in Tula in classical texts — the self is pulled toward others and toward balance, so asserting it can feel harder. Tradition sees the gift in fairness, diplomacy and partnership; strength grows by learning to hold one’s own position gracefully.',
  'Surya in Vrischika, Mangala’s watery sign, is traditionally read as a self that is intense, private and resilient. The atma seeks depth and transformation and may keep its ambitions quiet. Strength is shown in endurance more than display.',
  'Surya in Dhanu, Guru’s sign, links the self with principle, faith and the wider view. The atma is expressed through teaching, travel and conviction. Tradition reads this as a sense of purpose tied to meaning rather than status.',
  'Surya in Makara, Shani’s sign, is traditionally read as a self shaped by responsibility and long effort. The atma finds purpose in achievement that lasts and in duty well done. Recognition may come later, and it tends to be durable.',
  'Surya in Kumbha, Shani’s airy sign, links the sense of self with ideals and community. The atma is expressed through reform, invention or service to a group. Tradition reads it as a self that shines by contributing rather than standing apart.',
  'Surya in Meena, Guru’s watery sign, is traditionally read as a gentle, intuitive and spiritual sense of self. The atma finds purpose in compassion, art or devotion. Strength grows through inner conviction more than outward assertion.',
];
