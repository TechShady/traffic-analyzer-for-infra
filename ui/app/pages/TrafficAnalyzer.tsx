import React, { useState, useMemo } from "react";
import "./TrafficAnalyzer.css";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Strong } from "@dynatrace/strato-components/typography";
import { SingleValue } from "@dynatrace/strato-components/charts";
import { CategoricalBarChart } from "@dynatrace/strato-components-preview/charts";
import { GaugeChart } from "@dynatrace/strato-components-preview/charts";
import { Select } from "@dynatrace/strato-components-preview/forms";
import { NumberInput } from "@dynatrace/strato-components/forms";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import { Tabs, Tab } from "@dynatrace/strato-components/navigation";
import { Modal } from "@dynatrace/strato-components/overlays";
import { Button } from "@dynatrace/strato-components/buttons";
import { SettingIcon, HelpIcon } from "@dynatrace/strato-icons";
import { useDql } from "@dynatrace-sdk/react-hooks";
import {
  hostListQuery,
  hostGroupListQuery,
  hostsForGroupQuery,
  metricsQuery,
  cpuByHostQuery,
  memoryByHostQuery,
  diskByHostQuery,
  analyticsQuery,
  parseMetrics,
  parseAnalytics,
  forecast,
  forecastForHost,
} from "../queries";
import type { MetricsData, AnalyticsData } from "../queries";

const TRAFFIC_CHANGE_OPTIONS = [
  0, 1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75,
  80, 85, 90, 95, 100, 110, 120, 130, 140, 147, 150, 200, 250, 300, 350, 400,
  450, 500, 600, 700, 800, 900, 1000, 2000, 3000, 4000, 5000,
];

const DEFAULT_PROVISION_GOAL = 80;
const DEFAULT_TOP_N = 100;

const TIMEFRAME_OPTIONS = [
  { label: "1 day", value: 1 },
  { label: "2 days", value: 2 },
  { label: "3 days", value: 3 },
  { label: "5 days", value: 5 },
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
  { label: "60 days", value: 60 },
  { label: "90 days", value: 90 },
  { label: "180 days", value: 180 },
  { label: "365 days", value: 365 },
];

function getResourceColor(value: number): string {
  if (value >= 90) return "#F8312F";
  if (value >= 80) return "#FCD53F";
  return "#00D26A";
}

function getChangeColor(value: number): string {
  if (value <= 0) return "#00D26A";
  if (value >= 5) return "#F8312F";
  return "#FCD53F";
}

function getProvisioningColor(value: number): string {
  if (value < -5 || value >= 5) return "#F8312F";
  return "#00D26A";
}

function getPccColor(value: number): string {
  if (value >= 0.5) return "#00D26A";
  if (value >= 0.3) return "#FCD53F";
  return "#F8312F";
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ padding: "10px 20px", background: "linear-gradient(135deg, #0d3fb8 0%, #134fc9 50%, #1a6bef 100%)", borderRadius: 8, boxShadow: "0 2px 12px rgba(19, 79, 201, 0.35)" }}>
      <Heading level={5} style={{ color: "#fff", margin: 0, letterSpacing: 0.5 }}>{title}</Heading>
    </div>
  );
}

function SubHeader({ title }: { title: string }) {
  return (
    <div style={{ padding: "6px 14px", background: "linear-gradient(135deg, #0d3fb8 0%, #134fc9 100%)", borderRadius: 6, boxShadow: "0 1px 8px rgba(19, 79, 201, 0.25)" }}>
      <Strong style={{ color: "#fff", letterSpacing: 0.3 }}>{title}</Strong>
    </div>
  );
}

const TILE_BORDER = "1px solid rgba(99, 130, 191, 0.25)";
const TILE_SHADOW = "0 2px 8px rgba(0, 0, 0, 0.2), 0 0 1px rgba(99, 130, 191, 0.2)";
const TILE_BG = "linear-gradient(145deg, rgba(30, 35, 55, 0.6) 0%, rgba(22, 26, 42, 0.8) 100%)";

function MetricCard({ label, value, unit, color, bordered, style: extraStyle }: { label: string; value: number; unit?: string; color: string; bordered?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{ flex: "1 1 180px", minWidth: 160, maxWidth: 280, width: 200, height: 80, textAlign: "center", ...(bordered ? { border: TILE_BORDER, borderRadius: 10, padding: 4, background: TILE_BG, boxShadow: TILE_SHADOW, transition: "box-shadow 0.2s ease, transform 0.2s ease" } : {}), ...extraStyle }}>
      <SingleValue data={round(value)} label={label} unit={unit} color={color} />
    </div>
  );
}

function ArrowRight() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: 120, flex: "0 0 120px" }}>
      <svg width="120" height="80" viewBox="0 0 120 80" fill="none" style={{ filter: "drop-shadow(0 0 6px rgba(19, 79, 201, 0.5))" }}>
        <defs>
          <linearGradient id="arrowGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4589FF" />
            <stop offset="100%" stopColor="#134FC9" />
          </linearGradient>
        </defs>
        <path d="M5 40h90M80 10l30 30-30 30" stroke="url(#arrowGrad)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// Threshold factory functions - use custom comparator for yellow ranges
function resourceThresholds(key: string): any[] {
  return [
    { comparator: "greater-than-or-equal-to" as const, value: 90, backgroundColor: "#F8312F", color: "#000" },
    { comparator: ((row: any) => { const v = row[key]; return v >= 80 && v < 90; }), backgroundColor: "#FCD53F", color: "#000" },
    { comparator: "less-than" as const, value: 80, backgroundColor: "#00D26A", color: "#000" },
  ];
}

const PROVISIONING_THRESHOLDS = [
  { comparator: "less-than" as const, value: 0, backgroundColor: "#F8312F", color: "#000" },
  { comparator: "greater-than-or-equal-to" as const, value: 0, backgroundColor: "#00D26A", color: "#000" },
];

function pccThresholds(key: string): any[] {
  return [
    { comparator: "greater-than-or-equal-to" as const, value: 0.5, backgroundColor: "#00D26A", color: "#000" },
    { comparator: ((row: any) => { const v = row[key]; return v >= 0.3 && v < 0.5; }), backgroundColor: "#FCD53F", color: "#000" },
    { comparator: "less-than" as const, value: 0.3, backgroundColor: "#F8312F", color: "#000" },
  ];
}

function LoadingState() {
  return (
    <Flex justifyContent="center" padding={32}>
      <ProgressCircle />
    </Flex>
  );
}

