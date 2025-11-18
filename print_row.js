#!/usr/bin/env node
try {
    const raw = process.argv[2];
    const row = JSON.parse(raw);
    console.log("ROW:", JSON.stringify(row));
    process.exit(0);
} catch (e) {
    console.error("Error parsing row JSON:", e);
    process.exit(1);
}
