const fs = require('fs');

const dashboard = JSON.parse(fs.readFileSync('C:\\Users\\john.kelly\\Downloads\\Copy of Frontend Observability for CWV.json', 'utf8'));

// Map tile IDs to descriptive task names
const tileNameMap = {
  '109': 'cls_kpi',
  '110': 'inp_kpi',
  '111': 'lcp_kpi',
  '112': 'error_count',
  '113': 'page_load',
  '114': 'navigations',
  '117': 'user_actions',
  '118': 'cwv_health',
  '121': 'applications',
  '122': 'lcp_trend',
  '123': 'inp_trend',
  '124': 'cls_trend',
  '125': 'fid_kpi',
  '126': 'fid_trend',
  '127': 'apdex_kpi',
  '128': 'apdex_trend'
};

// Nice report names for each prompt
const reportNameMap = {
  'cls_kpi': 'CLS KPI',
  'inp_kpi': 'INP KPI',
  'lcp_kpi': 'LCP KPI',
  'error_count': 'Error Count',
  'page_load': 'Page Load',
  'navigations': 'Navigations',
  'user_actions': 'User Actions',
  'cwv_health': 'CWV Health',
  'applications': 'Applications',
  'lcp_trend': 'LCP Trend',
  'inp_trend': 'INP Trend',
  'cls_trend': 'CLS Trend',
  'fid_kpi': 'FID KPI',
  'fid_trend': 'FID Trend',
  'apdex_kpi': 'Apdex KPI',
  'apdex_trend': 'Apdex Trend'
};

function modifyQuery(query) {
  // If query starts with "data", don't modify it
  if (query.trimStart().startsWith('data ')) {
    return query;
  }

  let modified = query;

  // Add timeframe filter: from: @d-1d, to: @d
  // Handle "fetch user.events, scanLimitGBytes:..." pattern
  modified = modified.replace(
    /^(fetch\s+user\.events)(,\s*scanLimitGBytes\s*:\s*-?\d+)?/,
    (match, fetchPart, scanLimit) => {
      if (scanLimit) {
        return `${fetchPart}${scanLimit}, from: @d-1d, to: @d`;
      }
      return `${fetchPart}, from: @d-1d, to: @d`;
    }
  );

  // Add limit 25 if no limit exists
  if (!/\|\s*limit\s+\d+/i.test(modified)) {
    modified = modified.trimEnd() + '\n| limit 25';
  }

  return modified;
}

// Build all tile entries sorted by tile ID
const tileIds = Object.keys(dashboard.tiles).sort((a, b) => Number(a) - Number(b));

const dqlTasks = {};
const promptTasks = {};
const allDqlNames = [];
const allPromptNames = [];

let xPos = -12;

for (const tileId of tileIds) {
  const tile = dashboard.tiles[tileId];
  const taskName = tileNameMap[tileId];
  if (!taskName) {
    console.error(`No name mapping for tile ${tileId}`);
    continue;
  }

  const query = modifyQuery(tile.query);
  const promptName = `${taskName}_prompt`;
  const reportName = reportNameMap[taskName] || taskName;

  allDqlNames.push(taskName);
  allPromptNames.push(promptName);

  // DQL task
  dqlTasks[taskName] = {
    name: taskName,
    input: {
      query: query
    },
    action: "dynatrace.automations:execute-dql-query",
    position: {
      x: xPos,
      y: 1
    },
    description: "Make use of Dynatrace Grail data in your workflow.",
    predecessors: []
  };

  // Prompt task
  promptTasks[promptName] = {
    name: promptName,
    input: {
      config: "disabled",
      prompt: `Provide a report for the following use case:\n## ${reportName} Analysis Report\n`,
      autoTrim: true,
      instruction: "Provide a Summary, Insights, Observations and Recommendations.",
      supplementary: `Format examples in tables instead of bulleted lists.\nWhere applicable convert units for readability, e.g. 1000000000 bytes is 1 TiB.\nWhere applicable show relative percentages, e.g. 100 used and 1000 allocatable is 10% utilized.\nUse this analysis:\n{{result("${taskName}")["records"]}}\n`
    },
    action: "dynatrace.davis.copilot.workflow.actions:davis-copilot",
    position: {
      x: xPos,
      y: 2
    },
    conditions: {
      states: {
        [taskName]: "OK"
      }
    },
    description: "Prompt the Dynatrace Intelligence generative AI",
    predecessors: [taskName]
  };

  xPos++;
}

