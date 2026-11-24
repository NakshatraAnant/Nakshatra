/**
 * Curated, versioned prompt banks for games and rituals. Each prompt has a
 * stable id so usage history can prevent repeats. Content rules: light,
 * non-sensitive, nobody's secrets, no health, politics, religion, sexuality,
 * money or illegal activity; nothing that ranks people as better or worse.
 * Add prompts by appending — never reuse or renumber an id.
 */
export interface Prompt { id: string; text: string }
export interface PairPrompt { id: string; a: string; b: string; category: string }
export interface OptionPrompt { id: string; text: string; options: string[] }

const p = (prefix: string, items: string[]): Prompt[] => items.map((text, i) => ({ id: `${prefix}${i + 1}`, text }));
const pairs = (prefix: string, category: string, items: [string, string][]): PairPrompt[] => items.map(([a, b], i) => ({ id: `${prefix}${i + 1}`, a, b, category }));

export const STATEMENT_PROMPTS = p('st', [
  'Something you believed as a kid that was completely wrong.',
  'A harmless habit you have that nobody would guess.',
  'The most random skill you have.',
  'A food combination you secretly love.',
  'The pettiest thing that still annoys you a little.',
  'A song you know every word to but would never admit in public.',
  'The weirdest place you have ever fallen asleep.',
  'A trend you joined way too late.',
  'Your most-used emoji and why.',
  'The fictional character you relate to most.',
  'A small thing that instantly makes your day better.',
  'The most dramatic thing you have done over something tiny.',
]);

export const CHAOS_PAIRS: PairPrompt[] = [
  ...pairs('che', 'everyday', [
    ['Always 10 minutes early', 'Always 10 minutes late'], ['Reply instantly to everything', 'Reply to everything once a day'],
    ['Only voice notes', 'Only texts with no emojis'], ['Wake up at 5 am forever', 'Never sleep before 2 am again'],
    ['Lose your phone for a week', 'Lose your playlist forever'], ['Eat only street food', 'Eat only home food'],
    ['Know every song’s lyrics', 'Know every film’s ending'], ['Unlimited free chai', 'Unlimited free cab rides'],
    ['Speak every language badly', 'Speak one more language perfectly'], ['Live without music', 'Live without movies'],
  ]),
  ...pairs('chs', 'social', [
    ['Plan every group trip', 'Never plan anything again'], ['Be the funniest in the room', 'Be the most trusted'],
    ['Group chat with 50 people', 'No group chats at all'], ['Accidentally like an old photo of your crush', 'Accidentally send a voice note to your boss'],
    ['Host every party', 'Never be invited to one'], ['Read minds for a day', 'Be invisible for a day'],
    ['Have a theme song that plays when you enter', 'Have a laugh track for your jokes'], ['Always know what to say', 'Always know when to stay quiet'],
    ['Relive your best day once', 'Skip your worst day completely'], ['Be famous for a week', 'Have one true friend for life'],
  ]),
  ...pairs('chf', 'fantasy', [
    ['Talk to animals', 'Talk to plants'], ['Teleport but only to places you have been', 'Fly but only at walking speed'],
    ['Live in a treehouse', 'Live on a houseboat'], ['Time travel to the past', 'Time travel to the future'],
    ['Have a pet dragon the size of a cat', 'Have a cat the size of a dragon'], ['Pause time', 'Rewind ten seconds'],
    ['Find a hidden room in your house', 'Find a map in an old book'], ['Every door is a portal', 'Every mirror is a window'],
    ['Never feel cold again', 'Never feel sleepy unless you want to'], ['Win every board game', 'Win every argument'],
  ]),
];

