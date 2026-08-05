async function testFormat(formatName, dateStr) {
  const url = `https://pb.delcargo.us/api/collections/hr_screenshots/records?perPage=1&filter=captured_at>="${encodeURIComponent(dateStr)}"`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(`${formatName} (${dateStr}): ${data.totalItems} items`);
}

async function run() {
  await testFormat("With T and Z (ISO)", "2026-08-05T04:00:00.000Z");
  await testFormat("Space and no Z", "2026-08-05 04:00:00.000");
  await testFormat("Space and Z", "2026-08-05 04:00:00.000Z");
  await testFormat("No ms and no Z", "2026-08-05 04:00:00");
  await testFormat("No ms and Z", "2026-08-05 04:00:00Z");
}

run();