// Overall prompt task
const overallPrompt = {
  name: "overall_prompt",
  input: {
    config: "disabled",
    prompt: "Provide a report for the following use case:\n## Copy of Frontend Observability for CWV Dashboard Executive Report",
    autoTrim: true,
    instruction: "Provide a Summary, Insights, Observations and Recommendations.",
    supplementary: "Format examples in tables instead of bulleted lists.\nUse this analysis:\n" +
      allPromptNames.map(p => `{{result("${p}").text}}`).join('\n') + '\n\n'
  },
  action: "dynatrace.davis.copilot.workflow.actions:davis-copilot",
  position: {
    x: 0,
    y: 3
  },
  conditions: {
    states: Object.fromEntries(allPromptNames.map(p => [p, "OK"]))
  },
  description: "Prompt the Dynatrace Intelligence generative AI",
  predecessors: [...allPromptNames]
};

// Email tasks
const emailExecReport = {
  name: "email_exec_report",
  input: {
    cc: [],
    to: ["john.kelly@dynatrace.com"],
    bcc: [],
    content: '#\n# Dashboard Overall Summary \n#\n{{result("overall_prompt").text}}\n',
    subject: "Copy of Frontend Observability for CWV Dashboard Executive Summary Report"
  },
  action: "dynatrace.email:send-email",
  position: {
    x: 1,
    y: 4
  },
  conditions: {
    states: {
      overall_prompt: "OK"
    }
  },
  description: "Send email",
  predecessors: ["overall_prompt"]
};

const emailDashboardReport = {
  name: "email_dashboard_report",
  input: {
    cc: [],
    to: ["john.kelly@dynatrace.com"],
    bcc: [],
    content: '#\n# Dashboard Overall Summary\n#\n{{result("overall_prompt").text}}\n#\n# Dashboard Tile Summary\n#\n' +
      allPromptNames.map(p => `{{result("${p}").text}}`).join('\n') + '\n',
    subject: "Copy of Frontend Observability for CWV Dashboard Tile Report"
  },
  action: "dynatrace.email:send-email",
  position: {
    x: -1,
    y: 4
  },
  conditions: {
    states: {
      overall_prompt: "OK"
    }
  },
  description: "Send email",
  predecessors: ["overall_prompt"]
};

// Assemble workflow
const workflow = {
  title: "Copy of Frontend Observability for CWV Report",
  description: "This Workflow generates Frontend Observability for Core Web Vitals reports and emails to the specified addresses.",
  ownerType: "USER",
  isPrivate: true,
  schemaVersion: 4,
  trigger: {},
  result: null,
  type: "STANDARD",
  input: {},
  hourlyExecutionLimit: 10,
  guide: "# Frontend Observability for CWV Report\nGet a comprehensive analysis of your Core Web Vitals. This Workflow queries Grail and provides data to Dynatrace Assist to get recommendations. These recommendations are then sent to email(s) of your choice.\n\n# Setup\n1. Change emails (`to`, `cc`, `bcc`) to be an array of strings.\n2. Test with a manual Run, by click the `Run` button.\n3. If everything works as expected, change the [Trigger](?trigger=) to a schedule, e.g. Weekly, Daily, etc.",
  tasks: {
    ...dqlTasks,
    ...promptTasks,
    overall_prompt: overallPrompt,
    email_exec_report: emailExecReport,
    email_dashboard_report: emailDashboardReport
  }
};

const outputPath = 'C:\\Users\\john.kelly\\Downloads\\copy-frontend-cwv-workflow.json';
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2), 'utf8');

// Print stats
console.log(`Dashboard tiles: ${tileIds.length}`);
console.log(`DQL tasks: ${allDqlNames.length}`);
console.log(`Prompt tasks: ${allPromptNames.length}`);
console.log(`Overall prompt: 1`);
console.log(`Email tasks: 2`);
console.log(`Total Dynatrace Intelligence tasks: ${allPromptNames.length + 1}`);
console.log(`Total tasks: ${Object.keys(workflow.tasks).length}`);
console.log(`Workflow written to: ${outputPath}`);
