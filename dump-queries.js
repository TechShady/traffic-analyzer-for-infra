const fs = require('fs');
const j = JSON.parse(fs.readFileSync('c:\\Users\\john.kelly\\Documents\\GitHub\\traffic-analyzer-for-infra\\services-overview-jk-clean.json','utf8'));
const tiles = j.tiles;

// Output full queries for all tiles
Object.entries(tiles).forEach(([id, t]) => {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TILE ${id}: ${t.title || '(no title)'}`);
  console.log(`Type: ${t.type} | Visualization: ${t.visualization || 'N/A'}`);
  console.log(`${'='.repeat(80)}`);
  console.log(t.query || 'NO QUERY');
});
