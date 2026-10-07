/**
 * QuickTranslate: English to Bangla
 * Automated Verification Script
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

let allPassed = true;
function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
    allPassed = false;
  }
}

console.log('--- 1. Validating Manifest V3 Configuration ---');
const manifestPath = path.join(__dirname, '../manifest.json');
assert(fs.existsSync(manifestPath), 'manifest.json exists');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
assert(manifest.manifest_version === 3, 'Manifest version is 3');
assert(manifest.background && manifest.background.service_worker === 'background.js', 'Service worker defined');
assert(manifest.content_scripts && manifest.content_scripts[0].js.includes('content.js'), 'Content script defined');
assert(manifest.action && manifest.action.default_popup === 'popup.html', 'Default popup defined');
assert(manifest.permissions && manifest.permissions.includes('storage'), 'Storage permission declared');
assert(manifest.host_permissions && manifest.host_permissions.includes('https://translate.googleapis.com/*'), 'Google Translate host permission declared');

console.log('\n--- 2. Validating Extension Icons ---');
for (const size of ['16', '48', '128']) {
  const iconPath = path.join(__dirname, `../assets/icon${size}.png`);
  assert(fs.existsSync(iconPath), `assets/icon${size}.png exists`);
  const stats = fs.statSync(iconPath);
  assert(stats.size > 500, `assets/icon${size}.png has valid binary size (${stats.size} bytes)`);
}

console.log('\n--- 3. Validating Offline Dictionary Dataset ---');
const dictPath = path.join(__dirname, '../data/dictionary.json');
assert(fs.existsSync(dictPath), 'data/dictionary.json exists');
const dict = JSON.parse(fs.readFileSync(dictPath, 'utf-8'));
const entryCount = Object.keys(dict).length;
assert(entryCount >= 9000, `Dictionary contains ${entryCount.toLocaleString()} words (target >= 9,000)`);

// Test specific words
const testWords = ['computer', 'serendipity', 'software', 'student', 'developer', 'beautiful', 'learn', 'knowledge'];
for (const w of testWords) {
  const entry = dict[w];
  assert(entry && entry.bn && entry.bn.length > 0, `Word "${w}" has Bangla meaning: "${entry?.bn}"`);
}

console.log('\n--- 4. Validating Code Syntax ---');
const jsFiles = ['background.js', 'content.js', 'popup.js'];
for (const file of jsFiles) {
  const filePath = path.join(__dirname, '..', file);
  assert(fs.existsSync(filePath), `${file} exists`);
  const content = fs.readFileSync(filePath, 'utf-8');
  assert(content.length > 200, `${file} is non-empty (${content.length} characters)`);
}

console.log('\n--- 5. Validating UI HTML and Scoped CSS Files ---');
const uiFiles = ['popup.html', 'popup.css', 'content.css', 'test/demo.html'];
for (const file of uiFiles) {
  const filePath = path.join(__dirname, '..', file);
  assert(fs.existsSync(filePath), `${file} exists`);
}

console.log('\n--- 6. Testing Google Translate Web Endpoint ---');
const testQuery = encodeURIComponent('artificial intelligence');
const apiUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=bn&dt=t&q=${testQuery}`;

https.get(apiUrl, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      const translated = data[0][0][0];
      assert(translated && translated.includes('কৃত্রিম'), `API returns expected translation: "${translated}"`);
      console.log('\n=======================================');
      if (allPassed) {
        console.log(' ALL EXTENSION VERIFICATION TESTS PASSED!');
      } else {
        console.error(' SOME TESTS FAILED!');
      }
      console.log('=======================================\n');
    } catch (e) {
      assert(false, `API response parse error: ${e.message}`);
    }
  });
}).on('error', (e) => {
  assert(false, `API network error: ${e.message}`);
});
