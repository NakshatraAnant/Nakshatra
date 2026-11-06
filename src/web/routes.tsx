import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, Outlet, useRouteError, Link, Navigate } from 'react-router';
import { AppShell, PublicShell } from './components/layout/AppShell';
import { ToastProvider } from './components/ui/overlays';
import { CelebrationProvider } from './components/motion';
import { LoadingBlock } from './components/ui/feedback';
import { I18nProvider } from './lib/i18n';
import { RequireAuth, useMe, usePreferenceEffects } from './lib/session';
import { Button } from './components/ui/primitives';

/** Route-chunk fallback: the brand loading emblem (its motion is CSS, stilled under reduced motion) over skeleton lines. */
function RouteLoading() {
  return (
    <div className="py-10" aria-busy="true">
      <img src="/visual/brand/nakshatra-loading-emblem.svg" alt="" aria-hidden="true" width={56} height={56} className="loading-emblem mx-auto mb-6 h-14 w-14" />
      <LoadingBlock lines={4} />
    </div>
  );
}

/** Lazily loads one named export so every route is its own chunk. */
function page<M>(loader: () => Promise<M>, name: keyof M) {
  const C = lazy(() => loader().then((m) => ({ default: m[name] as unknown as ComponentType })));
  return <Suspense fallback={<RouteLoading />}><C /></Suspense>;
}

const auth = () => import('./pages/auth');
const today = () => import('./pages/today');
const identity = () => import('./pages/identity');
const chart = () => import('./pages/chart');
const calendar = () => import('./pages/calendar');
const journey = () => import('./pages/journey');
const bonds = () => import('./pages/bonds');
const social = () => import('./pages/social');
const messages = () => import('./pages/messages');
const dating = () => import('./pages/dating');
const matchmaking = () => import('./pages/matchmaking');
const experts = () => import('./pages/experts');
const learn = () => import('./pages/learn');
const shop = () => import('./pages/shop');
const weddings = () => import('./pages/weddings');
const settings = () => import('./pages/settings');
const admin = () => import('./pages/admin');
const misc = () => import('./pages/misc');
const landing = () => import('./pages/landing');
const discover = () => import('./pages/discover');
const studio = () => import('./pages/studio');
const thoughts = () => import('./pages/thoughts');
const explore = () => import('./pages/explore');
const merch = () => import('./pages/merch');
const membership = () => import('./pages/membership');
const quizzes = () => import('./pages/quizzes');
const tournaments = () => import('./pages/tournaments');
const creators = () => import('./pages/creators');
const collections = () => import('./pages/collections');
const perks = () => import('./pages/perks');
const orgs = () => import('./pages/orgs');
const circles = () => import('./pages/circles');
const play = () => import('./pages/play');
const home = () => import('./pages/home');
const share = () => import('./pages/share');
const gifts = () => import('./pages/gifts');
const progress = () => import('./pages/progress');

