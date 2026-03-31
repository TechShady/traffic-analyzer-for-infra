import React, { useState, useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Strong } from "@dynatrace/strato-components/typography";
import { SingleValue } from "@dynatrace/strato-components-preview/charts";
import { CategoricalBarChart } from "@dynatrace/strato-components-preview/charts";
import { GaugeChart } from "@dynatrace/strato-components-preview/charts";
import { Select } from "@dynatrace/strato-components-preview/forms";
import { DataTable } from "@dynatrace/strato-components-preview/tables";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import { useDql } from "@dynatrace-sdk/react-hooks";
import {
  hostListQuery,
  trafficLoadQuery,
  cpuStatsQuery,
  memoryStatsQuery,
  diskStatsQuery,
  cpuByHostQuery,
  memoryByHostQuery,
  diskByHostQuery,
  forecast,
} from "../queries";

const TRAFFIC_CHANGE_OPTIONS = [
  0, 1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75,
  80, 85, 90, 95, 100, 110, 120, 130, 140, 150, 200, 250, 300, 350, 400, 450,
  500, 600, 700, 800, 900, 1000, 2000, 3000, 4000, 5000,
];

const PROVISION_GOAL = 80;
const TOP_N = 100;

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

function extractField(records: Array<Record<string, unknown>> | null | undefined, field: string): number {
  if (!records || records.length === 0) return 0;
  const val = records[0][field];
  return typeof val === "number" ? val : 0;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Surface style={{ padding: "8px 16px", background: "var(--dt-colors-charts-categorical-color-01-default, #134fc9)", borderRadius: 4 }}>
      <Heading level={5} style={{ color: "#fff", margin: 0 }}>{title}</Heading>
    </Surface>
  );
}

function SubHeader({ title }: { title: string }) {
  return (
    <Surface style={{ padding: "4px 12px", background: "var(--dt-colors-charts-categorical-color-01-default, #134fc9)", borderRadius: 4 }}>
      <Strong style={{ color: "#fff" }}>{title}</Strong>
    </Surface>
  );
}

function MetricCard({ label, value, unit, color }: { label: string; value: number; unit?: string; color: string }) {
  return (
    <Flex style={{ flex: "1 1 180px", minWidth: 160, maxWidth: 280 }}>
      <SingleValue data={round(value)} label={label} unit={unit} color={color} />
    </Flex>
  );
}

function LoadingState() {
  return (
    <Flex justifyContent="center" padding={32}>
      <ProgressCircle />
    </Flex>
  );
}

