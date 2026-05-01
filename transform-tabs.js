// Script to transform static tabs into dynamically ordered tabs
const fs = require('fs');
const filePath = 'c:\\Users\\john.kelly\\Documents\\GitHub\\traffic-analyzer-for-infra\\ui\\app\\pages\\TrafficAnalyzer.tsx';
let code = fs.readFileSync(filePath, 'utf8');

// First, revert the partial change we made
code = code.replace(
  `      <Tabs>\n        {tabOrder.map((tabId) => {\n          if (tabId === "overview") return (\n        <Tab key={tabId} title="Overview">`,
  `      <Tabs>\n        <Tab title="Overview">`
);

// Define the tab boundaries: title as it appears in the source -> tab id
const tabMappings = [
  { title: 'Overview', id: 'overview' },
  { title: 'Forecast Breakdown', id: 'forecast_breakdown' },
  { title: 'Metrics - Observed', id: 'metrics_observed' },
  { title: 'Metrics - Forecast', id: 'metrics_forecast' },
  { title: 'Top Impacted Entities - CPU', id: 'top_cpu' },
  { title: 'Top Impacted Entities - Memory', id: 'top_memory' },
  { title: 'Top Impacted Entities - Disk', id: 'top_disk' },
  { title: 'Analytics', id: 'analytics' },
  { title: 'Saturation Countdown', id: 'saturation' },
  { title: 'What-If Scenarios', id: 'whatif' },
  { title: 'Right-Sizing', id: 'rightsizing' },
  { title: 'Host Heatmap', id: 'heatmap' },
  { title: 'Correlation Matrix', id: 'correlation_matrix' },
  { title: 'Trend Analysis', id: 'trend_analysis' },
  { title: 'Capacity Report', id: 'capacity_report' },
  { title: 'Baselines', id: 'baselines' },
  { title: 'Alert Rules', id: 'alert_rules' },
];

// Find the <Tabs> section
const tabsStart = code.indexOf('      <Tabs>');
const tabsEnd = code.indexOf('      </Tabs>') + '      </Tabs>'.length;

if (tabsStart === -1 || tabsEnd === -1) {
  console.error('Could not find <Tabs> section');
  process.exit(1);
}

const tabsSection = code.substring(tabsStart, tabsEnd);

// Parse out each tab's content between <Tab title="..."> and </Tab>
const tabContents = {};
for (let i = 0; i < tabMappings.length; i++) {
  const mapping = tabMappings[i];
  const searchStr = `<Tab title="${mapping.title}">`;
  const startIdx = tabsSection.indexOf(searchStr);
  if (startIdx === -1) {
    console.error(`Could not find tab: ${mapping.title}`);
    process.exit(1);
  }
  
  // Find the matching </Tab> - need to count nested Tab elements
  const contentStart = startIdx + searchStr.length;
  
  // Find the next </Tab> that is at the right nesting level
  let depth = 1;
  let pos = contentStart;
  while (depth > 0 && pos < tabsSection.length) {
    const nextOpen = tabsSection.indexOf('<Tab ', pos);
    const nextClose = tabsSection.indexOf('</Tab>', pos);
    
    if (nextClose === -1) break;
    
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 5;
    } else {
      depth--;
      if (depth === 0) {
        tabContents[mapping.id] = {
          title: mapping.title,
          content: tabsSection.substring(contentStart, nextClose).trim()
        };
      }
      pos = nextClose + 6;
    }
  }
  
  if (!tabContents[mapping.id]) {
    console.error(`Could not extract content for tab: ${mapping.title}`);
    process.exit(1);
  }
}

console.log('Extracted', Object.keys(tabContents).length, 'tabs');

// Build the new <Tabs> section with dynamic ordering
let newTabsSection = '      <Tabs>\n';
newTabsSection += '        {tabOrder.map((tabId) => {\n';

tabMappings.forEach((mapping, idx) => {
  const content = tabContents[mapping.id].content;
  const condition = idx === 0 ? 'if' : 'if';
  newTabsSection += `          ${condition} (tabId === "${mapping.id}") return (\n`;
  newTabsSection += `        <Tab key={tabId} title="${mapping.title}">\n`;
  newTabsSection += `          ${content}\n`;
  newTabsSection += `        </Tab>\n`;
  newTabsSection += `          );\n`;
});

newTabsSection += '          return null;\n';
newTabsSection += '        })}\n';
newTabsSection += '      </Tabs>';

// Replace the old tabs section
code = code.substring(0, tabsStart) + newTabsSection + code.substring(tabsEnd);

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully transformed tabs to dynamic ordering');

// Verify the file is valid by checking bracket balance in the new section
let parens = 0, braces = 0, brackets = 0;
for (const c of newTabsSection) {
  if (c === '(') parens++;
  if (c === ')') parens--;
  if (c === '{') braces++;
  if (c === '}') braces--;
  if (c === '[') brackets++;
  if (c === ']') brackets--;
}
console.log('Balance check - parens:', parens, 'braces:', braces, 'brackets:', brackets);
