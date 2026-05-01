const fs = require('fs');

// Read and clean (BOM + trailing text from dtctl edit)
let d = fs.readFileSync('c:\\Users\\john.kelly\\Documents\\GitHub\\traffic-analyzer-for-infra\\cwv-jk-dashboard-content.json', 'utf8');
if (d.charCodeAt(0) === 0xFEFF) d = d.slice(1);
const lastBrace = d.lastIndexOf('}');
d = d.substring(0, lastBrace + 1);
const j = JSON.parse(d);

// Save clean JSON
fs.writeFileSync('c:\\Users\\john.kelly\\Documents\\GitHub\\traffic-analyzer-for-infra\\cwv-jk-dashboard-clean.json', JSON.stringify(j, null, 2), 'utf8');

const tiles = j.tiles;
console.log('Total tiles:', Object.keys(tiles).length);
console.log('\nVariables:', j.variables ? j.variables.map(v => v.key) : 'none');
console.log('\n');

Object.entries(tiles).forEach(([id, t]) => {
  console.log('='.repeat(80));
  console.log(`TILE ${id}: ${t.title || '(no title)'}`);
  console.log(`Type: ${t.type} | Viz: ${t.visualization || 'N/A'}`);
  const q = t.query || 'NO QUERY';
  const startsWithDataRecord = q.trim().startsWith('data record');
  const startsWithDataJson = q.trim().startsWith('data json:');
  const hasDollar = /\$[A-Za-z]/.test(q);
  console.log(`data record: ${startsWithDataRecord} | data json: ${startsWithDataJson} | has $var: ${hasDollar}`);
  console.log('-'.repeat(80));
  console.log(q);
  console.log('');
});
