const fs = require('fs');
const filePath = 'c:\\Users\\john.kelly\\Documents\\GitHub\\traffic-analyzer-for-infra\\ui\\app\\pages\\TrafficAnalyzer.tsx';
let code = fs.readFileSync(filePath, 'utf8');

// Find and revert the partial edit
const searchText = '{tabOrder.map((tabId) => {';
const idx = code.indexOf(searchText);
if (idx === -1) {
  console.log('No partial edit found');
  process.exit(0);
}

// Find the start of the line before this (the <Tabs> line)
const lineStart = code.lastIndexOf('\n', idx - 1) + 1;
// Find what comes after the key={tabId} part
const keyTabStr = 'key={tabId} title="Overview">';
const keyIdx = code.indexOf(keyTabStr, idx);
const replaceEnd = keyIdx + keyTabStr.length;

// The text to replace: from ${lineStart content including spaces}{tabOrder.map...} through key={tabId} title="Overview">
const badText = code.substring(lineStart, replaceEnd);
console.log('Replacing:', JSON.stringify(badText.substring(0, 120)) + '...');

const replacement = '        <Tab title="Overview">';
code = code.substring(0, lineStart) + replacement + code.substring(replaceEnd);

fs.writeFileSync(filePath, code, 'utf8');
console.log('Reverted successfully');