export const HONEST_VOTE_PROMPTS = p('hv', [
  'Most likely to start a business from a joke.', 'Most likely to adopt five pets.', 'Most likely to become accidentally famous.',
  'Most likely to know the gossip first.', 'Most likely to survive a zombie movie.', 'Most likely to cry at an advert.',
  'Most likely to plan the reunion.', 'Most likely to get lost with GPS on.', 'Most likely to win a reality show.',
  'Most likely to text “on my way” from bed.', 'Most likely to befriend a stranger on a train.', 'Most likely to have a secret talent.',
  'Most likely to remember your birthday.', 'Most likely to give the best advice.', 'Most likely to start a dance floor.',
  'Most likely to write a book.', 'Most likely to order for the whole table.', 'Most likely to fix any gadget.',
  'Most likely to know the best street food spot.', 'Most likely to make a playlist for the moment.',
]);

export const CONFESSION_PROMPTS = p('cf', [
  'A food you pretend to like.', 'The app you open too often.', 'Something you still do from childhood.',
  'A show you rewatched far too many times.', 'The excuse you use most to leave early.', 'Your most irrational fear (keep it light).',
  'A word you always mispronounce.', 'Something you bought and never used.', 'Your guilty-pleasure genre.',
  'A small lie you tell yourself every morning.', 'The thing you do when nobody is watching that is completely harmless.',
  'A trend you secretly miss.',
]);

export const DECODER_QUESTIONS: OptionPrompt[] = [
  { id: 'dq1', text: 'Perfect Sunday?', options: ['Sleep till noon', 'Early adventure', 'Friends and food', 'Solo project'] },
  { id: 'dq2', text: 'Go-to comfort food?', options: ['Maggi', 'Biryani', 'Something sweet', 'Home-cooked dal chawal'] },
  { id: 'dq3', text: 'Dream holiday?', options: ['Mountains', 'Beach', 'Big city', 'Somewhere no one has heard of'] },
  { id: 'dq4', text: 'Texting style?', options: ['Paragraphs', 'One word', 'Voice notes', 'Memes only'] },
  { id: 'dq5', text: 'At a party you are…', options: ['Near the snacks', 'On the dance floor', 'Deep in one conversation', 'Leaving early'] },
  { id: 'dq6', text: 'Favourite way to celebrate?', options: ['Big party', 'Small dinner', 'A trip', 'Quiet night in'] },
  { id: 'dq7', text: 'Pick a superpower', options: ['Flying', 'Mind reading', 'Time pause', 'Invisibility'] },
  { id: 'dq8', text: 'Morning drink?', options: ['Chai', 'Coffee', 'Juice', 'Just water'] },
  { id: 'dq9', text: 'Movie genre to unwind?', options: ['Comedy', 'Thriller', 'Romance', 'Documentary'] },
  { id: 'dq10', text: 'If you won a free hour every day?', options: ['Sleep', 'Exercise', 'Learn something', 'Scroll guilt-free'] },
  { id: 'dq11', text: 'Ideal pet?', options: ['Dog', 'Cat', 'Fish', 'No pets, thanks'] },
  { id: 'dq12', text: 'Packing style?', options: ['Week ahead', 'Night before', 'Hour before', 'In the taxi'] },
  { id: 'dq13', text: 'Best season?', options: ['Monsoon', 'Winter', 'Spring', 'Summer'] },
  { id: 'dq14', text: 'Karaoke?', options: ['First on stage', 'After some encouragement', 'Backup vocals only', 'Never'] },
];

export const THIS_OR_THAT: PairPrompt[] = [
  ...pairs('ttf', 'food', [['Pani puri', 'Momos'], ['Sweet', 'Spicy'], ['Pizza', 'Biryani'], ['Breakfast for dinner', 'Dinner for breakfast'], ['Ice cream', 'Kulfi'], ['Home cooking', 'Ordering in']]),
  ...pairs('ttl', 'life', [['Beach', 'Mountains'], ['Sunrise', 'Sunset'], ['City lights', 'Starry village sky'], ['Road trip', 'Flight'], ['Rain', 'Sunshine'], ['Big house', 'Small house, big garden']]),
  ...pairs('ttc', 'culture', [['Books', 'Podcasts'], ['Series binge', 'One great film'], ['Concert', 'Stand-up show'], ['Old songs', 'New releases'], ['Board games', 'Video games'], ['Museum', 'Theme park']]),
  ...pairs('tts', 'style', [['Sneakers', 'Sandals'], ['Black outfit', 'Colourful outfit'], ['Hoodie', 'Jacket'], ['Messy room, organised mind', 'Tidy room, chaotic mind'], ['Handwritten notes', 'Notes app'], ['Dark mode', 'Light mode']]),
];

