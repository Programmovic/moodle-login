import axios from 'axios';
import { OAuth2Client } from 'google-auth-library';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

function createClient() {
  const jar = new CookieJar();
  return wrapper(axios.create({ jar }));
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { idToken, CLIENT_ID } = req.body;

    if (!idToken || !CLIENT_ID) {
      return res.status(400).json({ error: 'ID token and CLIENT_ID are required' });
    }

    const client = new OAuth2Client(CLIENT_ID);
    let axiosClient;

    try {
      // Clear cookies and cache by creating a new client instance
      axiosClient = createClient();

      // Verify the Google ID token
      const ticket = await client.verifyIdToken({
        idToken,
        audience: CLIENT_ID, // Specify the CLIENT_ID of the app that accesses the backend
      });
      
      // Authenticate with Moodle using OAuth2 token exchange
      const tokenExchangeUrl = 'https://lms.drmarwahamdy.com/admin/oauth2callback.php';
      const tokenResponse = await axiosClient.post(tokenExchangeUrl, new URLSearchParams({
        id_token: idToken
      }).toString());

      // Check for successful authentication and set cookies
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
      return res.status(500).json({ error: error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
