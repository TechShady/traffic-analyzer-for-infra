const fs = require('fs');
let d = fs.readFileSync('c:\\Users\\john.kelly\\Documents\\GitHub\\traffic-analyzer-for-infra\\services-overview-jk-content.json','utf8');
// Strip BOM
if (d.charCodeAt(0) === 0xFEFF) d = d.slice(1);
// Find last } and trim trailing text
const lastBrace = d.lastIndexOf('}');
d = d.substring(0, lastBrace + 1);
const j = JSON.parse(d);
// Save clean JSON
fs.writeFileSync('c:\\Users\\john.kelly\\Documents\\GitHub\\traffic-analyzer-for-infra\\services-overview-jk-clean.json', JSON.stringify(j, null, 2), 'utf8');

const tiles = j.tiles;
Object.entries(tiles).forEach(([id,t]) => {
  const qStart = t.query ? t.query.substring(0,120).replace(/\n/g,' ') : 'NO QUERY';
  console.log(`Tile ${id} | Title: ${t.title||'(none)'} | Query: ${qStart}`);
});
console.log('\nTotal tiles:', Object.keys(tiles).length);
console.log('\nVariables:', j.variables ? j.variables.map(v => v.key) : 'none');