export const PLOT_OPENERS = p('po', [
  'The power went out at exactly 9:41 pm, and then the doorbell rang.',
  'Nobody remembered ordering the extra-large cake, but it had our names on it.',
  'The group chat suddenly showed a message from a number none of us had saved.',
  'Halfway up the hill, the auto-rickshaw driver said, “This is where it happened.”',
  'The library book was due back in 1987.',
  'Every streetlight on the road blinked twice as we walked past.',
  'The new neighbour introduced themselves as “your future roommate”.',
  'The map we found had one spot circled: the college canteen.',
  'At the wedding, the DJ played a song none of us had heard but all of us knew.',
  'The parrot at the market said my full name.',
  'When we opened the time capsule, there was one item nobody had put in.',
  'The train stopped at a station that was not on any map.',
]);

export const HOT_TAKE_TOPICS = p('ht', [
  'Breakfast foods', 'Movie sequels', 'Weekend plans', 'Monsoon', 'Group trips', 'Texting etiquette', 'Desserts', 'Board games',
  'Morning routines', 'Music festivals', 'Street food', 'Superhero films', 'Pets', 'Airport habits', 'Birthday celebrations',
  'Office snacks', 'Cricket commentary', 'Reality TV', 'Holiday packing', 'Coffee orders',
]);

export const PREDICTION_QUESTIONS: OptionPrompt[] = [
  { id: 'pq1', text: 'Who in this game will reply to the next group message first?', options: ['__participants__'] },
  { id: 'pq2', text: 'Will our next meet-up start on time?', options: ['On time', 'Up to 15 minutes late', 'Over 15 minutes late', 'It gets rescheduled'] },
  { id: 'pq3', text: 'What will we order next time we eat together?', options: ['Pizza', 'Biryani', 'Chinese', 'Something new'] },
  { id: 'pq4', text: 'How many of us will finish this week’s circle question?', options: ['Everyone', 'Most of us', 'About half', 'Just a brave few'] },
  { id: 'pq5', text: 'Next weekend, the group will mostly…', options: ['Go out', 'Stay in', 'Be travelling', 'Be asleep'] },
  { id: 'pq6', text: 'Who will suggest the next plan?', options: ['__participants__'] },
  { id: 'pq7', text: 'How long will the next group call last?', options: ['Under 10 minutes', '10–30 minutes', '30–60 minutes', 'Over an hour'] },
  { id: 'pq8', text: 'Will it rain on our next outing?', options: ['Yes', 'No', 'Only a drizzle', 'We will stay indoors anyway'] },
];

export const COMPATIBILITY_QUESTIONS: OptionPrompt[] = [
  { id: 'lab1', text: 'Ideal weekend pace?', options: ['Packed', 'Balanced', 'Do nothing'] },
  { id: 'lab2', text: 'Planning a trip?', options: ['Spreadsheet', 'Rough idea', 'Book on the way'] },
  { id: 'lab3', text: 'Conflict style?', options: ['Talk now', 'Cool off first', 'Write it down'] },
  { id: 'lab4', text: 'Social plans per week?', options: ['Most days', 'A couple', 'One, maybe'] },
  { id: 'lab5', text: 'Gift preference?', options: ['Experience', 'Something handmade', 'Practical'] },
  { id: 'lab6', text: 'Night plan?', options: ['Out late', 'Dinner and home', 'Movie at home'] },
  { id: 'lab7', text: 'Messaging rhythm?', options: ['All day', 'Check-ins', 'Call when needed'] },
  { id: 'lab8', text: 'Trying new food?', options: ['Always', 'Sometimes', 'Rarely'] },
  { id: 'lab9', text: 'Morning or night?', options: ['Morning', 'Somewhere between', 'Night'] },
  { id: 'lab10', text: 'Celebrating wins?', options: ['Loudly', 'With a few people', 'Quietly'] },
];

