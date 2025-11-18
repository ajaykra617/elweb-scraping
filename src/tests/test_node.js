import axios from 'axios';
import * as cheerio from 'cheerio';

(async () => {
  console.log("🌐 Node test started...");
  try {
    const res = await axios.get('https://httpbin.org/ip', { timeout: 10000 });
    console.log("✅ Raw response:", res.data);
    const origin = res.data && res.data.origin ? res.data.origin : JSON.stringify(res.data);
    console.log("🧠 Your public IP (from httpbin):", origin);
  } catch (e) {
    console.error("❌ Request failed:", e.message);
    process.exit(1);
  }
})();
