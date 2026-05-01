const fs = require('fs');

// Read the Services Overview dashboard
const dashboard = JSON.parse(fs.readFileSync('C:/Users/john.kelly/Downloads/Services Overview.json', 'utf8'));

// Tile configurations: id, task name, human-readable title
const tileConfig = [
  { id: '0', name: 'service_requests_total', title: 'Service Requests Total' },
  { id: '1', name: 'service_latency_p50', title: 'Service Latency P50' },
  { id: '2', name: 'service_latency_p90', title: 'Service Latency P90' },
  { id: '3', name: 'service_failed_requests', title: 'Service Failed Requests' },
  { id: '4', name: 'service_failed_rate', title: 'Service Failure Rate' },
  { id: '5', name: 'service_5xx_errors', title: 'Service 5xx Errors' },
  { id: '6', name: 'service_4xx_errors', title: 'Service 4xx Errors' },
  { id: '7', name: 'process_cpu_usage', title: 'Process CPU Usage' },
  { id: '8', name: 'process_memory_usage_pct', title: 'Process Memory Usage Percent' },
  { id: '9', name: 'process_memory_used', title: 'Process Memory Used' },
  { id: '10', name: 'process_gc_time', title: 'Process Garbage Collection Time' },
  { id: '13', name: 'service_requests_by_status_code', title: 'Service Requests by Status Code' },
  { id: '14', name: 'metrics_header', title: 'Metrics Header' },
  { id: '15', name: 'service_details', title: 'Service Details' },
  { id: '16', name: 'service_summary_header', title: 'Service Summary Header' },
  { id: '19', name: 'k8s_workload_cpu_usage', title: 'K8s Workload CPU Usage' },
  { id: '20', name: 'k8s_workload_memory_usage', title: 'K8s Workload Memory Usage' },
  { id: '21', name: 'services_current_status', title: 'Services Current Status' },
  { id: '22', name: 'problems_list', title: 'Problems List' },
  { id: '23', name: 'requests_summary_header', title: 'Requests Summary Header' },
  { id: '24', name: 'request_details', title: 'Request Details' },
];

// --- Cleaned queries for tiles with $ variable references ---

// Tile 15: Service Details - remove all $ variable references 
// (LogQueryPart2, LogErrorsLink, $PGI, $DynatraceTenant, $dt_timeframe_*, Analyze Errors, Smartscape, dt.entity.process_group)
const cleanedTile15 = `timeseries {latency_p50 = median(dt.service.request.response_time),
           latency_p90 = percentile(dt.service.request.response_time, 90),
           latency_p99 = percentile(dt.service.request.response_time, 99),
           requests = sum(dt.service.request.count), 
           errors = sum(dt.service.request.failure_count)},
           by:{dt.entity.service}

| lookup [ timeseries latency_avg = avg(dt.service.request.response_time),
           by:{dt.entity.service}],
            sourceField:dt.entity.service, lookupField:dt.entity.service,
            prefix: "latencyAvg."

| lookup [ timeseries http_5xx = sum(dt.service.request.count,default: 0.0),
           by:{dt.entity.service},
           filter: (http.response.status_code >= 500 and http.response.status_code <= 599)],
            sourceField:dt.entity.service, lookupField:dt.entity.service,
            prefix: "http5xx."

| lookup [ timeseries http_4xx = sum(dt.service.request.count,default: 0.0),
           by:{dt.entity.service},
           filter: (http.response.status_code >= 400 and http.response.status_code <= 499)],
            sourceField:dt.entity.service, lookupField:dt.entity.service,
            prefix: "http4xx."

| lookup [fetch dt.davis.problems, from:now()-7h, to:now()
         | filter event.status=="ACTIVE" and dt.davis.is_duplicate==false
         | expand affected_entity_ids
         | summarize {Problems = countDistinct(display_id),
               event.id = takeFirst(event.id),
               event.kind = takeFirst(event.kind)}, 
               by:{affected_entity_ids}],
  sourceField:dt.entity.service, lookupField:affected_entity_ids, 
  fields:{Problems, affected_entity_ids,event.id,event.kind}    

| fieldsAdd Latency_Avg = arrayAvg(latencyAvg.latency_avg),
            Latency_p50 = arrayAvg(latency_p50),
            Latency_p90 = arrayAvg(latency_p90),
            Latency_p99 = arrayAvg(latency_p99),
            Requests = arraySum(requests), 
            Failures = arraySum(errors),
           \`5xx\` = arraySum(http5xx.http_5xx),
           \`4xx\` = arraySum(http4xx.http_4xx) 
| fieldsAdd FailureRate = (Failures/Requests) *100
| fieldsAdd Service = entityName(dt.entity.service)
| fields Status = if(Problems >= 0 , "PROBLEM",  else: "HEALTHY"),
         Service,
         dt.entity.service,
         StatusSort = if(Problems > 0, 0, else: 1),
         Requests,
         Latency_Avg,
         Latency_p50,
         Latency_p90,
         Latency_p99,
         FailureRate,
         Failures,
        \`5xx\` = if(isNull(\`5xx\`), 0, else:\`5xx\`),
        \`4xx\` = if(isNull(\`4xx\`), 0, else:\`4xx\`),
         event.id,
         event.kind
| sort StatusSort asc
| fieldsRemove StatusSort
| limit 100`;

