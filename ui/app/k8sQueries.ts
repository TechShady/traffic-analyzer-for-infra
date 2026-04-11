/**
 * DQL queries for the Kubernetes SRE dashboard page.
 * All queries accept optional cluster and namespace filters.
 */

function clusterFilter(clusters: string[]): string {
  if (clusters.length === 0) return "";
  const vals = clusters.map((c) => `"${c}"`).join(", ");
  return ` | filter in(k8s.cluster.name, array(${vals}))`;
}

function namespaceFilter(namespaces: string[]): string {
  if (namespaces.length === 0) return "";
  const vals = namespaces.map((n) => `"${n}"`).join(", ");
  return ` | filter in(k8s.namespace.name, array(${vals}))`;
}

// --- Variable queries ---

export function clusterListQuery(): string {
  return `fetch dt.entity.kubernetes_cluster, from: now()-24h | fields k8s.cluster.name = entity.name | sort k8s.cluster.name asc`;
}

export function namespaceListQuery(): string {
  return `fetch dt.entity.cloud_application_namespace, from: now()-24h | fields k8s.namespace.name = entity.name | dedup k8s.namespace.name | sort k8s.namespace.name asc`;
}

// --- KPI single-value queries ---

export function totalClustersQuery(): string {
  return `fetch dt.entity.kubernetes_cluster, from: now()-24h | summarize cluster_count = count()`;
}

export function totalNodesQuery(clusters: string[]): string {
  return `fetch dt.entity.kubernetes_node, from: now()-24h | summarize node_count = count()`;
}

export function totalPodsQuery(clusters: string[], namespaces: string[]): string {
  return `fetch dt.entity.cloud_application, from: now()-24h | summarize pod_count = count()`;
}

export function totalRestartsQuery(clusters: string[]): string {
  return `timeseries restarts = sum(dt.kubernetes.container.restarts), by: {k8s.cluster.name}, from: now()-24h | fieldsAdd total = arraySum(restarts) | summarize total_restarts = sum(total)`;
}

export function totalOomKillsQuery(clusters: string[]): string {
  return `timeseries oom = sum(dt.kubernetes.container.oom_kills), by: {k8s.cluster.name}, from: now()-24h | fieldsAdd total = arraySum(oom) | summarize total_oom_kills = sum(total)`;
}

// --- Timeseries chart queries ---

export function cpuUsageByClusterQuery(clusters: string[]): string {
  return `timeseries cpu = avg(dt.kubernetes.container.cpu_usage), by: {k8s.cluster.name}, from: now()-24h${clusterFilter(clusters)}`;
}

export function memoryUsageByClusterQuery(clusters: string[]): string {
  return `timeseries mem = avg(dt.kubernetes.container.memory_working_set), by: {k8s.cluster.name}, from: now()-24h${clusterFilter(clusters)}`;
}

export function restartsByClusterQuery(clusters: string[]): string {
  return `timeseries restarts = sum(dt.kubernetes.container.restarts), by: {k8s.cluster.name}, from: now()-24h${clusterFilter(clusters)}`;
}

export function oomByClusterQuery(clusters: string[]): string {
  return `timeseries oom = sum(dt.kubernetes.container.oom_kills), by: {k8s.cluster.name}, from: now()-24h${clusterFilter(clusters)}`;
}

export function cpuThrottlingTrendQuery(clusters: string[]): string {
  return `timeseries throttled = avg(dt.kubernetes.container.cpu_throttled), by: {k8s.cluster.name}, from: now()-24h${clusterFilter(clusters)}`;
}

export function errorLogTrendQuery(clusters: string[]): string {
  return `fetch logs, from: now()-24h | filter isNotNull(k8s.namespace.name) and loglevel == "ERROR"${clusterFilter(clusters)} | makeTimeseries error_count = count(), by: {k8s.cluster.name}`;
}

// --- Table queries ---

export function degradedDeploymentsQuery(clusters: string[], namespaces: string[]): string {
  return `timeseries {desired = avg(dt.kubernetes.workload.pods_desired), actual = avg(dt.kubernetes.pods)}, by: {k8s.workload.name, k8s.namespace.name, k8s.cluster.name}, from: now()-24h${clusterFilter(clusters)}${namespaceFilter(namespaces)} | fieldsAdd desired_avg = arrayAvg(desired), actual_avg = arrayAvg(actual) | filter desired_avg > 0 and actual_avg < desired_avg | fields k8s.cluster.name, k8s.namespace.name, k8s.workload.name, desired = desired_avg, ready = actual_avg | sort k8s.cluster.name asc`;
}

