import admin from 'firebase-admin';
import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

const serviceAccount = require('./path/to/serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const moodleUrl = 'https://lms.drmarwahamdy.com';
const moodleLoginEndpoint = `${moodleUrl}/admin/oauth2callback.php`;

function createClient() {
  const jar = new CookieJar();
  return wrapper(axios.create({ jar }));
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'ID token is required' });
    }

    let axiosClient;

    try {
      // Verify Firebase ID token
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;

      axiosClient = createClient();

      // Authenticate with Moodle using OAuth2 token exchange
      const tokenExchangeUrl = moodleLoginEndpoint;
      const tokenResponse = await axiosClient.post(tokenExchangeUrl, new URLSearchParams({
        id_token: idToken
      }).toString());

      if (tokenResponse.status === 200) {
        const cookies = axiosClient.defaults.jar.getCookiesSync(tokenExchangeUrl);
        const hasMoodleId = cookies.some(cookie => cookie.key.startsWith('MOODLEID1_'));

        if (hasMoodleId) {
          res.json({ message: 'Login successful', cookies });
        } else {
          res.status(401).json({ error: 'Invalid login credentials' });
        }
      } else {
        res.status(401).json({ error: 'Invalid login credentials' });
      }

    } catch (error) {
      console.error('Authentication error:', error);
      return res.status(500).json({ error: error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
