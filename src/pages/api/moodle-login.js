import axios from "axios";
import { CookieJar } from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";
import { URLSearchParams } from "url";

// Function to create a new axios client with a fresh CookieJar
function createClient() {
  const jar = new CookieJar();
  return wrapper(axios.create({ jar }));
}

export default async function handler(req, res) {
  if (req.method === "POST") {
    let { url, username, password } = req.body;
    if (!url) {
      url = "https://lms.drmarwahamdy.com/";
    }
    if (!url || !username || !password) {
      return res
        .status(400)
        .json({ error: "URL, username, and password are required" });
    }

    let client;

    try {
      // Clear cookies and cache by creating a new client instance
      client = createClient();
      const loginUrl = url + "/login/index.php";
      // Step 1: Get the login page to extract the logintoken
      const loginPageResponse = await client.get(loginUrl);
      const loginPageContent = loginPageResponse.data;

      // Extract the logintoken using regex
      const logintokenPattern =
        /<input type="hidden" name="logintoken" value="(\w{32})">/;
      const logintokenMatch = loginPageContent.match(logintokenPattern);
      if (!logintokenMatch) {
        throw new Error("Logintoken not found");
      }
      const logintoken = logintokenMatch[1];

      // Step 2: Post the login form with the extracted token, username, and password
      const loginFormResponse = await client.post(
        loginUrl,
        new URLSearchParams({
          logintoken,
          username,
          password,
        }).toString(),
        { maxRedirects: 0 }
      );

      // Step 3: Follow all redirects to ensure the login process completes
      let finalResponse = loginFormResponse;

      while ([301, 302, 303, 307, 308].includes(finalResponse.status)) {
        const redirectUrl = finalResponse.headers.location;
        finalResponse = await client.get(redirectUrl, { maxRedirects: 0 });
      }

      // Check if the page contains "Invalid login, please try again"
      const pageContent = finalResponse.data;
      if (pageContent.includes("Invalid login, please try again")) {
        return res.status(401).json({ error: "Invalid login credentials" });
      }

      // Check for MOODLEID1_ in cookies to confirm successful login
      const cookies = client.defaults.jar.getCookiesSync(url); // Use getCookiesSync for synchronous access
      console.log("Cookies:", cookies);
      const hasMoodleId = cookies.some((cookie) =>
        cookie.key.startsWith("MOODLEID1_")
      );

      if (hasMoodleId) {
        res.json({ message: "Login successful", cookies });
      } else {
        res.status(401).json({ error: "Invalid login credentials" });
      }
    } catch (error) {
      if (
        error.response &&
        [301, 302, 303, 307, 308].includes(error.response.status)
      ) {
        // Handle redirection errors separately
        try {
          const redirectUrl = error.response.headers.location;
          const finalResponse = await client.get(redirectUrl);

          // Check for MOODLEID1_ in cookies to confirm successful login
          const cookies = client.defaults.jar.getCookiesSync(redirectUrl);
          console.log("Cookies after redirect:", cookies);
          const hasMoodleId = cookies.some((cookie) =>
            cookie.key.startsWith("MOODLEID1_")
          );

          if (hasMoodleId) {
            return res.json({ message: "Login successful", cookies });
          } else {
            return res.status(401).json({ error: "Invalid login credentials" });
          }
        } catch (redirectError) {
          return res.status(500).json({ error: redirectError.message });
        }
      } else {
        return res.status(500).json({ error: error.message });
      }
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
