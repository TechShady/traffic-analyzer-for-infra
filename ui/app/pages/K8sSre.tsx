import React, { useState, useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Strong, Text } from "@dynatrace/strato-components/typography";
import { TimeseriesChart, convertToTimeseries } from "@dynatrace/strato-components-preview/charts";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import { Select } from "@dynatrace/strato-components-preview/forms";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import { useDql } from "@dynatrace-sdk/react-hooks";
import {
  clusterListQuery,
  namespaceListQuery,
  totalClustersQuery,
  totalNodesQuery,
  totalPodsQuery,
  totalRestartsQuery,
  totalOomKillsQuery,
  cpuUsageByClusterQuery,
  memoryUsageByClusterQuery,
  restartsByClusterQuery,
  oomByClusterQuery,
  cpuThrottlingTrendQuery,
  errorLogTrendQuery,
  degradedDeploymentsQuery,
  stuckRolloutsQuery,
  podsNotRunningQuery,
  topRestartingPodsQuery,
  unhealthyNodesQuery,
  nodeCountByClusterQuery,
  cpuThrottledContainersQuery,
  errorLogsByNamespaceQuery,
  podsByClusterQuery,
  workloadsByTypeQuery,
  namespacesByClusterQuery,
} from "../k8sQueries";

/* ── helpers ────────────────────────────────────────────── */

function SectionHeader({ title }: { title: string }) {
  return (
    <Surface style={{ padding: "8px 16px", background: "var(--dt-colors-charts-categorical-color-01-default, #134fc9)", borderRadius: 4 }}>
      <Heading level={5} style={{ color: "#fff", margin: 0 }}>{title}</Heading>
    </Surface>
  );
}

function KpiCard({ label, value, isLoading, error }: { label: string; value: string | number; isLoading?: boolean; error?: unknown }) {
  return (
    <Surface style={{ padding: 16, borderRadius: 8, flex: "1 1 160px", minWidth: 140, textAlign: "center" }}>
      <Flex flexDirection="column" alignItems="center" gap={4}>
        <Text style={{ fontSize: 12, opacity: 0.7 }}>{label}</Text>
        {isLoading ? <ProgressCircle /> : error ? <Text style={{ color: "red" }}>Error</Text> : <Heading level={3}>{value}</Heading>}
      </Flex>
    </Surface>
  );
}

function Loading() {
  return (
    <Flex justifyContent="center" padding={32}>
      <ProgressCircle />
    </Flex>
  );
}

function extractScalar(records: Array<Record<string, unknown>> | null | undefined, field: string): number | string {
  if (!records || records.length === 0) return "-";
  const v = records[0][field];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return isNaN(n) ? v : n;
  }
  if (typeof v === "bigint") return Number(v);
  if (v === null || v === undefined) return "-";
  return String(v);
}

/* ── main component ──────────────────────────────────────── */

