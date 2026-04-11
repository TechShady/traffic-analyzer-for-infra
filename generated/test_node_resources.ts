/**
/* Automatically generated code for test_node_resources.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `timeseries {
  cpu_alloc = avg(dt.kubernetes.node.cpu_allocatable),
  mem_alloc = avg(dt.kubernetes.node.memory_allocatable)
}, by: {k8s.cluster.name}
| fieldsAdd avg_cpu = arrayAvg(cpu_alloc), avg_mem = arrayAvg(mem_alloc)
| fields k8s.cluster.name, avg_cpu, avg_mem
| sort avg_cpu desc
| limit 5`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}