function Root() {
  const me = useMe();
  usePreferenceEffects(me.data?.user);
  return (
    <I18nProvider locale={me.data?.user?.profile?.language ?? 'en'}>
      <ToastProvider>
        <CelebrationProvider>
          <Outlet />
        </CelebrationProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

function RouteError({ notFound = false }: { notFound?: boolean }) {
  const err = useRouteError() as Error | { status?: number; statusText?: string } | undefined;
  const status = notFound ? 404 : err && typeof err === 'object' && 'status' in err ? err.status : undefined;
  return (
    <PublicShell>
      <div className="mx-auto max-w-lg py-24 text-center">
        <p className="eyebrow">{status === 404 ? 'Not found' : 'Unexpected error'}</p>
        <h1 className="mt-3 font-display text-5xl">{status === 404 ? 'This path leads nowhere' : 'Something slipped out of orbit'}</h1>
        <p className="mt-4 text-fg-2">{status === 404 ? 'The page you were looking for does not exist.' : 'Please reload the page. If it keeps happening, contact support.'}</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/"><Button>Go home</Button></Link>
          <Button variant="secondary" onClick={() => location.reload()}>Reload</Button>
        </div>
      </div>
    </PublicShell>
  );
}

function Home() {
  const me = useMe();
  if (me.isLoading) return null;
  if (me.data?.user) return <Navigate to={me.data.user.onboardingComplete ? '/home' : '/onboarding'} replace />;
  return page(landing, 'Landing');
}

const authed = (el: ReactNode, opts: { onboarding?: boolean; staff?: boolean } = {}) => <RequireAuth {...opts}>{el}</RequireAuth>;
const pub = (el: ReactNode) => <PublicShell>{el}</PublicShell>;

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/discover', element: pub(page(discover, 'Discover')) },
      { path: '/personality', element: pub(page(studio, 'PersonalityPreview')) },
      { path: '/i/:handle', element: pub(page(studio, 'PublicIdentity')) },
      { path: '/s/:slug', element: pub(page(share, 'SharedIdentity')) },
      { path: '/gifts/claim/:token', element: pub(page(gifts, 'GiftClaim')) },
      { path: '/c/join/:token', element: pub(page(circles, 'JoinCircle')) },
      { path: '/signin', element: pub(page(auth, 'SignIn')) },
      { path: '/signup', element: pub(page(auth, 'SignUp')) },
      { path: '/forgot-password', element: pub(page(auth, 'ForgotPassword')) },
      { path: '/reset-password', element: pub(page(auth, 'ResetPassword')) },
      { path: '/verify-email', element: pub(page(auth, 'VerifyEmail')) },
      { path: '/onboarding', element: authed(page(auth, 'Onboarding'), { onboarding: false }) },
      { path: '/legal/terms', element: pub(page(misc, 'Terms')) },
      { path: '/legal/privacy', element: pub(page(misc, 'PrivacyPolicy')) },
      { path: '/about/methodology', element: pub(page(misc, 'Methodology')) },
      { path: '/rsvp/:token', element: pub(page(weddings, 'Rsvp')) },
      { path: '/shared-report/link/:token', element: pub(page(bonds, 'SharedReportLink')) },
      { path: '/learn/certificates/:serial', element: pub(page(learn, 'CertificateView')) },
      { path: '/dev/mailbox', element: pub(page(misc, 'DevMailbox')) },
      {
        element: authed(<AppShell />, { onboarding: false }),
        children: [
          { path: '/u/:handle', element: page(identity, 'PublicProfile') },
        ],
      },
      {
        element: authed(<AppShell />),
        children: [
          { path: '/home', element: page(home, 'HomePage') },
          { path: '/identity', element: page(studio, 'IdentityStudio') },
          { path: '/explore', element: page(explore, 'ExplorePage') },
          { path: '/create', element: page(explore, 'CreatePage') },
          { path: '/merch', element: page(merch, 'MerchPage') },
          { path: '/membership', element: page(membership, 'MembershipPage') },
          { path: '/membership/join/:token', element: page(membership, 'MembershipJoin') },
          { path: '/merch/orders', element: page(merch, 'MerchOrders') },
          { path: '/merch/orders/:id', element: page(merch, 'MerchOrder') },
          { path: '/thoughts', element: page(thoughts, 'ThoughtsPage') },
          { path: '/thoughts/:id', element: page(thoughts, 'ThoughtDetail') },
          { path: '/circles', element: page(circles, 'CirclesPage') },
          { path: '/circles/:id', element: page(circles, 'CircleDetail') },
          { path: '/play', element: page(play, 'PlayPage') },
          { path: '/play/quizzes', element: page(quizzes, 'QuizzesPage') },
          { path: '/play/quizzes/new', element: page(quizzes, 'QuizBuilder') },
          { path: '/play/quizzes/:id', element: page(quizzes, 'QuizTake') },
          { path: '/play/tournaments', element: page(tournaments, 'TournamentsPage') },
          { path: '/play/tournaments/new', element: page(tournaments, 'TournamentBuilder') },
          { path: '/play/tournaments/:id', element: page(tournaments, 'TournamentPage') },
          { path: '/play/leaderboard', element: page(tournaments, 'SeasonLeaderboard') },
          { path: '/creators', element: page(creators, 'CreatorsDirectory') },
          { path: '/creators/:handle', element: page(creators, 'CreatorPage') },
          { path: '/creator-studio', element: page(creators, 'CreatorStudio') },
          { path: '/saved', element: page(collections, 'SavedPage') },
          { path: '/collections/:id', element: page(collections, 'CollectionPage') },
          { path: '/close-friends', element: page(collections, 'CloseFriendsPage') },
          { path: '/perks', element: page(perks, 'PerksPage') },
          { path: '/orgs', element: page(orgs, 'OrgsPage') },
          { path: '/orgs/:id', element: page(orgs, 'OrgPage') },
          { path: '/org/join/:token', element: page(orgs, 'JoinOrg') },
          { path: '/play/:id', element: page(play, 'GameSession') },
          { path: '/invite', element: page(home, 'InvitePage') },
          { path: '/progress', element: page(progress, 'ProgressPage') },
          { path: '/today', element: page(today, 'Today') },
          { path: '/cosmic-id', element: page(identity, 'CosmicId') },
          { path: '/chart', element: page(chart, 'ChartPage') },
          { path: '/calendar', element: page(calendar, 'CalendarPage') },
          { path: '/journey', element: page(journey, 'JourneyPage') },
          { path: '/journey/rewards', element: page(journey, 'RewardsPage') },
          { path: '/journey/wrapped', element: page(journey, 'WrappedPage') },
          { path: '/bonds', element: page(bonds, 'BondsPage') },
          { path: '/bonds/invite/:token', element: page(bonds, 'AcceptInvite') },
          { path: '/bonds/:id', element: page(bonds, 'BondDetail') },
          { path: '/shared-report/:id', element: page(bonds, 'SharedReport') },
          { path: '/social', element: page(social, 'FeedPage') },
          { path: '/social/post/:id', element: page(social, 'PostPage') },
          { path: '/social/groups', element: page(social, 'GroupsPage') },
          { path: '/social/groups/:slug', element: page(social, 'GroupPage') },
          { path: '/social/events', element: page(social, 'EventsPage') },
          { path: '/social/requests', element: page(social, 'FollowRequests') },
          { path: '/messages', element: page(messages, 'Inbox') },
          { path: '/messages/:id', element: page(messages, 'Conversation') },
          { path: '/dating', element: page(dating, 'DatingHome') },
          { path: '/dating/profile', element: page(dating, 'DatingProfileEditor') },
          { path: '/matchmaking', element: page(matchmaking, 'MatchmakingHome') },
          { path: '/matchmaking/profile', element: page(matchmaking, 'MatchmakingProfileEditor') },
          { path: '/matchmaking/family', element: page(matchmaking, 'FamilyBridge') },
          { path: '/matchmaking/connections/:id', element: page(matchmaking, 'ConnectionDetail') },
          { path: '/family/accept/:token', element: page(matchmaking, 'FamilyAccept') },
          { path: '/family/view/:principalId', element: page(matchmaking, 'FamilyView') },
          { path: '/experts', element: page(experts, 'ExpertsPage') },
          { path: '/experts/bookings', element: page(experts, 'MyBookings') },
          { path: '/experts/bookings/:id', element: page(experts, 'BookingDetail') },
          { path: '/experts/:id', element: page(experts, 'ExpertProfilePage') },
          { path: '/expert/dashboard', element: page(experts, 'ExpertDashboard') },
          { path: '/learn', element: page(learn, 'LearnPage') },
          { path: '/learn/lesson/:id', element: page(learn, 'LessonPage') },
          { path: '/learn/:slug', element: page(learn, 'CoursePage') },
          { path: '/creator', element: page(learn, 'CreatorStudio') },
          { path: '/shop', element: page(shop, 'ShopPage') },
          { path: '/shop/p/:slug', element: page(shop, 'ProductPage') },
          { path: '/shop/cart', element: page(shop, 'CartPage') },
          { path: '/shop/orders', element: page(shop, 'OrdersPage') },
          { path: '/shop/orders/:id', element: page(shop, 'OrderDetail') },
          { path: '/shop/library', element: page(shop, 'LibraryPage') },
          { path: '/reports/:id', element: page(shop, 'ReportView') },
          { path: '/store/:handle', element: page(shop, 'Storefront') },
          { path: '/seller', element: page(shop, 'SellerStudio') },
          { path: '/pay/dev/:id', element: page(shop, 'DevPayment') },
          { path: '/pay/razorpay/:id', element: page(shop, 'RazorpayPayment') },
          { path: '/weddings', element: page(weddings, 'WeddingsHome') },
          { path: '/weddings/new', element: page(weddings, 'NewWedding') },
          { path: '/weddings/join/:token', element: page(weddings, 'JoinWedding') },
          { path: '/weddings/:id', element: page(weddings, 'WeddingProject') },
          { path: '/vendors', element: page(weddings, 'VendorsPage') },
          { path: '/vendors/:id', element: page(weddings, 'VendorPage') },
          { path: '/vendor/dashboard', element: page(weddings, 'VendorDashboard') },
          { path: '/notifications', element: page(misc, 'NotificationsPage') },
          { path: '/search', element: page(misc, 'SearchPage') },
          { path: '/support', element: page(misc, 'SupportPage') },
          { path: '/support/:id', element: page(misc, 'TicketPage') },
          { path: '/settings', element: page(settings, 'SettingsPage') },
          { path: '/settings/:tab', element: page(settings, 'SettingsPage') },
          { path: '/admin', element: authed(page(admin, 'AdminPage'), { staff: true }) },
          { path: '/admin/:section', element: authed(page(admin, 'AdminPage'), { staff: true }) },
        ],
      },
      { path: '*', element: <RouteError notFound /> },
    ],
  },
]);
