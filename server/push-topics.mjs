// Server-only: never expose Firebase Admin credentials through VITE_ variables.
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
export function createTopicHandler({ apiUrl, env = process.env, fetcher = fetch, messaging } = {}) {
  const getAdmin = () => {
    if (messaging) return messaging;
    const credential = env.FIREBASE_SERVICE_ACCOUNT_JSON ? cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON)) : applicationDefault();
    const app = getApps()[0] || initializeApp({ credential });
    return getMessaging(app);
  };
  return async function topics(request) {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return Response.json({ message: 'Sign in required.' }, { status: 401 });
    const me = await fetcher(apiUrl + '/auth/me', { headers: { Authorization: authorization }, signal: AbortSignal.timeout(15000) });
    if (!me.ok) return Response.json({ message: 'Session is not valid.' }, { status: me.status });
    const raw = await me.json(), user = raw.user || raw.data?.user || raw.data || raw;
    const body = await request.json();
    if (body.userId !== user.id || typeof body.token !== 'string' || body.token.length < 20 || body.token.length > 4096) return Response.json({ message: 'Invalid device registration.' }, { status: 400 });
    // Derive allowed topics from the authenticated identity. The browser cannot
    // subscribe itself to another technician's topic or inject arbitrary names.
    const topics = ['warranty-all', 'tech-' + user.id, 'warranty-techs'];
    for (const topic of topics) {
      const result = await getAdmin().subscribeToTopic([body.token], topic);
      if (result.failureCount) return Response.json({ message: 'Firebase rejected this device token.' }, { status: 502 });
    }
    return Response.json({ success: true, topics });
  };
}