export const Home = () => {
  const [selectedHosts, setSelectedHosts] = useState<string[]>([]);
  const [trafficChangePercent, setTrafficChangePercent] = useState<number>(0);

  // Fetch host list for filter
  const hostList = useDql({ query: hostListQuery() });
  const hostOptions: string[] = useMemo(() => {
    if (!hostList.data?.records) return [];
    const rec = hostList.data.records[0];
    if (!rec) return [];
    const arr = rec["distinctHostNames"];
    return Array.isArray(arr) ? arr.filter((h): h is string => typeof h === "string") : [];
  }, [hostList.data]);

  const activeHosts = selectedHosts.length > 0 ? selectedHosts : hostOptions;

  // Core metric queries
  const trafficLoad = useDql({ query: trafficLoadQuery(activeHosts) });
  const cpuStats = useDql({ query: cpuStatsQuery(activeHosts) });
  const memStats = useDql({ query: memoryStatsQuery(activeHosts) });
  const diskStats = useDql({ query: diskStatsQuery(activeHosts) });

  // Table queries
  const cpuByHost = useDql({ query: cpuByHostQuery(activeHosts, TOP_N) });
  const memByHost = useDql({ query: memoryByHostQuery(activeHosts, TOP_N) });
  const diskByHost = useDql({ query: diskByHostQuery(activeHosts, TOP_N) });

  const isLoading = trafficLoad.isLoading || cpuStats.isLoading || memStats.isLoading || diskStats.isLoading;

  // Extract observed values
  const traffic = useMemo(() => {
    const r = trafficLoad.data?.records;
    return {
      median: extractField(r, "Traffic.Median"),
      low: extractField(r, "Traffic.AvgLowerThanMedian"),
      high: extractField(r, "Traffic.AvgHigherThanMedian"),
      change: extractField(r, "Traffic.PercentChange"),
    };
  }, [trafficLoad.data]);

  const cpu = useMemo(() => ({
    low: extractField(cpuStats.data?.records, "cpuUsage.AvgLowerThanMedian"),
    avg: extractField(cpuStats.data?.records, "cpuUsage.Median"),
    high: extractField(cpuStats.data?.records, "cpuUsage.AvgHigherThanMedian"),
    change: extractField(cpuStats.data?.records, "cpuUsage.PercentChange"),
  }), [cpuStats.data]);

  const memory = useMemo(() => ({
    low: extractField(memStats.data?.records, "memoryUsage.AvgLowerThanMedian"),
    avg: extractField(memStats.data?.records, "memoryUsage.Median"),
    high: extractField(memStats.data?.records, "memoryUsage.AvgHigherThanMedian"),
    change: extractField(memStats.data?.records, "memoryUsage.PercentChange"),
  }), [memStats.data]);

  const disk = useMemo(() => ({
    low: extractField(diskStats.data?.records, "diskUsage.AvgLowerThanMedian"),
    avg: extractField(diskStats.data?.records, "diskUsage.Median"),
    high: extractField(diskStats.data?.records, "diskUsage.AvgHigherThanMedian"),
    change: extractField(diskStats.data?.records, "diskUsage.PercentChange"),
  }), [diskStats.data]);

  // Forecasted values
  const cpuForecast = useMemo(() => forecast(cpu, trafficChangePercent, traffic.change), [cpu, trafficChangePercent, traffic.change]);
  const memForecast = useMemo(() => forecast(memory, trafficChangePercent, traffic.change), [memory, trafficChangePercent, traffic.change]);
  const diskForecast = useMemo(() => forecast(disk, trafficChangePercent, traffic.change), [disk, trafficChangePercent, traffic.change]);

  // Provisioning
  const cpuProvisioning = PROVISION_GOAL - cpuForecast.high;
  const memProvisioning = PROVISION_GOAL - memForecast.high;
  const diskProvisioning = PROVISION_GOAL - diskForecast.high;

  // Bar chart data
  const cpuBarData = useMemo(() => [
    { category: "Observed Low", value: round(cpu.low), color: "#134FC9" },
    { category: "Observed Average", value: round(cpu.avg), color: "#134FC9" },
    { category: "Observed High", value: round(cpu.high), color: "#134FC9" },
    { category: "Forecast Low", value: round(cpuForecast.low), color: "#00D26A" },
    { category: "Forecast Average", value: round(cpuForecast.avg), color: "#00D26A" },
    { category: "Forecast High", value: round(cpuForecast.high), color: "#00D26A" },
  ], [cpu, cpuForecast]);

  const memBarData = useMemo(() => [
    { category: "Observed Low", value: round(memory.low), color: "#134FC9" },
    { category: "Observed Average", value: round(memory.avg), color: "#134FC9" },
    { category: "Observed High", value: round(memory.high), color: "#134FC9" },
    { category: "Forecast Low", value: round(memForecast.low), color: "#00D26A" },
    { category: "Forecast Average", value: round(memForecast.avg), color: "#00D26A" },
    { category: "Forecast High", value: round(memForecast.high), color: "#00D26A" },
  ], [memory, memForecast]);

  const diskBarData = useMemo(() => [
    { category: "Observed Low", value: round(disk.low), color: "#134FC9" },
    { category: "Observed Average", value: round(disk.avg), color: "#134FC9" },
    { category: "Observed High", value: round(disk.high), color: "#134FC9" },
    { category: "Forecast Low", value: round(diskForecast.low), color: "#00D26A" },
    { category: "Forecast Average", value: round(diskForecast.avg), color: "#00D26A" },
    { category: "Forecast High", value: round(diskForecast.high), color: "#00D26A" },
  ], [disk, diskForecast]);

  // Table data with forecasted columns
  const cpuTableData = useMemo(() => {
    if (!cpuByHost.data?.records) return [];
    return cpuByHost.data.records.map((r) => {
      const obs = { low: num(r["Observed CPU Low"]), avg: num(r["Observed CPU Avg"]), high: num(r["Observed CPU High"]), change: num(r["cpuUsage.PercentChange"]) };
      const fc = forecast(obs, trafficChangePercent, traffic.change);
      return { "Host Name": r["Host Name"] as string, "Observed CPU Low": round(obs.low), "Observed CPU Avg": round(obs.avg), "Observed CPU High": round(obs.high), "Forecasted Low CPU": round(fc.low), "Forecasted Avg CPU": round(fc.avg), "Forecasted High CPU": round(fc.high), Provisioning: round(PROVISION_GOAL - fc.high) };
    });
  }, [cpuByHost.data, trafficChangePercent, traffic.change]);

  const memTableData = useMemo(() => {
    if (!memByHost.data?.records) return [];
    return memByHost.data.records.map((r) => {
      const obs = { low: num(r["Observed MEM Low"]), avg: num(r["Observed MEM Avg"]), high: num(r["Observed MEM High"]), change: num(r["memUsage.PercentChange"]) };
      const fc = forecast(obs, trafficChangePercent, traffic.change);
      return { "Host Name": r["Host Name"] as string, "Observed MEM Low": round(obs.low), "Observed MEM Avg": round(obs.avg), "Observed MEM High": round(obs.high), "Forecasted Low MEM": round(fc.low), "Forecasted Avg MEM": round(fc.avg), "Forecasted High MEM": round(fc.high), Provisioning: round(PROVISION_GOAL - fc.high) };
    });
  }, [memByHost.data, trafficChangePercent, traffic.change]);

  const diskTableData = useMemo(() => {
    if (!diskByHost.data?.records) return [];
    return diskByHost.data.records.map((r) => {
      const obs = { low: num(r["Observed Disk Free Low"]), avg: num(r["Observed Disk Free Avg"]), high: num(r["Observed Disk Free High"]), change: num(r["diskFree.PercentChange"]) };
      const fc = forecast(obs, trafficChangePercent, traffic.change);
      return { "Host Name": r["Host Name"] as string, "Observed Disk Free Low": round(obs.low), "Observed Disk Free Avg": round(obs.avg), "Observed Disk Free High": round(obs.high), "Forecasted Low Disk Free": round(fc.low), "Forecasted Avg Disk Free": round(fc.avg), "Forecasted High Disk Free": round(fc.high), Provisioning: round(PROVISION_GOAL - fc.high) };
    });
  }, [diskByHost.data, trafficChangePercent, traffic.change]);

  const cpuColumns = useMemo(() => [
    { id: "hostName", header: "Host Name", accessor: "Host Name" },
    { id: "obsLow", header: "Observed CPU Low", accessor: "Observed CPU Low" },
    { id: "obsAvg", header: "Observed CPU Avg", accessor: "Observed CPU Avg" },
    { id: "obsHigh", header: "Observed CPU High", accessor: "Observed CPU High" },
    { id: "fcLow", header: "Forecasted Low CPU", accessor: "Forecasted Low CPU" },
    { id: "fcAvg", header: "Forecasted Avg CPU", accessor: "Forecasted Avg CPU" },
    { id: "fcHigh", header: "Forecasted High CPU", accessor: "Forecasted High CPU" },
    { id: "prov", header: "Provisioning", accessor: "Provisioning" },
  ], []);

  const memColumns = useMemo(() => [
    { id: "hostName", header: "Host Name", accessor: "Host Name" },
    { id: "obsLow", header: "Observed MEM Low", accessor: "Observed MEM Low" },
    { id: "obsAvg", header: "Observed MEM Avg", accessor: "Observed MEM Avg" },
    { id: "obsHigh", header: "Observed MEM High", accessor: "Observed MEM High" },
    { id: "fcLow", header: "Forecasted Low MEM", accessor: "Forecasted Low MEM" },
    { id: "fcAvg", header: "Forecasted Avg MEM", accessor: "Forecasted Avg MEM" },
    { id: "fcHigh", header: "Forecasted High MEM", accessor: "Forecasted High MEM" },
    { id: "prov", header: "Provisioning", accessor: "Provisioning" },
  ], []);

  const diskColumns = useMemo(() => [
    { id: "hostName", header: "Host Name", accessor: "Host Name" },
    { id: "obsLow", header: "Observed Disk Free Low", accessor: "Observed Disk Free Low" },
    { id: "obsAvg", header: "Observed Disk Free Avg", accessor: "Observed Disk Free Avg" },
    { id: "obsHigh", header: "Observed Disk Free High", accessor: "Observed Disk Free High" },
    { id: "fcLow", header: "Forecasted Low Disk Free", accessor: "Forecasted Low Disk Free" },
    { id: "fcAvg", header: "Forecasted Avg Disk Free", accessor: "Forecasted Avg Disk Free" },
    { id: "fcHigh", header: "Forecasted High Disk Free", accessor: "Forecasted High Disk Free" },
    { id: "prov", header: "Provisioning", accessor: "Provisioning" },
  ], []);

  return (
    <Flex flexDirection="column" padding={16} gap={16}>
      {/* Filters */}
      <Flex gap={16} alignItems="flex-end" flexWrap="wrap">
        <Flex flexDirection="column" gap={4} style={{ minWidth: 300 }}>
          <Strong>Host</Strong>
          <Select<string, true>
            multiple
            value={selectedHosts}
            onChange={(val) => setSelectedHosts(val ?? [])}
          >
            <Select.Content>
              {hostOptions.map((h) => (
                <Select.Option key={h} value={h}>{h}</Select.Option>
              ))}
            </Select.Content>
          </Select>
        </Flex>
        <Flex flexDirection="column" gap={4} style={{ minWidth: 200 }}>
          <Strong>Traffic Change %</Strong>
          <Select<number>
            value={trafficChangePercent}
            onChange={(val) => setTrafficChangePercent(val ?? 0)}
          >
            <Select.Content>
              {TRAFFIC_CHANGE_OPTIONS.map((v) => (
                <Select.Option key={v} value={v}>{v}%</Select.Option>
              ))}
            </Select.Content>
          </Select>
        </Flex>
      </Flex>

      {isLoading && <LoadingState />}

      {/* Section 1: Observed Traffic Analysis */}
      <SectionHeader title="Observed Traffic Analysis" />
      <Flex gap={8} flexWrap="wrap">
        <MetricCard label="Traffic Change" value={traffic.change} unit="%" color={getChangeColor(traffic.change)} />
        <MetricCard label="CPU Change" value={cpu.change} unit="%" color={getChangeColor(cpu.change)} />
        <MetricCard label="Memory Change" value={memory.change} unit="%" color={getChangeColor(memory.change)} />
        <MetricCard label="Disk Free Change" value={disk.change} unit="%" color={getChangeColor(disk.change)} />
      </Flex>

      {/* Section 2: Forecast High */}
      <SectionHeader title="Forecast High" />
      <Flex gap={16} flexWrap="wrap">
        <Flex flexDirection="column" gap={8} style={{ flex: "1 1 200px", minWidth: 200 }}>
          <Heading level={6}>CPU</Heading>
          <MetricCard label="% Change" value={cpuForecast.percentChange} unit="%" color={getChangeColor(cpuForecast.percentChange)} />
          <GaugeChart value={round(cpuForecast.high)} max={100} unit="percent" height={180}>
            <GaugeChart.Label>CPU</GaugeChart.Label>
            <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={0} color="#2a7453" />
            <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={80} color="#a9780f" />
            <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={90} color="#ae132d" />
          </GaugeChart>
          <MetricCard label="CPU Provisioning" value={cpuProvisioning} unit="%" color={getProvisioningColor(cpuProvisioning)} />
        </Flex>
        <Flex flexDirection="column" gap={8} style={{ flex: "1 1 200px", minWidth: 200 }}>
          <Heading level={6}>Memory</Heading>
          <MetricCard label="% Change" value={memForecast.percentChange} unit="%" color={getChangeColor(memForecast.percentChange)} />
          <GaugeChart value={round(memForecast.high)} max={100} unit="percent" height={180}>
            <GaugeChart.Label>Memory</GaugeChart.Label>
            <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={0} color="#2a7453" />
            <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={80} color="#a9780f" />
            <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={90} color="#ae132d" />
          </GaugeChart>
          <MetricCard label="Memory Provisioning" value={memProvisioning} unit="%" color={getProvisioningColor(memProvisioning)} />
        </Flex>
        <Flex flexDirection="column" gap={8} style={{ flex: "1 1 200px", minWidth: 200 }}>
          <Heading level={6}>Disk Free</Heading>
          <MetricCard label="% Change" value={diskForecast.percentChange} unit="%" color={getChangeColor(diskForecast.percentChange)} />
          <GaugeChart value={round(diskForecast.high)} max={100} unit="percent" height={180}>
            <GaugeChart.Label>Disk Free</GaugeChart.Label>
            <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={0} color="#2a7453" />
            <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={80} color="#a9780f" />
            <GaugeChart.ColorRule comparator="greater-or-equal" matchValue={90} color="#ae132d" />
          </GaugeChart>
          <MetricCard label="Disk Provisioning" value={diskProvisioning} unit="%" color={getProvisioningColor(diskProvisioning)} />
        </Flex>
      </Flex>

      {/* Section 3: Forecast Breakdown */}
      <SectionHeader title="Forecast Breakdown" />
      <Flex flexDirection="column" gap={16}>
        <Heading level={6}>CPU Observed (Blue) vs Forecast (Green)</Heading>
        <CategoricalBarChart data={cpuBarData} height={250}>
          <CategoricalBarChart.Legend hidden />
          <CategoricalBarChart.ValueAxis label="%" />
          <CategoricalBarChart.ThresholdIndicator data={{ value: 80 }} color="#FCD53F" />
          <CategoricalBarChart.ThresholdIndicator data={{ value: 90 }} color="#F8312F" />
        </CategoricalBarChart>

        <Heading level={6}>Memory Observed (Blue) vs Forecast (Green)</Heading>
        <CategoricalBarChart data={memBarData} height={250}>
          <CategoricalBarChart.Legend hidden />
          <CategoricalBarChart.ValueAxis label="%" />
          <CategoricalBarChart.ThresholdIndicator data={{ value: 80 }} color="#FCD53F" />
          <CategoricalBarChart.ThresholdIndicator data={{ value: 90 }} color="#F8312F" />
        </CategoricalBarChart>

        <Heading level={6}>Disk Free Observed (Blue) vs Forecast (Green)</Heading>
        <CategoricalBarChart data={diskBarData} height={250}>
          <CategoricalBarChart.Legend hidden />
          <CategoricalBarChart.ValueAxis label="%" />
          <CategoricalBarChart.ThresholdIndicator data={{ value: 80 }} color="#FCD53F" />
          <CategoricalBarChart.ThresholdIndicator data={{ value: 90 }} color="#F8312F" />
        </CategoricalBarChart>
      </Flex>

      {/* Section 4: Metrics */}
      <SectionHeader title="Metrics" />
      <SubHeader title="Observed" />
      <Heading level={6}>Traffic</Heading>
      <Flex gap={8} flexWrap="wrap">
        <MetricCard label="Low Traffic Average" value={traffic.low} color="#134FC9" />
        <MetricCard label="Traffic Average" value={traffic.median} color="#134FC9" />
        <MetricCard label="High Traffic Average" value={traffic.high} color="#134FC9" />
        <MetricCard label="Traffic Change" value={traffic.change} unit="%" color={getChangeColor(traffic.change)} />
      </Flex>
      <Heading level={6}>CPU</Heading>
      <Flex gap={8} flexWrap="wrap">
        <MetricCard label="CPU Low" value={cpu.low} unit="%" color={getResourceColor(cpu.low)} />
        <MetricCard label="CPU Avg" value={cpu.avg} unit="%" color={getResourceColor(cpu.avg)} />
        <MetricCard label="CPU High" value={cpu.high} unit="%" color={getResourceColor(cpu.high)} />
        <MetricCard label="CPU Change" value={cpu.change} unit="%" color={getChangeColor(cpu.change)} />
      </Flex>
      <Heading level={6}>Memory</Heading>
      <Flex gap={8} flexWrap="wrap">
        <MetricCard label="Memory Low" value={memory.low} unit="%" color={getResourceColor(memory.low)} />
        <MetricCard label="Memory Avg" value={memory.avg} unit="%" color={getResourceColor(memory.avg)} />
        <MetricCard label="Memory High" value={memory.high} unit="%" color={getResourceColor(memory.high)} />
        <MetricCard label="Memory Change" value={memory.change} unit="%" color={getChangeColor(memory.change)} />
      </Flex>
      <Heading level={6}>Disk Free</Heading>
      <Flex gap={8} flexWrap="wrap">
        <MetricCard label="Disk Free Low" value={disk.low} unit="%" color={getResourceColor(disk.low)} />
        <MetricCard label="Disk Free Avg" value={disk.avg} unit="%" color={getResourceColor(disk.avg)} />
        <MetricCard label="Disk Free High" value={disk.high} unit="%" color={getResourceColor(disk.high)} />
        <MetricCard label="Disk Free Change" value={disk.change} unit="%" color={getChangeColor(disk.change)} />
      </Flex>

      <SubHeader title="Forecast" />
      <Heading level={6}>Traffic</Heading>
      <Flex gap={8} flexWrap="wrap">
        <MetricCard label="Traffic Average" value={traffic.median + traffic.median * (trafficChangePercent / 100)} color="#134FC9" />
        <MetricCard label="Traffic Change" value={traffic.median * (trafficChangePercent / 100)} color="#134FC9" />
        <MetricCard label="Traffic Change %" value={trafficChangePercent} unit="%" color="#134FC9" />
      </Flex>
      <Heading level={6}>CPU</Heading>
      <Flex gap={8} flexWrap="wrap">
        <MetricCard label="CPU Low" value={cpuForecast.low} unit="%" color={getResourceColor(cpuForecast.low)} />
        <MetricCard label="CPU Avg" value={cpuForecast.avg} unit="%" color={getResourceColor(cpuForecast.avg)} />
        <MetricCard label="CPU High" value={cpuForecast.high} unit="%" color={getResourceColor(cpuForecast.high)} />
        <MetricCard label="% Change" value={cpuForecast.percentChange} unit="%" color={getChangeColor(cpuForecast.percentChange)} />
      </Flex>
      <Heading level={6}>Memory</Heading>
      <Flex gap={8} flexWrap="wrap">
        <MetricCard label="Memory Low" value={memForecast.low} unit="%" color={getResourceColor(memForecast.low)} />
        <MetricCard label="Memory Avg" value={memForecast.avg} unit="%" color={getResourceColor(memForecast.avg)} />
        <MetricCard label="Memory High" value={memForecast.high} unit="%" color={getResourceColor(memForecast.high)} />
        <MetricCard label="% Change" value={memForecast.percentChange} unit="%" color={getChangeColor(memForecast.percentChange)} />
      </Flex>
      <Heading level={6}>Disk Free</Heading>
      <Flex gap={8} flexWrap="wrap">
        <MetricCard label="Disk Free Low" value={diskForecast.low} unit="%" color={getResourceColor(diskForecast.low)} />
        <MetricCard label="Disk Free Avg" value={diskForecast.avg} unit="%" color={getResourceColor(diskForecast.avg)} />
        <MetricCard label="Disk Free High" value={diskForecast.high} unit="%" color={getResourceColor(diskForecast.high)} />
        <MetricCard label="% Change" value={diskForecast.percentChange} unit="%" color={getChangeColor(diskForecast.percentChange)} />
      </Flex>

      {/* Section 5: Top N Impacted Entities */}
      <SectionHeader title={`Top ${TOP_N} Impacted Entities`} />

      <Heading level={6}>CPU % by Host</Heading>
      {cpuByHost.isLoading ? <LoadingState /> : (
        <DataTable data={cpuTableData} columns={cpuColumns} sortable>
          <DataTable.Pagination defaultPageSize={10} />
        </DataTable>
      )}

      <Heading level={6}>Memory % by Host</Heading>
      {memByHost.isLoading ? <LoadingState /> : (
        <DataTable data={memTableData} columns={memColumns} sortable>
          <DataTable.Pagination defaultPageSize={10} />
        </DataTable>
      )}

      <Heading level={6}>Disk Free % by Host</Heading>
      {diskByHost.isLoading ? <LoadingState /> : (
        <DataTable data={diskTableData} columns={diskColumns} sortable>
          <DataTable.Pagination defaultPageSize={10} />
        </DataTable>
      )}
    </Flex>
  );
};