// Tile 22: Problems List - remove $DynatraceTenant from Description, remove comments, add limit 25
const cleanedTile22 = `fetch dt.davis.problems
| filter \`dt.davis.is_duplicate\` == false
| sort timestamp desc
| expand affected_entity_ids
| lookup [fetch dt.entity.service], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.services"
| lookup [fetch dt.entity.process_group_instance], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.pgi"
| lookup [fetch dt.entity.application], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.applications"
| lookup [fetch dt.entity.mobile_application], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.mobile"
| lookup [fetch dt.entity.custom_application], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.customapplication"
| lookup [fetch dt.entity.cloud_application], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.cloudapplication"
| lookup [fetch dt.entity.synthetic_test], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.synthetictest"
| lookup [fetch dt.entity.http_check], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.httpcheck"
| lookup [fetch dt.entity.multiprotocol_monitor], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.multiprotocolmonitor"
| lookup [fetch dt.entity.kubernetes_cluster], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.kubernetescluster"
| lookup [fetch dt.entity.host], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.hosts"
| lookup [fetch dt.entity.custom_device], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.customdevices"
| lookup [fetch dt.entity.hypervisor], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.hypervisor"
| lookup [fetch dt.entity.environment], sourceField:affected_entity_ids, lookupField: id, prefix:"lookup.affected.entity.environment"
| summarize {startTime = takeFirst(event.start),
            endTime = takeFirst(event.end),
            problemClosedDuration = takeFirst(resolved_problem_duration),
            status = takeFirst(event.status),
            event.name = takeFirst(event.name),
            severityLevel = takeFirst(event.category),
            affected = takeFirst(affected_entity_ids),
            rootCause = takeFirst(root_cause_entity_name),
            dt.davis.is_duplicate = takeFirst(dt.davis.is_duplicate),
            affectedServices = collectDistinct(lookup.affected.entity.servicesentity.name),
            affectedPGI = collectDistinct(lookup.affected.entity.pgientity.name),
            affectedApplications = collectDistinct(lookup.affected.entity.applicationsentity.name),
            affectedMobile = collectDistinct(lookup.affected.entity.mobileentity.name),
            affectedCustomApplication = collectDistinct(lookup.affected.entity.customapplicationentity.name),
            affectedCloudApplication = collectDistinct(lookup.affected.entity.cloudapplicationentity.name),
            affectedSyntheticTest = collectDistinct(lookup.affected.entity.synthetictestentity.name),
            affectedHttpCheck = collectDistinct(lookup.affected.entity.httpcheckentity.name),
            affectedMultiprotocolMonitor = collectDistinct(lookup.affected.entity.multiprotocolmonitorentity.name),
            affectedKubernetesCluster = collectDistinct(lookup.affected.entity.kubernetesclusterentity.name),
            affectedHosts = collectDistinct(lookup.affected.entity.hostsentity.name),
            affectedCustomDevices = collectDistinct(lookup.affected.entity.customdevicesentity.name),
            affectedHypervisor = collectDistinct(lookup.affected.entity.hypervisorentity.name),
            affectedEnvironment = collectDistinct(lookup.affected.entity.environmententity.name),
            event.id = takeFirst(event.id)}, 
            by:{display_id, event.kind}
| fieldsAdd currentTime = toTimestamp(now())
| fieldsAdd Description = concat(display_id," - ",event.name)
| fields Status = status,       
         Description,
         Affected = arrayRemoveNulls(arrayConcat(affectedApplications,affectedMobile,affectedCustomApplication,affectedCloudApplication,affectedSyntheticTest,affectedHttpCheck,affectedServices,affectedPGI,affectedKubernetesCluster,affectedHosts,affectedHypervisor,affectedCustomDevices,affectedEnvironment,affectedMultiprotocolMonitor)),
         RootCause = if(isNotNull(rootCause), rootCause, else:""),
         StartTime = startTime,
         EndTime =  if((status == "ACTIVE"),"In Progress", 
                    else:if((status == "CLOSED"),endTime)),   
         Duration = if((status == "CLOSED"),problemClosedDuration,
                    else:if((status == "ACTIVE"), currentTime-startTime)),
         event.id,
         event.kind
| sort StartTime, direction:"descending"
| sort Status, direction:"ascending"
| limit 25`;

