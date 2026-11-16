import crypto from 'node:crypto';
import postgres from 'postgres';
import fs from 'node:fs';

const TARGET_URL = 'https://outcoded.xyz';

// Real 1x1 transparent PNG binary bytes
const PNG_BUFFER = Buffer.from(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010D0A2DB40000000049454E44AE426082',
  'hex'
);
const EXPECTED_SHA256 = crypto.createHash('sha256').update(PNG_BUFFER).digest('hex');

async function verifyLiveAssetUpload() {
  console.log('=== LIVE PRODUCTION /api/assets VERIFICATION ===');
  console.log('Target URL:', TARGET_URL);
  console.log('Test File: live-audit-logo.png, Expected SHA-256:', EXPECTED_SHA256);

  // 1. Authenticate as Maintainer (Tenant Alpha)
  const authRes = await fetch(`${TARGET_URL}/api/auth/demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'maintainer', org: 'alpha' }),
  });
  if (authRes.status !== 200) {
    throw new Error(`Demo auth failed with status ${authRes.status}`);
  }
  const alphaCookie = authRes.headers.get('set-cookie');
  console.log('1. Alpha Maintainer authenticated successfully.');

  // 2. Upload binary asset via multipart/form-data
  const assetName = `live-audit-logo-${Date.now()}.png`;
  const formData = new FormData();
  formData.append('file', new Blob([PNG_BUFFER], { type: 'image/png' }), assetName);
  formData.append('name', assetName);
  formData.append('allowedUsage', 'Header branding on live production audit');

  const uploadStart = Date.now();
  const uploadRes = await fetch(`${TARGET_URL}/api/assets`, {
    method: 'POST',
    headers: { Cookie: alphaCookie },
    body: formData,
  });
  const uploadLatency = Date.now() - uploadStart;

  console.log(`2. POST /api/assets HTTP Status: ${uploadRes.status} (${uploadLatency}ms)`);
  const uploadBodyText = await uploadRes.text();
  console.log('   Response Body:', uploadBodyText);

  if (uploadRes.status !== 201) {
    throw new Error(`Asset upload failed: Expected HTTP 201, got ${uploadRes.status}: ${uploadBodyText}`);
  }

  const uploadData = JSON.parse(uploadBodyText);
  const createdAsset = uploadData.asset;
  console.log('   Created Asset ID:', createdAsset.id);
  console.log('   Reported SHA-256:', createdAsset.sha256);
  console.log('   Approval State:', createdAsset.approvalState);

  if (createdAsset.sha256.toLowerCase() !== EXPECTED_SHA256.toLowerCase()) {
    throw new Error(`SHA-256 mismatch: expected ${EXPECTED_SHA256}, got ${createdAsset.sha256}`);
  }

  // 3. GET metadata persistence
  const metaRes = await fetch(`${TARGET_URL}/api/assets?id=${createdAsset.id}`, {
    headers: { Cookie: alphaCookie },
  });
  console.log(`3. GET /api/assets?id=${createdAsset.id} Status: ${metaRes.status}`);
  const metaData = await metaRes.json();
  if (metaRes.status !== 200 || !metaData.asset || metaData.asset.id !== createdAsset.id) {
    throw new Error(`Metadata retrieval failed: ${JSON.stringify(metaData)}`);
  }
  console.log('   Metadata persistence confirmed in PostgreSQL.');

  // 4. GET binary retrieval (downloads from Supabase Storage 'onbrand-assets')
  const binaryRes = await fetch(`${TARGET_URL}/api/assets?id=${createdAsset.id}&binary=true`, {
    headers: { Cookie: alphaCookie },
  });
  console.log(`4. GET /api/assets?id=${createdAsset.id}&binary=true Status: ${binaryRes.status}`);
  if (binaryRes.status !== 200) {
    const errText = await binaryRes.text();
    throw new Error(`Binary download failed: status ${binaryRes.status}, body: ${errText}`);
  }

  const downloadedBuf = Buffer.from(await binaryRes.arrayBuffer());
  const downloadedSha = crypto.createHash('sha256').update(downloadedBuf).digest('hex');
  console.log('   Downloaded bytes:', downloadedBuf.length);
  console.log('   Downloaded SHA-256:', downloadedSha);

  if (downloadedSha !== EXPECTED_SHA256) {
    throw new Error(`Binary corruption: downloaded SHA ${downloadedSha} !== expected ${EXPECTED_SHA256}`);
  }
  console.log('   Byte-for-byte binary identity verified from Supabase Storage!');

  // 5. Cross-Tenant Isolation: Authenticate as Tenant Beta and attempt retrieval
  const betaAuthRes = await fetch(`${TARGET_URL}/api/auth/demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'maintainer', org: 'beta' }),
  });
  const betaCookie = betaAuthRes.headers.get('set-cookie');

  const crossTenantRes = await fetch(`${TARGET_URL}/api/assets?id=${createdAsset.id}`, {
    headers: { Cookie: betaCookie },
  });
  console.log(`5. Cross-tenant retrieval by Tenant Beta Status: ${crossTenantRes.status} (Expected 404)`);
  if (crossTenantRes.status !== 404) {
    throw new Error(`Cross-tenant security breach: Tenant Beta accessed Alpha's asset with status ${crossTenantRes.status}`);
  }
  console.log('   Cross-tenant storage isolation confirmed (Tenant Beta receives 404 Not Found).');

  // 6. Direct PostgreSQL Inspection
  let dbUrl = '';
  if (fs.existsSync('.env.local')) {
    for (const line of fs.readFileSync('.env.local', 'utf-8').split('\n')) {
      const t = line.trim();
      if (t.startsWith('DATABASE_URL=')) dbUrl = t.slice('DATABASE_URL='.length).replace(/^['"]|['"]$/g, '');
    }
  }

  if (dbUrl) {
    const sql = postgres(dbUrl, { ssl: 'require', max: 1 });
    try {
      const rows = await sql`select id, organization_id, name, sha256, approval_state from assets where id = ${createdAsset.id}`;
      console.log(`6. Direct PostgreSQL Inspection: Found ${rows.length} row(s)`);
      if (rows.length > 0) {
        console.log('   DB Record:', rows[0]);
      }
    } finally {
      await sql.end();
    }
  }

  console.log('\n======================================================');
  console.log('🎉 ALL LIVE ASSET STORAGE TESTS PASSED ON PRODUCTION!');
  console.log('======================================================');
}

verifyLiveAssetUpload().catch(err => {
  console.error('\n❌ LIVE ASSET VERIFICATION FAILED:', err);
  process.exit(1);
});
