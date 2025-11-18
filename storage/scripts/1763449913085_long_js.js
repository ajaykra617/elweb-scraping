// long_node_test.js
// Usage: node long_node_test.js '{"Product URL":"..."}' --logFile=/path/to/log --resultFile=/path/to/result.json

const fs = require('fs');

function argValue(name) {
  for (const a of process.argv) {
    if (a.startsWith(name + '=')) return a.split('=').slice(1).join('=');
  }
  return null;
}

const row = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const logFile = argValue('--logFile') || null;
const resultFile = argValue('--resultFile') || null;

function log(msg) {
  const t = new Date().toISOString();
  const line = `[${t}] ${msg}\n`;
  process.stdout.write(line);
  if (logFile) {
    try { fs.appendFileSync(logFile, line); } catch(e){}
  }
}

(async () => {
  log(`START ROW: ${JSON.stringify(row)}`);

  // run for ~30 seconds (change to 240 for 4 minutes)
  for (let i=0;i<10;i++){
    await new Promise(r => setTimeout(r, 3000)); // every 3s
    log(`tick ${i+1} - doing work...`);
  }

  const out = { success: true, message: "done", row };

  if (resultFile) {
    try { fs.writeFileSync(resultFile, JSON.stringify(out)); } catch(e){ log("result write err: "+e.message); }
  }

  log("FINISHED");
  process.exit(0);
})();