// Tile 24: Request Details - remove $DynatraceTenant, $dt_timeframe references, remove Analyze Errors
const cleanedTile24 = `fetch spans, samplingRatio: 1, scanLimitGBytes: 50
\t
| filter request.is_root_span == true AND isNotNull(endpoint.name) 
\t
\t| fieldsAdd sampling.probability = (power(2, 56) - coalesce(sampling.threshold, 0)) * power(2, -56), 
            sampling.multiplicity = 1/sampling.probability, 
            multiplicity = coalesce(sampling.multiplicity, 1) * coalesce(aggregation.count, 1) * dt.system.sampling_ratio
\t
\t| fieldsAdd request.status_code = if(request.is_failed, "Failure", else: "Success")
\t
| fieldsAdd aggregation.duration_avg = coalesce(aggregation.duration_sum/aggregation.count, duration)
\t| fieldsAdd dt.entity.service.entity.name = entityAttr(dt.entity.service, "entity.name")
| summarize {
\t    dt.entity.service = takeFirst(dt.entity.service),
\t    Latency_Avg = sum(aggregation.duration_avg*multiplicity)/sum(multiplicity),
\t    Latency_p50 = percentile(duration, 50),
\t    Latency_p90 = percentile(duration, 90),
\t    Latency_p99 = percentile(duration, 99),
\t    Requests = sum(\`multiplicity\`),
\t    Failures = sum(if(request.status_code == "Failure", \`multiplicity\`, else: 0)),
\t    FailureRate = round(toDouble(sum(if(request.status_code == "Failure", \`multiplicity\`, else: 0)) / sum(\`multiplicity\`)), decimals: 3),
        \`5xx\` = sum(if(http.response.status_code >= 500 and http.response.status_code <= 599, \`multiplicity\`, else: 0)),
        \`4xx\` = sum(if(http.response.status_code >= 400 and http.response.status_code <= 499, \`multiplicity\`, else: 0))
        }, by: {
\t    dt.entity.service.entity.name,
\t    endpoint.name,
\t    dt.system.sampling_ratio
\t  }
| fieldsAdd Service = entityName(dt.entity.service)
| filter isNotNull(endpoint.name)
| fields Service,
         Request = endpoint.name,
         Requests,         
         Latency_Avg,
         Latency_p50,
         Latency_p90,
         Latency_p99,
         FailureRate = FailureRate * 100,
         Failures,
         \`5xx\`,
         \`4xx\`
| sort Requests desc  
| limit 100`;

// Override map for cleaned queries
const queryOverrides = {
  '15': cleanedTile15,
  '22': cleanedTile22,
  '24': cleanedTile24,
};

function hasLimit(query) {
  return /\|\s*limit\s+\d+/i.test(query);
}

function getQuery(tileId) {
  // Use override if available, otherwise use original from dashboard
  let query = queryOverrides[tileId] || dashboard.tiles[tileId].query;
  
  // If query doesn't have a limit, add limit 25
  if (!hasLimit(query)) {
    query = query.trimEnd() + '\n| limit 25';
  }
  
  return query;
}

function startsWithDataJson(query) {
  return query.trimStart().startsWith('data json:"[]"');
}

// Build the workflow
const tasks = {};
const promptTaskNames = [];
const dqlTaskNames = [];

