import type { Language } from './i18n';
import type { CategoryId, NodeDefinition } from './types';

type EnglishNodeCopy = Pick<NodeDefinition, 'name' | 'description' | 'usage' | 'principles' | 'pitfalls' | 'tags'> & {
  requirements?: string[];
};

export const categoryCopy: Record<CategoryId, { en: string; zh: string; shortEn: string; shortZh: string }> = {
  entry: { en: 'Traffic Entry', zh: '流量入口', shortEn: 'Entry', shortZh: '入口' },
  service: { en: 'Application Services', zh: '应用服务', shortEn: 'Services', shortZh: '服务' },
  data: { en: 'Data Stores', zh: '数据存储', shortEn: 'Data', shortZh: '数据' },
  message: { en: 'Messaging', zh: '消息系统', shortEn: 'Events', shortZh: '消息' },
  governance: { en: 'Service Governance', zh: '服务治理', shortEn: 'Control', shortZh: '治理' },
  observability: { en: 'Observability', zh: '可观测性', shortEn: 'Observe', shortZh: '观测' },
};

const englishNodes: Record<string, EnglishNodeCopy> = {
  client: {
    name: 'Client',
    description: 'The starting point of a request, representing a browser, mobile app, IoT device, or external caller.',
    usage: ['Configure the request method, path, and payload.', 'Use it as the entry point of a runtime scenario.', 'Observe end-to-end latency.'],
    principles: ['Clients communicate with servers through HTTP, WebSocket, or RPC.', 'Retry, timeout, and idempotency policies directly affect backend load.'],
    pitfalls: ['Unbounded retries can amplify traffic.', 'Sensitive credentials should never be stored in plain text on a client.'],
    tags: ['HTTP', 'Entry', 'Request'],
  },
  'load-balancer': {
    name: 'Load Balancer',
    description: 'Distributes incoming traffic across service instances to improve throughput and availability.',
    usage: ['Place it between traffic entry and a service cluster.', 'Choose round-robin, least-connections, or hash routing.', 'Use health checks to remove unhealthy instances.'],
    principles: ['Layer 4 balancing routes connections, while Layer 7 balancing understands HTTP traffic.', 'Consistent hashing is useful for affinity and cache locality.'],
    pitfalls: ['A single load balancer may remain a single point of failure.', 'Sticky sessions can reduce balancing efficiency.'],
    tags: ['L4', 'L7', 'Traffic'],
  },
  'api-gateway': {
    name: 'API Gateway',
    description: 'A unified API entry point for routing, authentication, rate limiting, and protocol translation.',
    usage: ['Expose one entry point for backend services.', 'Route by path, host, or request header.', 'Apply authentication and rate limiting before service calls.'],
    principles: ['A gateway centralizes cross-cutting traffic concerns.', 'Business logic should remain in domain services.'],
    pitfalls: ['Incorrect limits may reject legitimate traffic.', 'A gateway outage can affect the entire system.'],
    tags: ['Routing', 'Auth', 'Rate limit'],
  },
  'backend-service': {
    name: 'Backend Service',
    description: 'An application service that owns domain logic and performs the main computation in a topology.',
    usage: ['Implement order, user, or product capabilities.', 'Receive synchronous API calls.', 'Access caches and databases or publish domain events.'],
    principles: ['Service boundaries should follow business capabilities.', 'Stateless services are easier to scale horizontally.'],
    pitfalls: ['Excessive splitting increases distributed-system complexity.', 'Long transactions across services are difficult to keep consistent.'],
    tags: ['REST', 'Domain', 'Microservice'],
  },
  'third-party': {
    name: 'Third-party API',
    description: 'A remote capability provided by another team or vendor, such as payment, messaging, or maps.',
    usage: ['Simulate latency and failure of external dependencies.', 'Validate retry, timeout, circuit-breaker, and fallback policies.'],
    principles: ['External dependencies are not under your control and must be isolated with timeouts.', 'Idempotency keys prevent repeated side effects during retries.'],
    pitfalls: ['Missing timeouts can exhaust worker threads.', 'Blindly retrying non-idempotent APIs is dangerous.'],
    tags: ['Payment', 'External', 'HTTP'],
  },
  mysql: {
    name: 'MySQL',
    description: 'A relational database providing transactions, indexes, and structured data relationships.',
    usage: ['Persist core business data.', 'Use transactions for local consistency.', 'Add indexes for frequent queries.'],
    principles: ['B+ tree indexes reduce disk access.', 'ACID transactions make data changes reliable.'],
    pitfalls: ['Missing indexes cause full-table scans.', 'Oversized connection pools can overload the database.'],
    tags: ['SQL', 'Transactions', 'Persistence'],
  },
  redis: {
    name: 'Redis',
    description: 'An in-memory data structure server commonly used for caching, counters, and distributed locks.',
    usage: ['Cache hot data between services and databases.', 'Configure an appropriate TTL.', 'Measure cache value through hit rate.'],
    principles: ['Memory access gives Redis very low latency.', 'Cache-aside makes the application responsible for loading and refreshing values.'],
    pitfalls: ['Protect against penetration, stampedes, and avalanches.', 'Cache and database values can become temporarily inconsistent.'],
    tags: ['Cache', 'Key-value', 'Performance'],
  },
  kafka: {
    name: 'Kafka',
    description: 'A distributed event-streaming platform for decoupling systems, asynchronous work, and event retention.',
    usage: ['Publish domain events from services.', 'Organize events with topics.', 'Use partitions for parallel throughput.'],
    principles: ['Append-only logs enable high throughput.', 'Within a consumer group, one partition is handled by one consumer at a time.'],
    pitfalls: ['At-least-once delivery requires idempotent consumers.', 'Partition count limits scalability and ordering guarantees.'],
    tags: ['Events', 'Async', 'Streaming'],
  },
  consumer: {
    name: 'Message Consumer',
    description: 'Consumes events from a messaging system and executes asynchronous business logic.',
    usage: ['Add Kafka before adding a consumer.', 'Use consumer groups for load sharing.', 'Use idempotency keys to handle duplicate messages.'],
    principles: ['Consumer offsets record processing progress.', 'A backlog grows when consumption is slower than production.'],
    pitfalls: ['Committing offsets too early can lose messages.', 'Failures need retry or dead-letter queues.'],
    tags: ['Consumer group', 'Async', 'Events'],
    requirements: ['A message consumer requires a messaging system. Add Kafka first.'],
  },
  envoy: {
    name: 'Envoy',
    description: 'A high-performance Layer 7 proxy used at the edge or as a sidecar for routing, retries, resilience, and telemetry.',
    usage: ['Add an API gateway, load balancer, or backend service as an upstream target.', 'Place Envoy in front of a service.', 'Configure upstream clusters, timeouts, and retries.'],
    principles: ['Envoy organizes traffic through listeners, filter chains, and clusters.', 'xDS APIs deliver routing and cluster configuration dynamically.'],
    pitfalls: ['Aggressive retries can amplify traffic.', 'Sidecars add resource and operational overhead.'],
    tags: ['Proxy', 'Sidecar', 'xDS', 'Service mesh'],
    requirements: ['Envoy needs an upstream target. Add a backend service, API gateway, or load balancer first.'],
  },
  'service-mesh': {
    name: 'Service Mesh Control Plane',
    description: 'A control plane for service-to-service traffic, security policies, and telemetry configuration.',
    usage: ['Add Envoy and at least two backend services first.', 'Use the control plane to distribute policies to data-plane proxies.'],
    principles: ['Data-plane proxies enforce traffic policies while the control plane distributes configuration.', 'mTLS provides identity and encryption between services.'],
    pitfalls: ['A mesh increases troubleshooting complexity.', 'A bad control-plane configuration can affect many services.'],
    tags: ['Mesh', 'mTLS', 'Traffic policy'],
    requirements: ['A service mesh requires Envoy as its data-plane proxy.', 'A service mesh needs at least two backend services.'],
  },
  'rate-limiter': {
    name: 'Rate Limiter',
    description: 'Limits requests over time to protect downstream services from bursts and overload.',
    usage: ['Use it with an API gateway or Envoy.', 'Choose token-bucket or sliding-window behavior.', 'Return a clear response for rejected traffic.'],
    principles: ['A token bucket allows controlled bursts.', 'Distributed rate limiting needs shared or approximately consistent counters.'],
    pitfalls: ['A low threshold can reject healthy traffic.', 'Edge-only limits do not isolate internal hotspots.'],
    tags: ['Rate limit', 'Resilience', 'Token bucket'],
    requirements: ['A rate limiter needs an API gateway or Envoy as its enforcement point.'],
  },
  prometheus: {
    name: 'Prometheus',
    description: 'Collects and queries time-series metrics for monitoring, alerting, and capacity analysis.',
    usage: ['Add at least one observable service.', 'Collect throughput, error, latency, and resource metrics.', 'Use rules to calculate aggregates.'],
    principles: ['Prometheus usually pulls metrics from targets.', 'High-cardinality labels create too many time series.'],
    pitfalls: ['Do not use user IDs as metric labels.', 'The monitoring system also needs high availability.'],
    tags: ['Metrics', 'Monitoring', 'Alerts'],
    requirements: ['Prometheus needs at least one observable service node.'],
  },
  jaeger: {
    name: 'Jaeger',
    description: 'Collects distributed traces to locate latency, errors, and service dependencies.',
    usage: ['Propagate a consistent trace ID between services.', 'Inspect span hierarchy and the critical path.', 'Use sampling to control storage cost.'],
    principles: ['A trace contains parent-child spans.', 'Context must propagate through synchronous calls and asynchronous messages.'],
    pitfalls: ['Low sampling can miss intermittent failures.', 'Sensitive business data should not be stored in span attributes.'],
    tags: ['Tracing', 'Spans', 'OpenTelemetry'],
    requirements: ['Jaeger needs at least one backend service to produce traces.'],
  },
};

