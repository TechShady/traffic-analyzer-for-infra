/**
/* Automatically generated code for test_nonrunning.dql
*/
import { queryExecutionClient, QueryStartResponse } from '@dynatrace-sdk/client-query';

export function getQueryString(){
  return `smartscapeNodes K8S_POD
| parse k8s.object, "JSON:config"
| fieldsAdd phase = config[\`status\`][\`phase\`]
| filter phase != "Running" and phase != "Succeeded"
| fields k8s.cluster.name, k8s.namespace.name, k8s.pod.name, phase
| limit 10`;
}

export async function runQuery(): Promise<QueryStartResponse> {
  return await queryExecutionClient.queryExecute({body: { query: getQueryString(), requestTimeoutMilliseconds: 30000 }});
}