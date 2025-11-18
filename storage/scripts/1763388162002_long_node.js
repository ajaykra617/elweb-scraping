/**
 * long_test.js
 * Node script that receives real row-data from your system.
 */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  if (!process.argv[2]) {
    console.error("No row data provided!");
    process.exit(1);
  }

  // This IS the row from CSV -> passed by worker
  const row = JSON.parse(process.argv[2]);

  console.log("PROCESSING ROW:", JSON.stringify(row));

  // Example: working on product URL
  if (row.product_url) {
    console.log("Target URL:", row.product_url);
  }

  let elapsed = 0;
  const total = 240; // ~4 minutes

  while (elapsed < total) {
    console.log(`Row still working (${elapsed}s)... URL=${row.product_url}`);
    await sleep(2000);
    elapsed += 2;
  }

  console.log("DONE processing row:", row.product_url);
}

main().catch(err => {
  console.error("ERROR:", err);
  process.exit(1);
});