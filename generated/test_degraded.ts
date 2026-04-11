/**
/* Automatically generated code for test_degraded.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `smartscapeNodes K8S_DEPLOYMENT
| parse k8s.object, "JSON:config"
| fieldsAdd desired = config[\`spec\`][\`replicas\`], ready = config[\`status\`][\`readyReplicas\`]
| filter isNotNull(desired) and (isNull(ready) or ready < desired)
| fields k8s.cluster.name, k8s.namespace.name, k8s.workload.name, desired, ready
| limit 10`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}