const fieldEnglish: Record<string, { label: string; help?: string }> = {
  latency: { label: 'Base latency', help: 'Simulated base processing time for one request.' },
  concurrency: { label: 'Max concurrency' }, failureRate: { label: 'Failure rate' }, method: { label: 'Request method' },
  path: { label: 'Request path' }, timeout: { label: 'Timeout' }, strategy: { label: 'Strategy' },
  healthCheck: { label: 'Health checks' }, rateLimit: { label: 'Rate limit' }, auth: { label: 'Authentication' },
  serviceName: { label: 'Service name' }, replicas: { label: 'Replicas' }, poolSize: { label: 'Pool size' },
  transaction: { label: 'Transactions' }, hitRate: { label: 'Cache hit rate' }, ttl: { label: 'Default TTL' },
  partitions: { label: 'Partitions' }, throughput: { label: 'Production rate' }, acks: { label: 'Acknowledgements' },
  groupId: { label: 'Consumer group' }, rate: { label: 'Consumption rate' }, retry: { label: 'Failure retries' },
  mode: { label: 'Deployment mode' }, retries: { label: 'Retries' }, circuitBreaker: { label: 'Circuit breaker' },
  mtls: { label: 'Mutual TLS' }, sampling: { label: 'Trace sampling' }, algorithm: { label: 'Algorithm' },
  limit: { label: 'Request limit' }, interval: { label: 'Scrape interval' }, retention: { label: 'Retention' },
  propagation: { label: 'Context propagation' },
};

const unitEnglish: Record<string, string> = { 个: 'instances', 条: 'connections', 次: 'times', 天: 'days' };

export function localizeDefinition(definition: NodeDefinition, language: Language): NodeDefinition {
  if (language === 'zh') return definition;
  const copy = englishNodes[definition.type];
  if (!copy) return definition;
  return {
    ...definition,
    ...copy,
    requirements: definition.requirements?.map((requirement, index) => ({
      ...requirement,
      description: copy.requirements?.[index] ?? requirement.description,
    })),
    configFields: definition.configFields.map((field) => ({
      ...field,
      label: fieldEnglish[field.key]?.label ?? field.label,
      help: fieldEnglish[field.key]?.help ?? field.help,
      unit: field.unit ? unitEnglish[field.unit] ?? field.unit : undefined,
    })),
  };
}
