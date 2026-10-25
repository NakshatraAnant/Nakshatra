import type { Dimension } from '../shared/personality';

/**
 * Expanded identity report content (identity-report-v1). Written per dimension and
 * pole so the paid report adds depth the free result never shows: strengths,
 * blind spots, how it plays out with friends, and one small experiment.
 * Tendencies, not verdicts.
 */
export const IDENTITY_REPORT_VERSION = 'identity-report-v1';

interface Pole { strengths: string; blindSpot: string; withFriends: string; tryThis: string }

export const DIMENSION_DEPTH: Record<Dimension, { low: Pole; high: Pole }> = {
  energy: {
    low: {
      strengths: 'You give people your full attention, and small settings let your humour and depth come through. Friends often describe time with you as restorative.',
      blindSpot: 'Quiet recovery can look like distance from the outside. People may assume you are upset when you are simply recharging.',
      withFriends: 'You are the friend for the long walk or the late call rather than the packed party — and the friend people trust with the real story.',
      tryThis: 'Next time you need space, send a ten-word note saying so. It keeps the door open without spending energy.',
    },
    high: {
      strengths: 'You bring momentum: plans happen, rooms warm up, and new people feel included faster when you are around.',
      blindSpot: 'Your energy can fill the space before quieter friends have spoken. Silence is not always an invitation to fill it.',
      withFriends: 'You are often the connector — the reason two groups of friends now know each other.',
      tryThis: 'In your next group conversation, ask one quieter person a direct, easy question and let them finish.',
    },
  },
  compass: {
    low: {
      strengths: 'You stay steady when things get emotional and can see the practical way through. People bring you problems they want solved.',
      blindSpot: 'A correct answer delivered too quickly can feel like dismissal to someone who wanted to be heard first.',
      withFriends: 'You are the friend who helps compare the two job offers — clearly, honestly and without drama.',
      tryThis: 'Before offering a solution, ask “do you want ideas, or do you want to vent?” and follow the answer.',
    },
    high: {
      strengths: 'You notice how people are really doing and make decisions that keep relationships intact. Empathy is your instinct.',
      blindSpot: 'You may carry other people’s feelings into decisions that should be about what you want.',
      withFriends: 'You are the friend who remembers the hard week and checks in when it is over.',
      tryThis: 'For one decision this week, write down what you want before thinking about how others will feel.',
    },
  },
  voice: {
    low: {
      strengths: 'You think before you speak, so your words carry weight. People trust that what you share is considered.',
      blindSpot: 'Friends may not know what you need until it has been building for a while.',
      withFriends: 'You open up deeply with a few people, and they treasure being in that circle.',
      tryThis: 'Share one small, low-stakes opinion early in a conversation — a film, a food, a plan — and notice how it lands.',
    },
    high: {
      strengths: 'You make honesty feel easy and give others permission to say what they really think.',
      blindSpot: 'Not every thought needs to be shared the moment it arrives; timing can matter as much as truth.',
      withFriends: 'You are the friend who names the elephant in the room — kindly, and usually first.',
      tryThis: 'When something big comes up, sleep on it once before sharing, and see whether your words change.',
    },
  },
  tempo: {
    low: {
      strengths: 'You make things reliable: tickets get booked, deadlines get met, and friends can count on the plan existing.',
      blindSpot: 'Last-minute changes can feel bigger to you than they are, and others may read structure as rigidity.',
      withFriends: 'You are the group-trip planner whose spreadsheet everyone teases and secretly depends on.',
      tryThis: 'Leave one evening this week deliberately unplanned and decide what to do only on the day.',
    },
    high: {
      strengths: 'You adapt fast and find good options when plans fall apart. Spontaneity is where your best stories come from.',
      blindSpot: 'Keeping options open can leave others unsure whether you are really coming.',
      withFriends: 'You are the friend who turns a cancelled plan into the best night of the month.',
      tryThis: 'Commit to one plan a week in writing — time, place, yes — and keep it.',
    },
  },
  horizon: {
    low: {
      strengths: 'You build depth: favourite places, long friendships and traditions that give a group its identity.',
      blindSpot: 'Comfort can quietly turn into avoiding things that might genuinely delight you.',
      withFriends: 'You are the keeper of the group’s rituals — the annual trip, the usual table, the inside jokes.',
      tryThis: 'Try one new thing that sits right next to a favourite: a new dish at your usual place, a new song by a band you love.',
    },
    high: {
      strengths: 'You bring fresh ideas, places and people into your circles and make life feel bigger for those around you.',
      blindSpot: 'Chasing the next new thing can leave good things half-explored.',
      withFriends: 'You are the friend with a new café, hobby or idea every week — and the reason the group tries things.',
      tryThis: 'Pick one recent discovery and go deeper on it for a month before adding another.',
    },
  },
};