/* ---------------- Ritual banks ---------------- */

export const DAILY_THOUGHT_PROMPTS = p('dt', [
  'What is something small you are looking forward to?', 'What did you change your mind about recently?', 'What is a compliment you still remember?',
  'What is the best advice you ignored?', 'What tiny thing would make tomorrow better?', 'What is an opinion you hold gently?',
  'What are you pretending not to care about?', 'What is a skill you wish you had learned earlier?', 'What made you laugh this week?',
  'What do people misunderstand about you?', 'What is a place that feels like you?', 'What are you proud of that nobody noticed?',
  'What would you tell yourself one year ago?', 'What is a song that matches your mood today?', 'What is a rule you made for yourself?',
  'What is something you are learning slowly?', 'What does a perfect ordinary day look like?', 'What is overrated, in your opinion?',
  'What is underrated, in your opinion?', 'What question do you wish people asked you?', 'Where do you feel most like yourself?',
  'What is a habit you are building?', 'What do you collect, literally or not?', 'What is a memory that smells like something?',
  'What would your ideal weekend include?', 'What is a small act of kindness you saw lately?', 'What are you curious about right now?',
  'What is your comfort show and why?', 'What is something you are better at than you admit?', 'What do you want more of this month?',
]);

export const CIRCLE_QUESTIONS = p('cq', [
  'What should our next group plan be?', 'What song should be this circle’s anthem?', 'Best memory of this group so far?',
  'What is one thing we should try together this month?', 'Which snack represents this circle?', 'If this circle were a film, what genre?',
  'Who in here would survive longest on a desert island, and why?', 'What is a tradition we should start?', 'Pick a theme for our next hangout.',
  'What is the most “us” thing we have ever done?', 'What is something you appreciate about this group?', 'Describe this week in three emojis.',
  'What should we name our imaginary band?', 'What is our group’s unofficial motto?', 'Best place we have eaten together?',
  'What is a challenge we could do as a group?', 'Which fictional group are we most like?', 'What is your favourite inside joke here?',
  'Where should our dream group trip be?', 'What is one thing you want to tell this group but never have (keep it kind)?',
  'What game should we play next?', 'What is a skill someone here should teach the rest of us?', 'What would our group cookbook be called?',
  'Pick our circle’s mascot animal.', 'What is the best gift someone here has given you?', 'What is one rule for our next trip?',
  'Who here gives the best advice for…?', 'Which old photo of us deserves a frame?', 'What should we celebrate this month?', 'Rate this week from 1 to 10 and why.',
]);

export const WEEKLY_REFLECTIONS = p('wr', [
  'What gave you energy this week, and what drained it?', 'What conversation stayed with you this week?', 'What did you do this week that past-you would be proud of?',
  'What is one thing you want to do differently next week?', 'Who made your week better, and do they know?', 'What surprised you this week?',
  'What did you learn about yourself this week?', 'What is something you are letting go of?', 'Where did you feel most at ease this week?',
  'What is one small win from this week?', 'What would make next week feel lighter?', 'What are you grateful for that is easy to overlook?',
]);

export const MICRO_CHALLENGES = p('mc', [
  'Send someone a song that reminds you of them.', 'Compliment a friend on something specific.', 'Try a snack you have never had.',
  'Take a photo of something ordinary that looks beautiful.', 'Write down three things you are looking forward to.', 'Ask a friend a question you have never asked.',
  'Spend ten minutes without your phone and notice what you notice.', 'Learn one word in a language you do not speak.', 'Tidy one tiny corner.',
  'Share an old favourite song with your circle.', 'Take a different route somewhere.', 'Write a two-line poem about today.',
  'Thank someone who helped you recently.', 'Make a playlist for your current mood.', 'Recommend a film to someone.',
  'Try a five-minute stretch.', 'Draw your day as a doodle.', 'Message an old friend just to say hi.', 'Cook or assemble something simple.', 'Look at the sky for a full minute.',
]);