export function stuckRolloutsQuery(clusters: string[], namespaces: string[]): string {
  return `fetch dt.davis.events, from: now()-24h | filter isNotNull(k8s.workload.name) and contains(event.name, "deadline exceeded", caseSensitive: false)${clusterFilter(clusters)}${namespaceFilter(namespaces)} | summarize cond_message = takeFirst(event.name), by: {k8s.cluster.name, k8s.namespace.name, k8s.workload.name}`;
}

export function podsNotRunningQuery(clusters: string[], namespaces: string[]): string {
  return `fetch dt.davis.events, from: now()-24h | filter isNotNull(k8s.pod.name) and (contains(event.name, "crash") or contains(event.name, "failed") or contains(event.name, "not ready") or contains(event.name, "OOMKilled") or contains(event.name, "BackOff"))${clusterFilter(clusters)}${namespaceFilter(namespaces)} | summarize event_count = count(), phase = takeFirst(event.name), by: {k8s.cluster.name, k8s.namespace.name, k8s.pod.name} | sort event_count desc`;
}

export function topRestartingPodsQuery(clusters: string[], namespaces: string[]): string {
  return `timeseries restarts = sum(dt.kubernetes.container.restarts), by: {k8s.pod.name, k8s.namespace.name, k8s.cluster.name}, from: now()-24h${clusterFilter(clusters)}${namespaceFilter(namespaces)} | fieldsAdd total_restarts = arraySum(restarts) | filter total_restarts > 0 | sort total_restarts desc | fields k8s.cluster.name, k8s.namespace.name, k8s.pod.name, total_restarts | limit 20`;
}

export function unhealthyNodesQuery(clusters: string[]): string {
  return `fetch dt.davis.events, from: now()-24h | filter isNotNull(k8s.node.name) and (contains(event.name, "not ready") or contains(event.name, "pressure") or contains(event.name, "condition"))${clusterFilter(clusters)} | summarize event_count = count(), message = takeFirst(event.name), by: {k8s.cluster.name, k8s.node.name} | sort event_count desc`;
}

export function nodeCountByClusterQuery(clusters: string[]): string {
  return `timeseries x = avg(dt.kubernetes.pods), by: {k8s.node.name, k8s.cluster.name}, from: now()-24h${clusterFilter(clusters)} | summarize node_count = countDistinct(k8s.node.name), by: {k8s.cluster.name} | sort node_count desc`;
}

export function cpuThrottledContainersQuery(clusters: string[], namespaces: string[]): string {
  return `timeseries { throttled = avg(dt.kubernetes.container.cpu_throttled), limit_cpu = avg(dt.kubernetes.container.limits_cpu), usage = avg(dt.kubernetes.container.cpu_usage) }, by: {k8s.pod.name, k8s.namespace.name, k8s.cluster.name}, from: now()-24h${clusterFilter(clusters)}${namespaceFilter(namespaces)} | fieldsAdd throttle_pct = if(arrayAvg(limit_cpu) > 0, (arrayAvg(throttled) / arrayAvg(limit_cpu)) * 100, else: 0) | filter throttle_pct > 25 | sort throttle_pct desc | fields k8s.cluster.name, k8s.namespace.name, k8s.pod.name, throttle_pct | limit 20`;
}

export function errorLogsByNamespaceQuery(clusters: string[], namespaces: string[]): string {
  return `fetch logs, from: now()-24h | filter isNotNull(k8s.namespace.name) and loglevel == "ERROR"${clusterFilter(clusters)}${namespaceFilter(namespaces)} | summarize error_count = count(), by: {k8s.cluster.name, k8s.namespace.name} | sort error_count desc | limit 20`;
}

export function podsByClusterQuery(clusters: string[]): string {
  return `timeseries x = avg(dt.kubernetes.container.cpu_usage), by: {k8s.pod.name, k8s.cluster.name}, from: now()-24h${clusterFilter(clusters)} | summarize pod_count = countDistinct(k8s.pod.name), by: {k8s.cluster.name} | sort pod_count desc`;
}

export function workloadsByTypeQuery(clusters: string[]): string {
  return `timeseries x = avg(dt.kubernetes.container.cpu_usage), by: {k8s.workload.name, k8s.workload.kind}, from: now()-24h${clusterFilter(clusters)} | summarize workload_count = countDistinct(k8s.workload.name), by: {k8s.workload.kind} | sort workload_count desc`;
}

export function namespacesByClusterQuery(clusters: string[]): string {
  return `timeseries x = avg(dt.kubernetes.container.cpu_usage), by: {k8s.namespace.name, k8s.cluster.name}, from: now()-24h${clusterFilter(clusters)} | summarize ns_count = countDistinct(k8s.namespace.name), by: {k8s.cluster.name} | sort ns_count desc`;
}