tileConfig.forEach((tile, index) => {
  const query = getQuery(tile.id);
  const promptName = tile.name + '_prompt';
  const xPos = index - Math.floor(tileConfig.length / 2); // Spread across x-axis

  // DQL Task
  const dqlInput = { query };
  // Add timeframe for queries that don't start with 'data json:"[]"'
  if (!startsWithDataJson(query)) {
    dqlInput.timeframe = { from: "@d-1d", to: "@d" };
  }

  tasks[tile.name] = {
    name: tile.name,
    input: dqlInput,
    action: "dynatrace.automations:execute-dql-query",
    position: { x: xPos, y: 1 },
    description: "Make use of Dynatrace Grail data in your workflow.",
    predecessors: []
  };

  // Dynatrace Intelligence Prompt Task
  tasks[promptName] = {
    name: promptName,
    input: {
      config: "disabled",
      prompt: `Provide a report for the following use case:\n## ${tile.title} Analysis Report\n`,
      autoTrim: true,
      instruction: "Provide a Summary, Insights, Observations and Recommendations.",
      supplementary: `Format examples in tables instead of bulleted lists.\nWhere applicable convert units for readability, e.g. 1000000000 bytes is 1 TiB.\nWhere applicable show relative percentages, e.g. 100 used and 1000 allocatable is 10% utilized.\nUse this analysis:\n{{result("${tile.name}")["records"]}}\n`
    },
    action: "dynatrace.davis.copilot.workflow.actions:davis-copilot",
    position: { x: xPos, y: 2 },
    conditions: {
      states: {
        [tile.name]: "OK"
      }
    },
    description: "Prompt the Dynatrace Intelligence generative AI",
    predecessors: [tile.name]
  };

  dqlTaskNames.push(tile.name);
  promptTaskNames.push(promptName);
});

// Build email content - reference all prompt results 
const emailContent = promptTaskNames.map(name => `{{result("${name}").text}}`).join('\n');

// Build email conditions - all prompts must be OK
const emailConditionStates = {};
promptTaskNames.forEach(name => { emailConditionStates[name] = "OK"; });

// Email Task
tasks['email_dashboard_report'] = {
  name: 'email_dashboard_report',
  input: {
    cc: [],
    to: ["john.kelly@dynatrace.com"],
    bcc: [],
    content: emailContent + '\n',
    subject: "Services Overview Dashboard Analysis Report"
  },
  action: "dynatrace.email:send-email",
  position: { x: 0, y: 3 },
  conditions: {
    else: "SKIP",
    custom: "",
    states: emailConditionStates
  },
  description: "Send email",
  predecessors: promptTaskNames
};

// Build the full workflow
const workflow = {
  title: "Services Overview Report",
  description: "This Workflow generates Services Overview reports and emails to the specified addresses.",
  ownerType: "USER",
  isPrivate: true,
  schemaVersion: 4,
  trigger: {},
  result: null,
  type: "STANDARD",
  input: {},
  hourlyExecutionLimit: 10,
  guide: "# Services Overview Report\nGet a comprehensive view of your Services. This Workflow queries Grail and provides data to Dynatrace Intelligence to get recommendations. These recommendations are then sent to email(s) of your choice.\n\n# Setup\n1. Change emails (`to`, `cc`, `bcc`) to be an array of strings.\n2. Test with a manual Run, by click the `Run` button.\n3. If everything works as expected, change the [Trigger](?trigger=) to a schedule, e.g. Weekly, Daily, etc.\n\n# More advanced interactions\nConsider using our MCP server, [local](https://github.com/dynatrace-oss/dynatrace-mcp) or [remote](https://docs.dynatrace.com/docs/discover-dynatrace/platform/davis-ai/dynatrace-mcp ).",
  tasks
};

// Write output
const outputPath = 'C:/Users/john.kelly/Downloads/Services_Overview_Workflow.json';
fs.writeFileSync(outputPath, JSON.stringify(workflow, null, 2), 'utf8');

console.log(`Workflow generated: ${outputPath}`);
console.log(`Total tiles processed: ${tileConfig.length}`);
console.log(`DQL tasks: ${dqlTaskNames.length}`);
console.log(`Prompt tasks: ${promptTaskNames.length}`);
console.log(`Email task: 1`);
console.log(`Total tasks: ${Object.keys(tasks).length}`);