export const TrafficAnalyzer = () => {
  const [selectedHosts, setSelectedHosts] = useState<string[]>([]);
  const [selectedHostGroups, setSelectedHostGroups] = useState<string[]>([]);
  const [trafficChangePercent, setTrafficChangePercent] = useState<number>(0);
  const [topN, setTopN] = useState<number>(DEFAULT_TOP_N);
  const [timeframeDays, setTimeframeDays] = useState<number>(7);
  const [provisionGoal, setProvisionGoal] = useState<number>(DEFAULT_PROVISION_GOAL);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tempTopN, setTempTopN] = useState<number>(DEFAULT_TOP_N);
  const [tempProvisionGoal, setTempProvisionGoal] = useState<number>(DEFAULT_PROVISION_GOAL);

  // Fetch host group list
  const hostGroupList = useDql({ query: hostGroupListQuery() });
  const hostGroupOptions: string[] = useMemo(() => {
    if (!hostGroupList.data?.records) return [];
    const rec = hostGroupList.data.records[0];
    if (!rec) return [];
    const arr = rec["distinctGroupNames"];
    return Array.isArray(arr) ? arr.filter((g): g is string => typeof g === "string") : [];
  }, [hostGroupList.data]);

  // Fetch host list - filtered by host group if selected
  const hostList = useDql({ query: selectedHostGroups.length > 0 ? hostsForGroupQuery(selectedHostGroups) : hostListQuery() });
  const hostOptions: string[] = useMemo(() => {
    if (!hostList.data?.records) return [];
    const rec = hostList.data.records[0];
    if (!rec) return [];
    const arr = rec["distinctHostNames"];
    return Array.isArray(arr) ? arr.filter((h): h is string => typeof h === "string") : [];
  }, [hostList.data]);

  // Clear selected hosts that are no longer in the filtered list
  const validSelectedHosts = useMemo(() => {
    if (selectedHosts.length === 0) return [];
    return selectedHosts.filter((h) => hostOptions.includes(h));
  }, [selectedHosts, hostOptions]);

  const activeHosts = validSelectedHosts.length > 0 ? validSelectedHosts : hostOptions;

  // Single metrics query (replaces separate CPU/Memory/Disk queries)
  const metricsResult = useDql({ query: metricsQuery(activeHosts, timeframeDays) });

  // Table queries with per-host PCC
  const cpuByHost = useDql({ query: cpuByHostQuery(activeHosts, topN, timeframeDays) });
  const memByHost = useDql({ query: memoryByHostQuery(activeHosts, topN, timeframeDays) });
  const diskByHost = useDql({ query: diskByHostQuery(activeHosts, topN, timeframeDays) });

  // Analytics query
  const analyticsResult = useDql({ query: analyticsQuery(activeHosts, timeframeDays) });

  const isLoading = metricsResult.isLoading;

  // Parse the metrics array
  const metrics: MetricsData | null = useMemo(() => parseMetrics(metricsResult.data?.records), [metricsResult.data]);

  // Derived observed values
  const cpu = useMemo(() => metrics ? { low: metrics.cpuLow, avg: metrics.cpuMedian, high: metrics.cpuHigh, change: metrics.cpuChange } : { low: 0, avg: 0, high: 0, change: 0 }, [metrics]);
  const memory = useMemo(() => metrics ? { low: metrics.memLow, avg: metrics.memMedian, high: metrics.memHigh, change: metrics.memChange } : { low: 0, avg: 0, high: 0, change: 0 }, [metrics]);
  const disk = useMemo(() => metrics ? { low: metrics.diskLow, avg: metrics.diskMedian, high: metrics.diskHigh, change: metrics.diskChange } : { low: 0, avg: 0, high: 0, change: 0 }, [metrics]);
  const traffic = useMemo(() => metrics ? { median: metrics.trafficMedian, low: metrics.trafficLow, high: metrics.trafficHigh, change: metrics.trafficChange } : { median: 0, low: 0, high: 0, change: 0 }, [metrics]);

  const cpuPCC = metrics?.cpuPCC ?? 0;
  const memPCC = metrics?.memPCC ?? 0;
  const diskPCC = metrics?.diskPCC ?? 0;

  // Parse analytics data
  const analytics: AnalyticsData | null = useMemo(() => parseAnalytics(analyticsResult.data?.records), [analyticsResult.data]);

  // Derived analytics: R², CV, Elasticity
  const analyticsExtras = useMemo(() => {
    if (!analytics || !metrics) return null;
    const safeDiv = (a: number, b: number) => b !== 0 ? a / b : 0;
    return {
      cpu: {
        rSquared: analytics.cpu.pcc * analytics.cpu.pcc,
        cv: safeDiv(analytics.cpu.stdDev, analytics.cpu.mean),
        elasticity: safeDiv(metrics.cpuChange, metrics.trafficChange),
      },
      mem: {
        rSquared: analytics.mem.pcc * analytics.mem.pcc,
        cv: safeDiv(analytics.mem.stdDev, analytics.mem.mean),
        elasticity: safeDiv(metrics.memChange, metrics.trafficChange),
      },
      disk: {
        rSquared: analytics.disk.pcc * analytics.disk.pcc,
        cv: safeDiv(analytics.disk.stdDev, analytics.disk.mean),
        elasticity: safeDiv(metrics.diskChange, metrics.trafficChange),
      },
      traffic: {
        cv: safeDiv(analytics.traffic.stdDev, analytics.traffic.mean),
      },
    };
  }, [analytics, metrics]);

  // Forecasted values (with PCC)
  const cpuForecast = useMemo(() => forecast(cpu, trafficChangePercent, traffic.change, cpuPCC), [cpu, trafficChangePercent, traffic.change, cpuPCC]);
  const memForecast = useMemo(() => forecast(memory, trafficChangePercent, traffic.change, memPCC), [memory, trafficChangePercent, traffic.change, memPCC]);
  const diskForecast = useMemo(() => forecast(disk, trafficChangePercent, traffic.change, diskPCC), [disk, trafficChangePercent, traffic.change, diskPCC]);

  // Provisioning (PCC-weighted)
  const cpuProvisioning = provisionGoal - cpuForecast.high * cpuPCC;
  const memProvisioning = provisionGoal - memForecast.high * memPCC;
  const diskProvisioning = provisionGoal - diskForecast.high * diskPCC;

  // Bar chart data
  const cpuBarData = useMemo(() => [
    { category: "Observed Low", value: round(cpu.low), color: getResourceColor(cpu.low) },
    { category: "Observed Average", value: round(cpu.avg), color: getResourceColor(cpu.avg) },
    { category: "Observed High", value: round(cpu.high), color: getResourceColor(cpu.high) },
    { category: "Forecast Low", value: round(cpuForecast.low), color: getResourceColor(cpuForecast.low) },
    { category: "Forecast Average", value: round(cpuForecast.avg), color: getResourceColor(cpuForecast.avg) },
    { category: "Forecast High", value: round(cpuForecast.high), color: getResourceColor(cpuForecast.high) },
  ], [cpu, cpuForecast]);

  const memBarData = useMemo(() => [
    { category: "Observed Low", value: round(memory.low), color: getResourceColor(memory.low) },
    { category: "Observed Average", value: round(memory.avg), color: getResourceColor(memory.avg) },
    { category: "Observed High", value: round(memory.high), color: getResourceColor(memory.high) },
    { category: "Forecast Low", value: round(memForecast.low), color: getResourceColor(memForecast.low) },
    { category: "Forecast Average", value: round(memForecast.avg), color: getResourceColor(memForecast.avg) },
    { category: "Forecast High", value: round(memForecast.high), color: getResourceColor(memForecast.high) },
  ], [memory, memForecast]);

  const diskBarData = useMemo(() => [
    { category: "Observed Low", value: round(disk.low), color: getResourceColor(disk.low) },
    { category: "Observed Average", value: round(disk.avg), color: getResourceColor(disk.avg) },
    { category: "Observed High", value: round(disk.high), color: getResourceColor(disk.high) },
    { category: "Forecast Low", value: round(diskForecast.low), color: getResourceColor(diskForecast.low) },
    { category: "Forecast Average", value: round(diskForecast.avg), color: getResourceColor(diskForecast.avg) },
    { category: "Forecast High", value: round(diskForecast.high), color: getResourceColor(diskForecast.high) },
  ], [disk, diskForecast]);

  // Table data with PCC-based forecasted columns
  const cpuTableData = useMemo(() => {
    if (!cpuByHost.data?.records || !metrics) return [];
    return cpuByHost.data.records.map((r) => {
      const pcc = num(r["Pearson Correlation Coefficient"]);
      const obs = { low: num(r["Observed CPU Low"]), avg: num(r["Observed CPU Avg"]), high: num(r["Observed CPU High"]), change: num(r["cpuUsage.PercentChange"]) };
      const fc = forecastForHost(obs, trafficChangePercent, traffic.change, pcc);
      return { "Host Name": r["Host Name"] as string, "PCC": round(pcc), "Observed CPU Low": round(obs.low), "Observed CPU Avg": round(obs.avg), "Observed CPU High": round(obs.high), "Forecasted Low CPU": round(fc.low), "Forecasted Avg CPU": round(fc.avg), "Forecasted High CPU": round(fc.high), Provisioning: round(provisionGoal - fc.high) };
    });
  }, [cpuByHost.data, trafficChangePercent, traffic.change, metrics, provisionGoal]);

  const memTableData = useMemo(() => {
    if (!memByHost.data?.records || !metrics) return [];
    return memByHost.data.records.map((r) => {
      const pcc = num(r["Pearson Correlation Coefficient"]);
      const obs = { low: num(r["Observed MEM Low"]), avg: num(r["Observed MEM Avg"]), high: num(r["Observed MEM High"]), change: num(r["memUsage.PercentChange"]) };
      const fc = forecastForHost(obs, trafficChangePercent, traffic.change, pcc);
      return { "Host Name": r["Host Name"] as string, "PCC": round(pcc), "Observed MEM Low": round(obs.low), "Observed MEM Avg": round(obs.avg), "Observed MEM High": round(obs.high), "Forecasted Low MEM": round(fc.low), "Forecasted Avg MEM": round(fc.avg), "Forecasted High MEM": round(fc.high), Provisioning: round(provisionGoal - fc.high) };
    });
  }, [memByHost.data, trafficChangePercent, traffic.change, metrics, provisionGoal]);

  const diskTableData = useMemo(() => {
    if (!diskByHost.data?.records || !metrics) return [];
    return diskByHost.data.records.map((r) => {
      const pcc = num(r["Pearson Correlation Coefficient"]);
      const obs = { low: num(r["Observed Disk Free Low"]), avg: num(r["Observed Disk Free Avg"]), high: num(r["Observed Disk Free High"]), change: num(r["diskFree.PercentChange"]) };
      const fc = forecastForHost(obs, trafficChangePercent, traffic.change, pcc);
      return { "Host Name": r["Host Name"] as string, "PCC": round(pcc), "Observed Disk Free Low": round(obs.low), "Observed Disk Free Avg": round(obs.avg), "Observed Disk Free High": round(obs.high), "Forecasted Low Disk Free": round(fc.low), "Forecasted Avg Disk Free": round(fc.avg), "Forecasted High Disk Free": round(fc.high), Provisioning: round(provisionGoal - fc.high) };
    });
  }, [diskByHost.data, trafficChangePercent, traffic.change, metrics, provisionGoal]);

  const handleSaveSettings = () => {
    setTopN(tempTopN);
    setProvisionGoal(tempProvisionGoal);
    setSettingsOpen(false);
  };

  const cpuColumns = useMemo(() => [
    { id: "hostName", header: "Host Name", accessor: "Host Name" },
    { id: "pcc", header: "PCC", accessor: "PCC", columnType: "number" as const, thresholds: pccThresholds("PCC") },
    { id: "obsLow", header: "Observed CPU Low", accessor: "Observed CPU Low", columnType: "number" as const, thresholds: resourceThresholds("Observed CPU Low") },
    { id: "obsAvg", header: "Observed CPU Avg", accessor: "Observed CPU Avg", columnType: "number" as const, thresholds: resourceThresholds("Observed CPU Avg") },
    { id: "obsHigh", header: "Observed CPU High", accessor: "Observed CPU High", columnType: "number" as const, thresholds: resourceThresholds("Observed CPU High") },
    { id: "fcLow", header: "Forecasted Low CPU", accessor: "Forecasted Low CPU", columnType: "number" as const, thresholds: resourceThresholds("Forecasted Low CPU") },
    { id: "fcAvg", header: "Forecasted Avg CPU", accessor: "Forecasted Avg CPU", columnType: "number" as const, thresholds: resourceThresholds("Forecasted Avg CPU") },
    { id: "fcHigh", header: "Forecasted High CPU", accessor: "Forecasted High CPU", columnType: "number" as const, thresholds: resourceThresholds("Forecasted High CPU") },
    { id: "prov", header: "Provisioning", accessor: "Provisioning", columnType: "number" as const, thresholds: PROVISIONING_THRESHOLDS },
  ], []);

  const memColumns = useMemo(() => [
    { id: "hostName", header: "Host Name", accessor: "Host Name" },
    { id: "pcc", header: "PCC", accessor: "PCC", columnType: "number" as const, thresholds: pccThresholds("PCC") },
    { id: "obsLow", header: "Observed MEM Low", accessor: "Observed MEM Low", columnType: "number" as const, thresholds: resourceThresholds("Observed MEM Low") },
    { id: "obsAvg", header: "Observed MEM Avg", accessor: "Observed MEM Avg", columnType: "number" as const, thresholds: resourceThresholds("Observed MEM Avg") },
    { id: "obsHigh", header: "Observed MEM High", accessor: "Observed MEM High", columnType: "number" as const, thresholds: resourceThresholds("Observed MEM High") },
    { id: "fcLow", header: "Forecasted Low MEM", accessor: "Forecasted Low MEM", columnType: "number" as const, thresholds: resourceThresholds("Forecasted Low MEM") },
    { id: "fcAvg", header: "Forecasted Avg MEM", accessor: "Forecasted Avg MEM", columnType: "number" as const, thresholds: resourceThresholds("Forecasted Avg MEM") },
    { id: "fcHigh", header: "Forecasted High MEM", accessor: "Forecasted High MEM", columnType: "number" as const, thresholds: resourceThresholds("Forecasted High MEM") },
    { id: "prov", header: "Provisioning", accessor: "Provisioning", columnType: "number" as const, thresholds: PROVISIONING_THRESHOLDS },
  ], []);

  const diskColumns = useMemo(() => [
    { id: "hostName", header: "Host Name", accessor: "Host Name" },
    { id: "pcc", header: "PCC", accessor: "PCC", columnType: "number" as const, thresholds: pccThresholds("PCC") },
    { id: "obsLow", header: "Observed Disk Free Low", accessor: "Observed Disk Free Low", columnType: "number" as const, thresholds: resourceThresholds("Observed Disk Free Low") },
    { id: "obsAvg", header: "Observed Disk Free Avg", accessor: "Observed Disk Free Avg", columnType: "number" as const, thresholds: resourceThresholds("Observed Disk Free Avg") },
    { id: "obsHigh", header: "Observed Disk Free High", accessor: "Observed Disk Free High", columnType: "number" as const, thresholds: resourceThresholds("Observed Disk Free High") },
    { id: "fcLow", header: "Forecasted Low Disk Free", accessor: "Forecasted Low Disk Free", columnType: "number" as const, thresholds: resourceThresholds("Forecasted Low Disk Free") },
    { id: "fcAvg", header: "Forecasted Avg Disk Free", accessor: "Forecasted Avg Disk Free", columnType: "number" as const, thresholds: resourceThresholds("Forecasted Avg Disk Free") },
    { id: "fcHigh", header: "Forecasted High Disk Free", accessor: "Forecasted High Disk Free", columnType: "number" as const, thresholds: resourceThresholds("Forecasted High Disk Free") },
    { id: "prov", header: "Provisioning", accessor: "Provisioning", columnType: "number" as const, thresholds: PROVISIONING_THRESHOLDS },
  ], []);

  return (
    <Flex flexDirection="column" gap={0}>
      {/* Filters - sticky at top */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "linear-gradient(180deg, rgba(20, 22, 38, 0.97) 0%, rgba(26, 26, 46, 0.95) 100%)", backdropFilter: "blur(12px)", padding: "12px 20px 10px 20px", borderBottom: "1px solid rgba(99, 130, 191, 0.15)", boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)" }}>
        <Flex flexDirection="column" gap={4} style={{ width: "100%" }}>
          <Strong style={{ textAlign: "center", letterSpacing: 0.5 }}>Traffic Percentage: {trafficChangePercent}</Strong>
        <input
          type="range"
          min={0}
          max={TRAFFIC_CHANGE_OPTIONS.length - 1}
          value={TRAFFIC_CHANGE_OPTIONS.indexOf(trafficChangePercent)}
          onChange={(e) => setTrafficChangePercent(TRAFFIC_CHANGE_OPTIONS[Number(e.target.value)])}
          style={{ width: "100%", cursor: "pointer" }}
        />
        <div style={{ position: "relative", width: "100%", height: 16 }}>
          {TRAFFIC_CHANGE_OPTIONS.map((v, i) => (
            <span key={v} style={{ position: "absolute", left: `${(i / (TRAFFIC_CHANGE_OPTIONS.length - 1)) * 100}%`, transform: "translateX(-50%)", fontSize: 10, color: v === trafficChangePercent ? "#4589ff" : "#aaa", fontWeight: v === trafficChangePercent ? 700 : 400, whiteSpace: "nowrap" }}>{v}</span>
          ))}
        </div>
        </Flex>
        <Flex gap={16} alignItems="flex-end" flexWrap="wrap" style={{ paddingTop: 8 }}>
        <Flex flexDirection="column" gap={4} style={{ width: 400, minWidth: 0, maxWidth: 400, flex: "0 0 400px" }}>
          <Strong>Host Group</Strong>
          <div style={{ maxWidth: 400, overflow: "hidden" }}>
            <Select<string, true>
              multiple
              value={selectedHostGroups}
              onChange={(val) => { setSelectedHostGroups(val ?? []); setSelectedHosts([]); }}
            >
              <Select.Filter />
              <Select.Content>
                {hostGroupOptions.map((g) => (
                  <Select.Option key={g} value={g}>{g}</Select.Option>
                ))}
              </Select.Content>
            </Select>
          </div>
        </Flex>
        <Flex flexDirection="column" gap={4} style={{ width: 600, minWidth: 0, maxWidth: 600, flex: "0 0 600px" }}>
          <Strong>Host</Strong>
          <div style={{ maxWidth: 600, overflow: "hidden" }}>
            <Select<string, true>
              multiple
              value={selectedHosts}
              onChange={(val) => setSelectedHosts(val ?? [])}
            >
              <Select.Filter />
              <Select.Content>
                {hostOptions.map((h) => (
                  <Select.Option key={h} value={h}>{h}</Select.Option>
                ))}
              </Select.Content>
            </Select>
          </div>
        </Flex>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "flex-end" }}>
          <Flex flexDirection="column" gap={4} style={{ minWidth: 140 }}>
            <Strong>Timeframe</Strong>
            <Select
              value={timeframeDays}
              onChange={(val) => { if (val != null) setTimeframeDays(val as number); }}
            >
              <Select.Content>
                {TIMEFRAME_OPTIONS.map((opt) => (
                  <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
                ))}
              </Select.Content>
            </Select>
          </Flex>
          <Button variant="default" onClick={() => setHelpOpen(true)}>
            <Button.Prefix><HelpIcon /></Button.Prefix>
          </Button>
          <Button variant="default" onClick={() => { setTempTopN(topN); setTempProvisionGoal(provisionGoal); setSettingsOpen(true); }}>
            <Button.Prefix><SettingIcon /></Button.Prefix>
          </Button>
        </div>
        </Flex>
      </div>

      <Flex flexDirection="column" padding={16} gap={16}>

      {/* Help Modal */}
      <Modal title="Traffic Analyzer — Help & Formulas" show={helpOpen} onDismiss={() => setHelpOpen(false)} size="large">
        <div style={{ padding: 16, maxHeight: "70vh", overflowY: "auto", fontSize: 13, lineHeight: 1.6 }}>
          <h3 style={{ marginTop: 0 }}>Overview</h3>
          <p>
            The Traffic Analyzer for Infrastructure correlates <strong>network traffic</strong> (measured via <code>dt.host.cpu.system</code>) with <strong>CPU</strong>, <strong>Memory</strong>, and <strong>Disk</strong> resource usage to forecast how infrastructure will respond to future traffic changes. Use the <strong>Traffic Percentage slider</strong> to simulate a traffic increase (e.g., +50%) and see how each resource is projected to respond.
          </p>

          <h3>Filters</h3>
          <ul>
            <li><strong>Traffic Percentage Slider</strong> — Simulates a traffic increase/decrease. All forecast values update dynamically.</li>
            <li><strong>Host Group</strong> — Filter hosts by host group. Selecting a group restricts the Host dropdown to hosts in that group.</li>
            <li><strong>Host</strong> — Select specific hosts to analyze. If none selected, all hosts (or hosts in the selected group) are included.</li>
            <li><strong>Timeframe</strong> — Analysis window (1–365 days). All metrics and tables use this time range.</li>
            <li><strong>Settings (⚙)</strong> — Configure Provisioning Goal (default {DEFAULT_PROVISION_GOAL}%) and Top N (max entities per table).</li>
          </ul>

          <h3>Key Concepts</h3>

          <h4>Observed Metrics</h4>
          <p>For each resource, the timeseries data is split at the median to compute:</p>
          <ul>
            <li><strong>Median (Average)</strong> = mean of all data points</li>
            <li><strong>Low Average</strong> = mean of data points below the median</li>
            <li><strong>High Average</strong> = mean of data points above the median</li>
            <li><strong>% Change</strong> = <code>100 × (HighAvg − LowAvg) / LowAvg</code></li>
          </ul>

          <h4>Pearson Correlation Coefficient (PCC)</h4>
          <p>Measures the linear relationship between Traffic and each resource (−1 to +1):</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            PCC = (n·ΣXY − ΣX·ΣY) / √[(n·ΣX² − (ΣX)²) × (n·ΣY² − (ΣY)²)]
          </p>
          <p>Where X = resource values, Y = traffic values, n = number of data points.</p>
          <ul>
            <li><span style={{ color: "#00D26A" }}>■</span> PCC ≥ 0.5 — Strong correlation (green)</li>
            <li><span style={{ color: "#FCD53F" }}>■</span> 0.3 ≤ PCC &lt; 0.5 — Moderate correlation (yellow)</li>
            <li><span style={{ color: "#F8312F" }}>■</span> PCC &lt; 0.3 — Weak correlation (red)</li>
          </ul>

          <h4>Forecast Formula</h4>
          <p>Forecasts project resource usage at a given traffic increase, weighted by PCC:</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            Ratio = Resource % Change / Traffic % Change<br/>
            Factor = 1 + (Traffic Slider % × PCC × Ratio) / 100<br/>
            Forecast Value = Observed Value × Factor
          </p>
          <p>The PCC weighting ensures resources with low traffic correlation are not over-projected.</p>

          <h4>Forecast % Change</h4>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            Forecast % Change = 100 × (ForecastHigh − ObservedHigh) / ObservedHigh × PCC
          </p>

          <h4>Provisioning</h4>
          <p>How much headroom remains before the resource hits the {provisionGoal}% capacity goal (configurable in Settings):</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            Provisioning = {provisionGoal}% − (Forecast High × PCC)
          </p>
          <ul>
            <li><span style={{ color: "#00D26A" }}>■</span> Provisioning ≥ 0 — Capacity available (green)</li>
            <li><span style={{ color: "#F8312F" }}>■</span> Provisioning &lt; 0 — Over capacity (red)</li>
          </ul>

          <h3>Tab Descriptions</h3>

          <h4>Overview</h4>
          <p><strong>Forecast High</strong> — Gauge charts showing forecasted high resource usage with provisioning headroom. <strong>Observed Traffic Analysis</strong> — Shows how observed traffic changes cascade to CPU, Memory, and Disk (weighted by PCC).</p>

          <h4>Forecast Breakdown</h4>
          <p>Horizontal bar charts comparing observed (blue) vs. forecasted (green) values for each resource. Threshold bands: green (0–80%), yellow (80–90%), red (90–100%).</p>

          <h4>Metrics — Observed / Forecast</h4>
          <p>Single-value tiles for all raw metrics: Low, Average, High, and % Change for Traffic, CPU, Memory, and Disk.</p>

          <h4>Top Impacted Entities (CPU / Memory / Disk)</h4>
          <p>Per-host tables sorted by PCC showing the most traffic-correlated hosts. Each row includes observed values, PCC, forecasted values, and provisioning headroom. Column colors use the same threshold rules.</p>

          <h3>Analytics Tab — Statistical Metrics</h3>

          <h4>R² (R-Squared)</h4>
          <p>The proportion of resource variance explained by traffic:</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            R² = PCC²
          </p>
          <p>Example: PCC = 0.7 → R² = 0.49, meaning traffic explains 49% of the resource's variation.</p>

          <h4>Elasticity</h4>
          <p>How sensitive a resource is to traffic changes:</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            Elasticity = Resource % Change / Traffic % Change
          </p>
          <ul>
            <li><span style={{ color: "#F8312F" }}>■</span> |Elasticity| &gt; 1 — Resource scales faster than traffic (bottleneck risk)</li>
            <li><span style={{ color: "#00D26A" }}>■</span> |Elasticity| ≤ 1 — Resource scales at or below traffic rate</li>
          </ul>

          <h4>Lag Correlation</h4>
          <p>PCC computed at time offsets (0, +15min, +30min, +1h) to detect delayed traffic impact. If lag PCC &gt; instant PCC, the resource responds to traffic with a delay.</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            Lag PCC(offset) = PCC( resource[0..n-offset], traffic[offset..n] )
          </p>

          <h4>Percentiles (P95, P99)</h4>
          <p>The value below which 95% or 99% of data points fall. Better than averages for capacity planning because they capture peak behavior.</p>

          <h4>Standard Deviation (StdDev)</h4>
          <p>Measures the spread/volatility of values around the mean:</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            σ = √[ Σ(xᵢ − μ)² / n ]
          </p>

          <h4>Coefficient of Variation (CV)</h4>
          <p>Normalized volatility — allows comparison across different scales:</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            CV = StdDev / Mean
          </p>
          <ul>
            <li><span style={{ color: "#F8312F" }}>■</span> CV &gt; 0.3 — High variability (unstable, red)</li>
            <li><span style={{ color: "#00D26A" }}>■</span> CV ≤ 0.3 — Stable (green)</li>
          </ul>

          <h4>Skewness</h4>
          <p>Measures asymmetry of the distribution:</p>
          <p style={{ fontFamily: "monospace", background: "var(--dt-colors-background-surface-default)", padding: 8, borderRadius: 4 }}>
            Skew = Σ[(xᵢ − μ) / σ]³ / n
          </p>
          <ul>
            <li>Skew &gt; 0 — Right-skewed (occasional high spikes)</li>
            <li>Skew &lt; 0 — Left-skewed (occasional low dips)</li>
            <li><span style={{ color: "#F8312F" }}>■</span> |Skew| &gt; 1 — Highly skewed (red)</li>
            <li><span style={{ color: "#FCD53F" }}>■</span> 0.5 &lt; |Skew| ≤ 1 — Moderately skewed (yellow)</li>
            <li><span style={{ color: "#00D26A" }}>■</span> |Skew| ≤ 0.5 — Approximately symmetric (green)</li>
          </ul>

          <h3>Color Thresholds</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #555" }}>
                <th style={{ textAlign: "left", padding: 4 }}>Metric</th>
                <th style={{ textAlign: "left", padding: 4 }}><span style={{ color: "#00D26A" }}>Green</span></th>
                <th style={{ textAlign: "left", padding: 4 }}><span style={{ color: "#FCD53F" }}>Yellow</span></th>
                <th style={{ textAlign: "left", padding: 4 }}><span style={{ color: "#F8312F" }}>Red</span></th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={{ padding: 4 }}>Resource Usage</td><td style={{ padding: 4 }}>&lt; 80%</td><td style={{ padding: 4 }}>80–90%</td><td style={{ padding: 4 }}>≥ 90%</td></tr>
              <tr><td style={{ padding: 4 }}>PCC</td><td style={{ padding: 4 }}>≥ 0.5</td><td style={{ padding: 4 }}>0.3–0.5</td><td style={{ padding: 4 }}>&lt; 0.3</td></tr>
              <tr><td style={{ padding: 4 }}>% Change</td><td style={{ padding: 4 }}>≤ 0%</td><td style={{ padding: 4 }}>0–5%</td><td style={{ padding: 4 }}>≥ 5%</td></tr>
              <tr><td style={{ padding: 4 }}>Provisioning</td><td style={{ padding: 4 }}>≥ 0</td><td style={{ padding: 4 }}>—</td><td style={{ padding: 4 }}>&lt; 0</td></tr>
            </tbody>
          </table>

          <h3>Data Sources</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #555" }}>
                <th style={{ textAlign: "left", padding: 4 }}>Label</th>
                <th style={{ textAlign: "left", padding: 4 }}>Metric Key</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={{ padding: 4 }}>Traffic</td><td style={{ padding: 4 }}><code>dt.host.cpu.system</code></td></tr>
              <tr><td style={{ padding: 4 }}>CPU</td><td style={{ padding: 4 }}><code>dt.host.cpu.usage</code></td></tr>
              <tr><td style={{ padding: 4 }}>Memory</td><td style={{ padding: 4 }}><code>dt.host.memory.usage</code></td></tr>
              <tr><td style={{ padding: 4 }}>Disk</td><td style={{ padding: 4 }}><code>dt.host.disk.free</code></td></tr>
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Settings Modal */}
      <Modal title="Settings" show={settingsOpen} onDismiss={() => setSettingsOpen(false)} size="small"
        footer={
          <Flex justifyContent="flex-end" gap={8}>
            <Button variant="emphasized" onClick={handleSaveSettings}>Save</Button>
          </Flex>
        }
      >
        <Flex flexDirection="column" gap={16} padding={16}>
          <Flex flexDirection="column" gap={4}>
            <Strong>Provisioning Goal (%)</Strong>
            <NumberInput value={tempProvisionGoal} onChange={(val) => setTempProvisionGoal(val ?? DEFAULT_PROVISION_GOAL)} min={1} max={100} />
          </Flex>
          <Flex flexDirection="column" gap={4}>
            <Strong>Top N (entities per table)</Strong>
            <NumberInput value={tempTopN} onChange={(val) => setTempTopN(val ?? DEFAULT_TOP_N)} min={1} max={10000} />
          </Flex>
        </Flex>
      </Modal>

      {isLoading && <LoadingState />}

      <Tabs>
        {/* Tab 1: Overview */}
        <Tab title="Overview">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <SectionHeader title="Forecast High" />
            <Flex gap={16} flexWrap="wrap">
              <Flex flexDirection="column" gap={8} style={{ flex: "1 1 300px", minWidth: 280 }}>
                <Heading level={6}>CPU</Heading>
                <Flex gap={8}>
                  <MetricCard label="% Change" value={cpuForecast.percentChange} unit="%" color={getChangeColor(cpuForecast.percentChange)} bordered style={{ flex: 1, maxWidth: "none", width: "auto" }} />
                  <MetricCard label="PCC" value={cpuPCC} color={getPccColor(cpuPCC)} bordered style={{ flex: 1, maxWidth: "none", width: "auto" }} />
                </Flex>
                <Flex gap={8} alignItems="stretch">
                  <div style={{ flex: 1, border: TILE_BORDER, borderRadius: 10, padding: 8, background: TILE_BG, boxShadow: TILE_SHADOW }}>
                    <GaugeChart value={round(cpuForecast.high)} max={100} unit="percent" height={180}>
                      <GaugeChart.Label>CPU</GaugeChart.Label>
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={0} color="#00D26A" />
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={80} color="#FCD53F" />
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={90} color="#F8312F" />
                      <GaugeChart.ThresholdIndicator value={80} showIndicator color="#FCD53F" />
                      <GaugeChart.ThresholdIndicator value={90} showIndicator color="#F8312F" />
                    </GaugeChart>
                  </div>
                  <div style={{ flex: 1, border: TILE_BORDER, borderRadius: 10, padding: 8, display: "flex", alignItems: "center", textAlign: "center", background: TILE_BG, boxShadow: TILE_SHADOW }}>
                    <div style={{ width: "100%", height: 80 }}>
                      <SingleValue data={round(cpuProvisioning)} label="CPU Provisioning" unit="%" color={getProvisioningColor(cpuProvisioning)} />
                    </div>
                  </div>
                </Flex>
              </Flex>
              <Flex flexDirection="column" gap={8} style={{ flex: "1 1 300px", minWidth: 280 }}>
                <Heading level={6}>Memory</Heading>
                <Flex gap={8}>
                  <MetricCard label="% Change" value={memForecast.percentChange} unit="%" color={getChangeColor(memForecast.percentChange)} bordered style={{ flex: 1, maxWidth: "none", width: "auto" }} />
                  <MetricCard label="PCC" value={memPCC} color={getPccColor(memPCC)} bordered style={{ flex: 1, maxWidth: "none", width: "auto" }} />
                </Flex>
                <Flex gap={8} alignItems="stretch">
                  <div style={{ flex: 1, border: TILE_BORDER, borderRadius: 10, padding: 8, background: TILE_BG, boxShadow: TILE_SHADOW }}>
                    <GaugeChart value={round(memForecast.high * memPCC)} max={100} unit="percent" height={180}>
                      <GaugeChart.Label>Memory</GaugeChart.Label>
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={0} color="#00D26A" />
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={80} color="#FCD53F" />
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={90} color="#F8312F" />
                      <GaugeChart.ThresholdIndicator value={80} showIndicator color="#FCD53F" />
                      <GaugeChart.ThresholdIndicator value={90} showIndicator color="#F8312F" />
                    </GaugeChart>
                  </div>
                  <div style={{ flex: 1, border: TILE_BORDER, borderRadius: 10, padding: 8, display: "flex", alignItems: "center", textAlign: "center", background: TILE_BG, boxShadow: TILE_SHADOW }}>
                    <div style={{ width: "100%", height: 80 }}>
                      <SingleValue data={round(memProvisioning)} label="Memory Provisioning" unit="%" color={getProvisioningColor(memProvisioning)} />
                    </div>
                  </div>
                </Flex>
              </Flex>
              <Flex flexDirection="column" gap={8} style={{ flex: "1 1 300px", minWidth: 280 }}>
                <Heading level={6}>Disk Free</Heading>
                <Flex gap={8}>
                  <MetricCard label="% Change" value={diskForecast.percentChange} unit="%" color={getChangeColor(diskForecast.percentChange)} bordered style={{ flex: 1, maxWidth: "none", width: "auto" }} />
                  <MetricCard label="PCC" value={diskPCC} color={getPccColor(diskPCC)} bordered style={{ flex: 1, maxWidth: "none", width: "auto" }} />
                </Flex>
                <Flex gap={8} alignItems="stretch">
                  <div style={{ flex: 1, border: TILE_BORDER, borderRadius: 10, padding: 8, background: TILE_BG, boxShadow: TILE_SHADOW }}>
                    <GaugeChart value={round(diskForecast.high * diskPCC)} max={100} unit="percent" height={180}>
                      <GaugeChart.Label>Disk Free</GaugeChart.Label>
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={0} color="#00D26A" />
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={80} color="#FCD53F" />
                      <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={90} color="#F8312F" />
                      <GaugeChart.ThresholdIndicator value={80} showIndicator color="#FCD53F" />
                      <GaugeChart.ThresholdIndicator value={90} showIndicator color="#F8312F" />
                    </GaugeChart>
                  </div>
                  <div style={{ flex: 1, border: TILE_BORDER, borderRadius: 10, padding: 8, display: "flex", alignItems: "center", textAlign: "center", background: TILE_BG, boxShadow: TILE_SHADOW }}>
                    <div style={{ width: "100%", height: 80 }}>
                      <SingleValue data={round(diskProvisioning)} label="Disk Provisioning" unit="%" color={getProvisioningColor(diskProvisioning)} />
                    </div>
                  </div>
                </Flex>
              </Flex>
            </Flex>

            <SectionHeader title="Observed Traffic Analysis" />
            <Flex gap={8} alignItems="center" style={{ width: "100%" }}>
              <MetricCard label="Traffic Change" value={traffic.change} unit="%" color={getChangeColor(traffic.change)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <ArrowRight />
              <MetricCard label="CPU Change" value={cpu.change * cpuPCC} unit="%" color={getChangeColor(cpu.change * cpuPCC)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Memory Change" value={memory.change * memPCC} unit="%" color={getChangeColor(memory.change * memPCC)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Disk Free Change" value={disk.change * diskPCC} unit="%" color={getChangeColor(disk.change * diskPCC)} bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
            <SectionHeader title={"\u00A0"} />
          </Flex>
        </Tab>

        {/* Tab 2: Forecast Breakdown */}
        <Tab title="Forecast Breakdown">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <Heading level={6}>CPU Observed (Blue) vs Forecast (Green)</Heading>
            <CategoricalBarChart data={cpuBarData} height={250} layout="horizontal">
              <CategoricalBarChart.Legend hidden />
              <CategoricalBarChart.ValueAxis label="%" max={100} />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 0, max: 80 }} color="#00D26A" />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 80, max: 90 }} color="#FCD53F" />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 90, max: 100 }} color="#F8312F" />
            </CategoricalBarChart>

            <Heading level={6}>Memory Observed (Blue) vs Forecast (Green)</Heading>
            <CategoricalBarChart data={memBarData} height={250} layout="horizontal">
              <CategoricalBarChart.Legend hidden />
              <CategoricalBarChart.ValueAxis label="%" max={100} />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 0, max: 80 }} color="#00D26A" />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 80, max: 90 }} color="#FCD53F" />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 90, max: 100 }} color="#F8312F" />
            </CategoricalBarChart>

            <Heading level={6}>Disk Free Observed (Blue) vs Forecast (Green)</Heading>
            <CategoricalBarChart data={diskBarData} height={250} layout="horizontal">
              <CategoricalBarChart.Legend hidden />
              <CategoricalBarChart.ValueAxis label="%" max={100} />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 0, max: 80 }} color="#00D26A" />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 80, max: 90 }} color="#FCD53F" />
              <CategoricalBarChart.ThresholdIndicator data={{ min: 90, max: 100 }} color="#F8312F" />
            </CategoricalBarChart>
          </Flex>
        </Tab>

        {/* Tab 3: Metrics - Observed */}
        <Tab title="Metrics - Observed">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <Heading level={6}>Traffic</Heading>
            <Flex gap={8} flexWrap="wrap">
              <MetricCard label="Low Traffic Average" value={traffic.low} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Traffic Average" value={traffic.median} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="High Traffic Average" value={traffic.high} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Traffic Change" value={traffic.change} unit="%" color={getChangeColor(traffic.change)} bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
            <Heading level={6}>CPU</Heading>
            <Flex gap={8} flexWrap="wrap">
              <MetricCard label="CPU Low" value={cpu.low} unit="%" color={getResourceColor(cpu.low)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="CPU Avg" value={cpu.avg} unit="%" color={getResourceColor(cpu.avg)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="CPU High" value={cpu.high} unit="%" color={getResourceColor(cpu.high)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="CPU Change" value={cpu.change} unit="%" color={getChangeColor(cpu.change)} bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
            <Heading level={6}>Memory</Heading>
            <Flex gap={8} flexWrap="wrap">
              <MetricCard label="Memory Low" value={memory.low} unit="%" color={getResourceColor(memory.low)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Memory Avg" value={memory.avg} unit="%" color={getResourceColor(memory.avg)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Memory High" value={memory.high} unit="%" color={getResourceColor(memory.high)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Memory Change" value={memory.change} unit="%" color={getChangeColor(memory.change)} bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
            <Heading level={6}>Disk Free</Heading>
            <Flex gap={8} flexWrap="wrap">
              <MetricCard label="Disk Free Low" value={disk.low} unit="%" color={getResourceColor(disk.low)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Disk Free Avg" value={disk.avg} unit="%" color={getResourceColor(disk.avg)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Disk Free High" value={disk.high} unit="%" color={getResourceColor(disk.high)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Disk Free Change" value={disk.change} unit="%" color={getChangeColor(disk.change)} bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
          </Flex>
        </Tab>

        {/* Tab 4: Metrics - Forecast */}
        <Tab title="Metrics - Forecast">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <Heading level={6}>Traffic</Heading>
            <Flex gap={8} flexWrap="wrap">
              <MetricCard label="Traffic Average" value={traffic.median + traffic.median * (trafficChangePercent / 100)} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Traffic Change" value={traffic.median * (trafficChangePercent / 100)} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Traffic Change %" value={trafficChangePercent} unit="%" color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
            <Heading level={6}>CPU</Heading>
            <Flex gap={8} flexWrap="wrap">
              <MetricCard label="CPU Low" value={cpuForecast.low} unit="%" color={getResourceColor(cpuForecast.low)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="CPU Avg" value={cpuForecast.avg} unit="%" color={getResourceColor(cpuForecast.avg)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="CPU High" value={cpuForecast.high} unit="%" color={getResourceColor(cpuForecast.high)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="% Change (High)" value={cpuForecast.percentChange} unit="%" color={getChangeColor(cpuForecast.percentChange)} bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
            <Heading level={6}>Memory</Heading>
            <Flex gap={8} flexWrap="wrap">
              <MetricCard label="Memory Low" value={memForecast.low} unit="%" color={getResourceColor(memForecast.low)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Memory Avg" value={memForecast.avg} unit="%" color={getResourceColor(memForecast.avg)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Memory High" value={memForecast.high} unit="%" color={getResourceColor(memForecast.high)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="% Change (High)" value={memForecast.percentChange} unit="%" color={getChangeColor(memForecast.percentChange)} bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
            <Heading level={6}>Disk Free</Heading>
            <Flex gap={8} flexWrap="wrap">
              <MetricCard label="Disk Free Low" value={diskForecast.low} unit="%" color={getResourceColor(diskForecast.low)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Disk Free Avg" value={diskForecast.avg} unit="%" color={getResourceColor(diskForecast.avg)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="Disk Free High" value={diskForecast.high} unit="%" color={getResourceColor(diskForecast.high)} bordered style={{ flex: 1, maxWidth: "none" }} />
              <MetricCard label="% Change (High)" value={diskForecast.percentChange} unit="%" color={getChangeColor(diskForecast.percentChange)} bordered style={{ flex: 1, maxWidth: "none" }} />
            </Flex>
          </Flex>
        </Tab>

        {/* Tab 4: Top Impacted Entities - CPU */}
        <Tab title="Top Impacted Entities - CPU">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <Heading level={6}>CPU % by Host - Top {topN} (sorted by Pearson Correlation)</Heading>
            {cpuByHost.isLoading ? <LoadingState /> : (
              <DataTable data={cpuTableData} columns={cpuColumns} sortable resizable>
                <DataTable.Pagination defaultPageSize={10} />
              </DataTable>
            )}
          </Flex>
        </Tab>

        {/* Tab 5: Top Impacted Entities - Memory */}
        <Tab title="Top Impacted Entities - Memory">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <Heading level={6}>Memory % by Host - Top {topN} (sorted by Pearson Correlation)</Heading>
            {memByHost.isLoading ? <LoadingState /> : (
              <DataTable data={memTableData} columns={memColumns} sortable resizable>
                <DataTable.Pagination defaultPageSize={10} />
              </DataTable>
            )}
          </Flex>
        </Tab>

        {/* Tab 6: Top Impacted Entities - Disk */}
        <Tab title="Top Impacted Entities - Disk">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            <Heading level={6}>Disk Free % by Host - Top {topN} (sorted by Pearson Correlation)</Heading>
            {diskByHost.isLoading ? <LoadingState /> : (
              <DataTable data={diskTableData} columns={diskColumns} sortable resizable>
                <DataTable.Pagination defaultPageSize={10} />
              </DataTable>
            )}
          </Flex>
        </Tab>

        {/* Tab 7: Analytics */}
        <Tab title="Analytics">
          <Flex flexDirection="column" gap={16} paddingTop={16}>
            {analyticsResult.isLoading ? <LoadingState /> : !analytics || !analyticsExtras ? (
              <Flex justifyContent="center" padding={32}><Strong>No analytics data available</Strong></Flex>
            ) : (
              <>
                {/* Correlation Analysis */}
                <SectionHeader title="Correlation Analysis — Traffic vs Resources" />
                <Heading level={6}>Pearson Correlation Coefficient (PCC)</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="CPU PCC" value={analytics.cpu.pcc} color={analytics.cpu.pcc >= 0.5 ? "#00D26A" : analytics.cpu.pcc >= 0.3 ? "#FCD53F" : "#F8312F"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Memory PCC" value={analytics.mem.pcc} color={analytics.mem.pcc >= 0.5 ? "#00D26A" : analytics.mem.pcc >= 0.3 ? "#FCD53F" : "#F8312F"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Disk PCC" value={analytics.disk.pcc} color={analytics.disk.pcc >= 0.5 ? "#00D26A" : analytics.disk.pcc >= 0.3 ? "#FCD53F" : "#F8312F"} bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>

                <Heading level={6}>R² — Variance Explained by Traffic</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="CPU R²" value={analyticsExtras.cpu.rSquared} color={analyticsExtras.cpu.rSquared >= 0.5 ? "#00D26A" : analyticsExtras.cpu.rSquared >= 0.25 ? "#FCD53F" : "#F8312F"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Memory R²" value={analyticsExtras.mem.rSquared} color={analyticsExtras.mem.rSquared >= 0.5 ? "#00D26A" : analyticsExtras.mem.rSquared >= 0.25 ? "#FCD53F" : "#F8312F"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Disk R²" value={analyticsExtras.disk.rSquared} color={analyticsExtras.disk.rSquared >= 0.5 ? "#00D26A" : analyticsExtras.disk.rSquared >= 0.25 ? "#FCD53F" : "#F8312F"} bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>

                <Heading level={6}>Elasticity — Resource Sensitivity to Traffic (% Change Ratio)</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="CPU Elasticity" value={analyticsExtras.cpu.elasticity} color={Math.abs(analyticsExtras.cpu.elasticity) > 1 ? "#F8312F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Memory Elasticity" value={analyticsExtras.mem.elasticity} color={Math.abs(analyticsExtras.mem.elasticity) > 1 ? "#F8312F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Disk Elasticity" value={analyticsExtras.disk.elasticity} color={Math.abs(analyticsExtras.disk.elasticity) > 1 ? "#F8312F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>

                {/* Lag Correlation */}
                <SectionHeader title="Lag Correlation — Delayed Traffic Impact" />
                <Heading level={6}>CPU — PCC at Time Offsets</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="No Lag (0m)" value={analytics.cpu.pcc} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +15min" value={analytics.cpu.lagPCC15m} color="#4589FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +30min" value={analytics.cpu.lagPCC30m} color="#78A9FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +1h" value={analytics.cpu.lagPCC1h} color="#A6C8FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>
                <Heading level={6}>Memory — PCC at Time Offsets</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="No Lag (0m)" value={analytics.mem.pcc} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +15min" value={analytics.mem.lagPCC15m} color="#4589FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +30min" value={analytics.mem.lagPCC30m} color="#78A9FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +1h" value={analytics.mem.lagPCC1h} color="#A6C8FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>
                <Heading level={6}>Disk — PCC at Time Offsets</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="No Lag (0m)" value={analytics.disk.pcc} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +15min" value={analytics.disk.lagPCC15m} color="#4589FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +30min" value={analytics.disk.lagPCC30m} color="#78A9FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Lag +1h" value={analytics.disk.lagPCC1h} color="#A6C8FF" bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>

                {/* Distribution */}
                <SectionHeader title="Distribution — Percentiles & Variability" />
                <Heading level={6}>Traffic</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="Min" value={analytics.traffic.min} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="P95" value={analytics.traffic.p95} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="P99" value={analytics.traffic.p99} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Max" value={analytics.traffic.max} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Std Dev" value={analytics.traffic.stdDev} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="CV" value={analyticsExtras.traffic.cv} color={analyticsExtras.traffic.cv > 0.3 ? "#F8312F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Skewness" value={analytics.traffic.skew} color={Math.abs(analytics.traffic.skew) > 1 ? "#F8312F" : Math.abs(analytics.traffic.skew) > 0.5 ? "#FCD53F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>
                <Heading level={6}>CPU</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="Min" value={analytics.cpu.min} unit="%" color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="P95" value={analytics.cpu.p95} unit="%" color={analytics.cpu.p95 >= 90 ? "#F8312F" : analytics.cpu.p95 >= 80 ? "#FCD53F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="P99" value={analytics.cpu.p99} unit="%" color={analytics.cpu.p99 >= 90 ? "#F8312F" : analytics.cpu.p99 >= 80 ? "#FCD53F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Max" value={analytics.cpu.max} unit="%" color={analytics.cpu.max >= 90 ? "#F8312F" : analytics.cpu.max >= 80 ? "#FCD53F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Std Dev" value={analytics.cpu.stdDev} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="CV" value={analyticsExtras.cpu.cv} color={analyticsExtras.cpu.cv > 0.3 ? "#F8312F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Skewness" value={analytics.cpu.skew} color={Math.abs(analytics.cpu.skew) > 1 ? "#F8312F" : Math.abs(analytics.cpu.skew) > 0.5 ? "#FCD53F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>
                <Heading level={6}>Memory</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="Min" value={analytics.mem.min} unit="%" color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="P95" value={analytics.mem.p95} unit="%" color={analytics.mem.p95 >= 90 ? "#F8312F" : analytics.mem.p95 >= 80 ? "#FCD53F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="P99" value={analytics.mem.p99} unit="%" color={analytics.mem.p99 >= 90 ? "#F8312F" : analytics.mem.p99 >= 80 ? "#FCD53F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Max" value={analytics.mem.max} unit="%" color={analytics.mem.max >= 90 ? "#F8312F" : analytics.mem.max >= 80 ? "#FCD53F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Std Dev" value={analytics.mem.stdDev} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="CV" value={analyticsExtras.mem.cv} color={analyticsExtras.mem.cv > 0.3 ? "#F8312F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Skewness" value={analytics.mem.skew} color={Math.abs(analytics.mem.skew) > 1 ? "#F8312F" : Math.abs(analytics.mem.skew) > 0.5 ? "#FCD53F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>
                <Heading level={6}>Disk Free</Heading>
                <Flex gap={8} flexWrap="wrap">
                  <MetricCard label="Min" value={analytics.disk.min} unit="%" color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="P95" value={analytics.disk.p95} unit="%" color={analytics.disk.p95 >= 90 ? "#F8312F" : analytics.disk.p95 >= 80 ? "#FCD53F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="P99" value={analytics.disk.p99} unit="%" color={analytics.disk.p99 >= 90 ? "#F8312F" : analytics.disk.p99 >= 80 ? "#FCD53F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Max" value={analytics.disk.max} unit="%" color={analytics.disk.max >= 90 ? "#F8312F" : analytics.disk.max >= 80 ? "#FCD53F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Std Dev" value={analytics.disk.stdDev} color="#134FC9" bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="CV" value={analyticsExtras.disk.cv} color={analyticsExtras.disk.cv > 0.3 ? "#F8312F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                  <MetricCard label="Skewness" value={analytics.disk.skew} color={Math.abs(analytics.disk.skew) > 1 ? "#F8312F" : Math.abs(analytics.disk.skew) > 0.5 ? "#FCD53F" : "#00D26A"} bordered style={{ flex: 1, maxWidth: "none" }} />
                </Flex>
                <SectionHeader title={"\u00A0"} />
              </>
            )}
          </Flex>
        </Tab>
      </Tabs>
      </Flex>
    </Flex>
  );
};