export const K8sSre = () => {
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>([]);

  // Variable queries
  const clusterList = useDql({ query: clusterListQuery() });
  const namespaceList = useDql({ query: namespaceListQuery() });

  const clusterOptions = useMemo(() => {
    if (!clusterList.data?.records) return [];
    return clusterList.data.records
      .map((r) => r["k8s.cluster.name"])
      .filter((v): v is string => typeof v === "string");
  }, [clusterList.data]);

  const namespaceOptions = useMemo(() => {
    if (!namespaceList.data?.records) return [];
    return namespaceList.data.records
      .map((r) => r["k8s.namespace.name"])
      .filter((v): v is string => typeof v === "string");
  }, [namespaceList.data]);

  const clusters = selectedClusters;
  const namespaces = selectedNamespaces;

  /* ── KPI queries (always show global totals, no filters) ── */
  const totalClusters = useDql({ query: totalClustersQuery() });
  const totalNodes = useDql({ query: totalNodesQuery([]) });
  const totalPods = useDql({ query: totalPodsQuery([], []) });
  const totalRestarts = useDql({ query: totalRestartsQuery([]) });
  const totalOom = useDql({ query: totalOomKillsQuery([]) });

  /* ── Timeseries queries ── */
  const cpuUsage = useDql({ query: cpuUsageByClusterQuery(clusters) });
  const memUsage = useDql({ query: memoryUsageByClusterQuery(clusters) });
  const restarts = useDql({ query: restartsByClusterQuery(clusters) });
  const oomKills = useDql({ query: oomByClusterQuery(clusters) });
  const cpuThrottleTrend = useDql({ query: cpuThrottlingTrendQuery(clusters) });
  const errorTrend = useDql({ query: errorLogTrendQuery(clusters) });

  /* ── Table queries ── */
  const degraded = useDql({ query: degradedDeploymentsQuery(clusters, namespaces) });
  const stuck = useDql({ query: stuckRolloutsQuery(clusters, namespaces) });
  const podsNotRunning = useDql({ query: podsNotRunningQuery(clusters, namespaces) });
  const topRestarting = useDql({ query: topRestartingPodsQuery(clusters, namespaces) });
  const unhealthyNodes = useDql({ query: unhealthyNodesQuery(clusters) });
  const nodeCount = useDql({ query: nodeCountByClusterQuery(clusters) });
  const cpuThrottled = useDql({ query: cpuThrottledContainersQuery(clusters, namespaces) });
  const errorLogs = useDql({ query: errorLogsByNamespaceQuery(clusters, namespaces) });
  const podsByCluster = useDql({ query: podsByClusterQuery(clusters) });
  const workloadsByType = useDql({ query: workloadsByTypeQuery(clusters) });
  const nsByCluster = useDql({ query: namespacesByClusterQuery(clusters) });

  /* ── helpers for timeseries ── */
  const toTs = (data: typeof cpuUsage.data) =>
    data?.records ? convertToTimeseries(data.records, data.types) : [];

  return (
    <Flex flexDirection="column" padding={16} gap={16}>
      {/* Header with logo */}
      <Flex alignItems="center" gap={16}>
        <img
          src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Dollar_General_logo.svg/200px-Dollar_General_logo.svg.png"
          alt="Dollar General"
          height={48}
        />
        <Heading level={2}>Kubernetes SRE Dashboard</Heading>
      </Flex>

      {/* Filters */}
      <Flex gap={16} alignItems="flex-end" flexWrap="wrap">
        <Flex flexDirection="column" gap={4} style={{ minWidth: 300 }}>
          <Strong>Cluster</Strong>
          <Select<string, true>
            multiple
            value={selectedClusters}
            onChange={(val) => setSelectedClusters(val ?? [])}
          >
            <Select.Content>
              {clusterOptions.map((c) => (
                <Select.Option key={c} value={c}>{c}</Select.Option>
              ))}
            </Select.Content>
          </Select>
        </Flex>
        <Flex flexDirection="column" gap={4} style={{ minWidth: 300 }}>
          <Strong>Namespace</Strong>
          <Select<string, true>
            multiple
            value={selectedNamespaces}
            onChange={(val) => setSelectedNamespaces(val ?? [])}
          >
            <Select.Content>
              {namespaceOptions.map((n) => (
                <Select.Option key={n} value={n}>{n}</Select.Option>
              ))}
            </Select.Content>
          </Select>
        </Flex>
      </Flex>

      {/* KPI Cards */}
      <Flex gap={8} flexWrap="wrap">
        <KpiCard label="Total Clusters" value={extractScalar(totalClusters.data?.records, "cluster_count")} isLoading={totalClusters.isLoading} error={totalClusters.error} />
        <KpiCard label="Total Nodes" value={extractScalar(totalNodes.data?.records, "node_count")} isLoading={totalNodes.isLoading} error={totalNodes.error} />
        <KpiCard label="Total Pods" value={extractScalar(totalPods.data?.records, "pod_count")} isLoading={totalPods.isLoading} error={totalPods.error} />
        <KpiCard label="Container Restarts" value={extractScalar(totalRestarts.data?.records, "total_restarts")} isLoading={totalRestarts.isLoading} error={totalRestarts.error} />
        <KpiCard label="OOM Kills" value={extractScalar(totalOom.data?.records, "total_oom_kills")} isLoading={totalOom.isLoading} error={totalOom.error} />
      </Flex>

      {/* ── Cluster Resource Utilization ── */}
      <SectionHeader title="Cluster Resource Utilization" />
      <Flex gap={16} flexWrap="wrap">
        <Flex flexDirection="column" style={{ flex: "1 1 400px" }}>
          <Heading level={6}>CPU Usage by Cluster</Heading>
          {cpuUsage.isLoading ? <Loading /> : cpuUsage.data?.records && (
            <TimeseriesChart data={toTs(cpuUsage.data)} variant="area" gapPolicy="connect">
              <TimeseriesChart.YAxis label="CPU" />
            </TimeseriesChart>
          )}
        </Flex>
        <Flex flexDirection="column" style={{ flex: "1 1 400px" }}>
          <Heading level={6}>Memory Usage by Cluster</Heading>
          {memUsage.isLoading ? <Loading /> : memUsage.data?.records && (
            <TimeseriesChart data={toTs(memUsage.data)} variant="area" gapPolicy="connect">
              <TimeseriesChart.YAxis label="Memory" />
            </TimeseriesChart>
          )}
        </Flex>
      </Flex>

      {/* ── Container Health ── */}
      <SectionHeader title="Container Health" />
      <Flex gap={16} flexWrap="wrap">
        <Flex flexDirection="column" style={{ flex: "1 1 400px" }}>
          <Heading level={6}>Container Restarts by Cluster</Heading>
          {restarts.isLoading ? <Loading /> : restarts.data?.records && (
            <TimeseriesChart data={toTs(restarts.data)} variant="bar" gapPolicy="connect">
              <TimeseriesChart.YAxis label="Restarts" />
            </TimeseriesChart>
          )}
        </Flex>
        <Flex flexDirection="column" style={{ flex: "1 1 400px" }}>
          <Heading level={6}>OOM Kills by Cluster</Heading>
          {oomKills.isLoading ? <Loading /> : oomKills.data?.records && (
            <TimeseriesChart data={toTs(oomKills.data)} variant="bar" gapPolicy="connect">
              <TimeseriesChart.YAxis label="OOM Kills" />
            </TimeseriesChart>
          )}
        </Flex>
      </Flex>

      {/* ── Workload Health ── */}
      <SectionHeader title="Workload Health" />
      <Flex gap={16} flexWrap="wrap">
        <Flex flexDirection="column" style={{ flex: "1 1 400px" }}>
          <Heading level={6}>Degraded Deployments (Ready &lt; Desired)</Heading>
          {degraded.isLoading ? <Loading /> : (
            <DataTable
              data={degraded.data?.records ?? []}
              columns={[
                { id: "cluster", header: "Cluster", accessor: "k8s.cluster.name" },
                { id: "ns", header: "Namespace", accessor: "k8s.namespace.name" },
                { id: "wl", header: "Workload", accessor: "k8s.workload.name" },
                { id: "desired", header: "Desired", accessor: "desired" },
                { id: "ready", header: "Actual", accessor: "ready" },
              ]}
              sortable
            >
              <DataTable.Pagination defaultPageSize={10} />
            </DataTable>
          )}
        </Flex>
        <Flex flexDirection="column" style={{ flex: "1 1 400px" }}>
          <Heading level={6}>Stuck Rollouts (ProgressDeadlineExceeded)</Heading>
          {stuck.isLoading ? <Loading /> : (
            <DataTable
              data={stuck.data?.records ?? []}
              columns={[
                { id: "cluster", header: "Cluster", accessor: "k8s.cluster.name" },
                { id: "ns", header: "Namespace", accessor: "k8s.namespace.name" },
                { id: "wl", header: "Workload", accessor: "k8s.workload.name" },
                { id: "msg", header: "Message", accessor: "cond_message" },
              ]}
              sortable
            >
              <DataTable.Pagination defaultPageSize={10} />
            </DataTable>
          )}
        </Flex>
      </Flex>

      {/* ── Pod Issues ── */}
      <SectionHeader title="Pod Issues" />
      <Flex gap={16} flexWrap="wrap">
        <Flex flexDirection="column" style={{ flex: "1 1 400px" }}>
          <Heading level={6}>Pods Not Running</Heading>
          {podsNotRunning.isLoading ? <Loading /> : (
            <DataTable
              data={podsNotRunning.data?.records ?? []}
              columns={[
                { id: "cluster", header: "Cluster", accessor: "k8s.cluster.name" },
                { id: "ns", header: "Namespace", accessor: "k8s.namespace.name" },
                { id: "pod", header: "Pod", accessor: "k8s.pod.name" },
                { id: "phase", header: "Phase", accessor: "phase" },
              ]}
              sortable
            >
              <DataTable.Pagination defaultPageSize={10} />
            </DataTable>
          )}
        </Flex>
        <Flex flexDirection="column" style={{ flex: "1 1 400px" }}>
          <Heading level={6}>Top Restarting Pods</Heading>
          {topRestarting.isLoading ? <Loading /> : (
            <DataTable
              data={topRestarting.data?.records ?? []}
              columns={[
                { id: "cluster", header: "Cluster", accessor: "k8s.cluster.name" },
                { id: "ns", header: "Namespace", accessor: "k8s.namespace.name" },
                { id: "pod", header: "Pod", accessor: "k8s.pod.name" },
                { id: "restarts", header: "Restarts", accessor: "total_restarts" },
              ]}
              sortable
            >
              <DataTable.Pagination defaultPageSize={10} />
            </DataTable>
          )}
        </Flex>
      </Flex>

      {/* ── Node Health ── */}
      <SectionHeader title="Node Health" />
      <Flex gap={16} flexWrap="wrap">
        <Flex flexDirection="column" style={{ flex: "1 1 400px" }}>
          <Heading level={6}>Unhealthy Nodes</Heading>
          {unhealthyNodes.isLoading ? <Loading /> : (
            <DataTable
              data={unhealthyNodes.data?.records ?? []}
              columns={[
                { id: "cluster", header: "Cluster", accessor: "k8s.cluster.name" },
                { id: "node", header: "Node", accessor: "k8s.node.name" },
                { id: "msg", header: "Condition", accessor: "message" },
                { id: "count", header: "Events", accessor: "event_count" },
              ]}
              sortable
            >
              <DataTable.Pagination defaultPageSize={10} />
            </DataTable>
          )}
        </Flex>
        <Flex flexDirection="column" style={{ flex: "1 1 400px" }}>
          <Heading level={6}>Node Count by Cluster</Heading>
          {nodeCount.isLoading ? <Loading /> : (
            <DataTable
              data={nodeCount.data?.records ?? []}
              columns={[
                { id: "cluster", header: "Cluster", accessor: "k8s.cluster.name" },
                { id: "count", header: "Nodes", accessor: "node_count" },
              ]}
              sortable
            >
              <DataTable.Pagination defaultPageSize={10} />
            </DataTable>
          )}
        </Flex>
      </Flex>

      {/* ── CPU Throttling ── */}
      <SectionHeader title="CPU Throttling" />
      <Flex gap={16} flexWrap="wrap">
        <Flex flexDirection="column" style={{ flex: "1 1 400px" }}>
          <Heading level={6}>CPU Throttled Containers (&gt;25%)</Heading>
          {cpuThrottled.isLoading ? <Loading /> : (
            <DataTable
              data={cpuThrottled.data?.records ?? []}
              columns={[
                { id: "cluster", header: "Cluster", accessor: "k8s.cluster.name" },
                { id: "ns", header: "Namespace", accessor: "k8s.namespace.name" },
                { id: "pod", header: "Pod", accessor: "k8s.pod.name" },
                { id: "pct", header: "Throttle %", accessor: "throttle_pct" },
              ]}
              sortable
            >
              <DataTable.Pagination defaultPageSize={10} />
            </DataTable>
          )}
        </Flex>
        <Flex flexDirection="column" style={{ flex: "1 1 400px" }}>
          <Heading level={6}>CPU Throttling Trend</Heading>
          {cpuThrottleTrend.isLoading ? <Loading /> : cpuThrottleTrend.data?.records && (
            <TimeseriesChart data={toTs(cpuThrottleTrend.data)} variant="line" gapPolicy="connect">
              <TimeseriesChart.YAxis label="Throttled" />
            </TimeseriesChart>
          )}
        </Flex>
      </Flex>

      {/* ── Kubernetes Error Logs ── */}
      <SectionHeader title="Kubernetes Error Logs" />
      <Flex gap={16} flexWrap="wrap">
        <Flex flexDirection="column" style={{ flex: "1 1 400px" }}>
          <Heading level={6}>Error Logs by Namespace</Heading>
          {errorLogs.isLoading ? <Loading /> : (
            <DataTable
              data={errorLogs.data?.records ?? []}
              columns={[
                { id: "cluster", header: "Cluster", accessor: "k8s.cluster.name" },
                { id: "ns", header: "Namespace", accessor: "k8s.namespace.name" },
                { id: "count", header: "Error Count", accessor: "error_count" },
              ]}
              sortable
            >
              <DataTable.Pagination defaultPageSize={10} />
            </DataTable>
          )}
        </Flex>
        <Flex flexDirection="column" style={{ flex: "1 1 400px" }}>
          <Heading level={6}>Error Log Trend</Heading>
          {errorTrend.isLoading ? <Loading /> : errorTrend.data?.records && (
            <TimeseriesChart data={toTs(errorTrend.data)} variant="area" gapPolicy="connect">
              <TimeseriesChart.YAxis label="Errors" />
            </TimeseriesChart>
          )}
        </Flex>
      </Flex>

      {/* ── Cluster Inventory ── */}
      <SectionHeader title="Cluster Inventory" />
      <Flex gap={16} flexWrap="wrap">
        <Flex flexDirection="column" style={{ flex: "1 1 280px" }}>
          <Heading level={6}>Pods by Cluster</Heading>
          {podsByCluster.isLoading ? <Loading /> : (
            <DataTable
              data={podsByCluster.data?.records ?? []}
              columns={[
                { id: "cluster", header: "Cluster", accessor: "k8s.cluster.name" },
                { id: "pods", header: "Pods", accessor: "pod_count" },
              ]}
              sortable
            >
              <DataTable.Pagination defaultPageSize={10} />
            </DataTable>
          )}
        </Flex>
        <Flex flexDirection="column" style={{ flex: "1 1 280px" }}>
          <Heading level={6}>Workloads by Type</Heading>
          {workloadsByType.isLoading ? <Loading /> : (
            <DataTable
              data={workloadsByType.data?.records ?? []}
              columns={[
                { id: "kind", header: "Workload Kind", accessor: "k8s.workload.kind" },
                { id: "count", header: "Count", accessor: "workload_count" },
              ]}
              sortable
            />
          )}
        </Flex>
        <Flex flexDirection="column" style={{ flex: "1 1 280px" }}>
          <Heading level={6}>Namespaces per Cluster</Heading>
          {nsByCluster.isLoading ? <Loading /> : (
            <DataTable
              data={nsByCluster.data?.records ?? []}
              columns={[
                { id: "cluster", header: "Cluster", accessor: "k8s.cluster.name" },
                { id: "ns", header: "Namespaces", accessor: "ns_count" },
              ]}
              sortable
            >
              <DataTable.Pagination defaultPageSize={10} />
            </DataTable>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
};
