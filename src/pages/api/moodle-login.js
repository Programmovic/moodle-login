import cheerio from 'cheerio';
import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
      // Step 1: Get the login page to extract the logintoken
      const loginUrl = 'https://lms.drmarwahamdy.com/login/index.php';
      const loginPageResponse = await client.get(loginUrl);

      const $ = cheerio.load(loginPageResponse.data);
      const logintoken = $('input[name="logintoken"]').val();

      if (!logintoken) {
        throw new Error('Logintoken not found');
      }

      // Step 2: Post the login form with the extracted token, username, and password
      const loginFormResponse = await client.post(loginUrl, new URLSearchParams({
        logintoken,
        username,
        password
      }).toString());

      // Step 3: Follow all redirects to ensure the login process completes
      let finalResponse = loginFormResponse;

      while (finalResponse.headers.location) {
        const redirectUrl = finalResponse.headers.location;
        finalResponse = await client.get(redirectUrl);
      }

      // Check if the page contains "Invalid login, please try again"
      const pageContent = finalResponse.data;
      if (pageContent.includes('Invalid login, please try again')) {
        return res.status(401).json({ error: 'Invalid login credentials' });
      }

      // Check for MOODLEID1_ in cookies to confirm successful login
      const cookies = jar.getCookiesSync(loginUrl); // Use getCookiesSync for synchronous access
      const hasMoodleId = cookies.some(cookie => cookie.key.startsWith('MOODLEID1_'));

      if (hasMoodleId) {
        res.json({ message: 'Login successful', cookies });
      } else {
        res.status(401).json({ error: 'Invalid login credentials' });
      }

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
