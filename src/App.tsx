import {
  Activity,
  BookOpen,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  CirclePlus,
  Clock3,
  ExternalLink,
  FolderPlus,
  GitBranch,
  Info,
  Link2,
  LockKeyhole,
  Pause,
  Play,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Unplug,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { categories, getDefinition, nodeCatalog } from './catalog';
import ProjectWizard from './ProjectWizard';
import type { CanvasNode, Edge, NodeDefinition } from './types';
import { validateNodeAddition } from './validation';

type InspectorTab = 'config' | 'guide' | 'principle';
type Toast = { kind: 'success' | 'error' | 'info'; title: string; detail?: string };

const starterNodes: CanvasNode[] = [
  { id: 'client-1', type: 'client', x: 54, y: 210, config: { ...getDefinition('client').defaults } },
  { id: 'gateway-1', type: 'api-gateway', x: 286, y: 210, config: { ...getDefinition('api-gateway').defaults } },
  { id: 'service-1', type: 'backend-service', x: 518, y: 122, config: { ...getDefinition('backend-service').defaults, serviceName: '订单服务' } },
  { id: 'redis-1', type: 'redis', x: 756, y: 76, config: { ...getDefinition('redis').defaults } },
  { id: 'mysql-1', type: 'mysql', x: 756, y: 252, config: { ...getDefinition('mysql').defaults } },
];

const starterEdges: Edge[] = [
  { id: 'e1', source: 'client-1', target: 'gateway-1', protocol: 'HTTP', mode: 'SYNC', timeout: 3000, retries: 0, description: '客户端请求进入网关' },
  { id: 'e2', source: 'gateway-1', target: 'service-1', protocol: 'HTTP', mode: 'SYNC', timeout: 1500, retries: 1, description: '网关路由到订单服务' },
  { id: 'e3', source: 'service-1', target: 'redis-1', protocol: 'CACHE', mode: 'SYNC', timeout: 100, retries: 0, description: '查询订单缓存' },
  { id: 'e4', source: 'service-1', target: 'mysql-1', protocol: 'SQL', mode: 'SYNC', timeout: 1000, retries: 0, description: '读取订单数据' },
];

const loadStored = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

function makeId(type: string) {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function inferProtocol(sourceType: string, targetType: string) {
  if (targetType === 'redis') return 'CACHE';
  if (targetType === 'mysql') return 'SQL';
  if (sourceType === 'kafka' || targetType === 'kafka' || targetType === 'consumer') return 'EVENT';
  if (targetType === 'prometheus') return 'METRICS';
  if (targetType === 'jaeger') return 'TRACE';
  if (sourceType === 'envoy' || targetType === 'envoy') return 'xDS / HTTP';
  return 'HTTP';
}

export default function App() {
  const [nodes, setNodes] = useState<CanvasNode[]>(() => loadStored('servicesmith:nodes', loadStored('flowlab:nodes', starterNodes)));
  const [edges, setEdges] = useState<Edge[]>(() => loadStored('servicesmith:edges', loadStored('flowlab:edges', starterEdges)));
  const [selectedId, setSelectedId] = useState<string | null>('service-1');
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string>('backend-service');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('config');
  const [connectionSource, setConnectionSource] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [runState, setRunState] = useState<'idle' | 'running' | 'paused'>('idle');
  const [activeRunNode, setActiveRunNode] = useState<string | null>(null);
  const [runLogs, setRunLogs] = useState<Array<{ time: number; title: string; detail: string }>>([]);
  const [showTimeline, setShowTimeline] = useState(true);
  const [showProjectWizard, setShowProjectWizard] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const runTimer = useRef<number | null>(null);
  const runQueue = useRef<string[]>([]);
  const runIndex = useRef(0);
  const runStart = useRef(0);
  const dragState = useRef<{ id: string; pointerId: number; offsetX: number; offsetY: number } | null>(null);

  const selectedNode = nodes.find((node) => node.id === selectedId) ?? null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedEdgeSource = selectedEdge ? nodes.find((node) => node.id === selectedEdge.source) ?? null : null;
  const selectedEdgeTarget = selectedEdge ? nodes.find((node) => node.id === selectedEdge.target) ?? null : null;
  const inspectedDefinition = getDefinition(selectedNode?.type ?? previewType);
  const inspectedValidation = validateNodeAddition(inspectedDefinition, nodes);

  useEffect(() => {
    localStorage.setItem('servicesmith:nodes', JSON.stringify(nodes));
    localStorage.setItem('servicesmith:edges', JSON.stringify(edges));
  }, [nodes, edges]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => () => {
    if (runTimer.current) window.clearTimeout(runTimer.current);
  }, []);

  const filteredCatalog = useMemo(() => {
    const query = search.trim().toLowerCase();
    return nodeCatalog.filter((definition) => {
      const categoryMatches = activeCategory === 'all' || definition.category === activeCategory;
      const textMatches = !query || [definition.name, definition.subtitle, ...definition.tags]
        .join(' ')
        .toLowerCase()
        .includes(query);
      return categoryMatches && textMatches;
    });
  }, [search, activeCategory]);

  const showToast = (next: Toast) => setToast(next);

  const addNode = (definition: NodeDefinition, point?: { x: number; y: number }) => {
    const result = validateNodeAddition(definition, nodes);
    setPreviewType(definition.type);
    setSelectedId(null);
    setSelectedEdgeId(null);
    if (!result.allowed) {
      showToast({ kind: 'error', title: `暂时不能添加 ${definition.name}`, detail: result.reasons.join(' ') });
      return false;
    }

    const cascade = nodes.filter((node) => node.type === definition.type).length;
    const nextNode: CanvasNode = {
      id: makeId(definition.type),
      type: definition.type,
      x: Math.max(16, Math.min(point?.x ?? 84 + cascade * 28, 900)),
      y: Math.max(16, Math.min(point?.y ?? 70 + cascade * 28, 470)),
      config: { ...definition.defaults },
    };
    setNodes((current) => [...current, nextNode]);
    setSelectedId(nextNode.id);
    setSelectedEdgeId(null);
    setInspectorTab('config');
    showToast({ kind: 'success', title: `${definition.name} 已添加`, detail: '已通过依赖与实例数量校验。' });
    return true;
  };

  const removeNode = (id: string) => {
    const node = nodes.find((item) => item.id === id);
    setNodes((current) => current.filter((item) => item.id !== id));
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedId(null);
    setSelectedEdgeId(null);
    setConnectionSource((source) => source === id ? null : source);
    if (node) showToast({ kind: 'info', title: `${getDefinition(node.type).name} 已移除`, detail: '相关连线已同步清理。' });
  };

  const updateConfig = (key: string, value: string | number | boolean) => {
    if (!selectedNode) return;
    setNodes((current) => current.map((node) => node.id === selectedNode.id
      ? { ...node, config: { ...node.config, [key]: value } }
      : node));
  };

  const updateEdge = (key: keyof Pick<Edge, 'protocol' | 'mode' | 'timeout' | 'retries' | 'description'>, value: string | number) => {
    if (!selectedEdge) return;
    setEdges((current) => current.map((edge) => edge.id === selectedEdge.id ? { ...edge, [key]: value } : edge));
  };

  const removeEdge = (id: string) => {
    const edge = edges.find((item) => item.id === id);
    if (!edge) return;
    const source = nodes.find((node) => node.id === edge.source);
    const target = nodes.find((node) => node.id === edge.target);
    setEdges((current) => current.filter((item) => item.id !== id));
    setSelectedEdgeId(null);
    showToast({
      kind: 'info',
      title: '连接已单独删除',
      detail: `${source ? getDefinition(source.type).name : '源节点'} → ${target ? getDefinition(target.type).name : '目标节点'}，两端节点均已保留。`,
    });
  };

  const startConnection = (id: string) => {
    setConnectionSource(id);
    setSelectedEdgeId(null);
    showToast({ kind: 'info', title: '请选择目标节点', detail: '点击另一个节点左侧的输入端口即可完成连线。' });
  };

  const finishConnection = (target: string) => {
    if (!connectionSource || connectionSource === target) return;
    const exists = edges.some((edge) => edge.source === connectionSource && edge.target === target);
    if (exists) {
      showToast({ kind: 'error', title: '连线已存在' });
      setConnectionSource(null);
      return;
    }
    const sourceNode = nodes.find((node) => node.id === connectionSource)!;
    const targetNode = nodes.find((node) => node.id === target)!;
    const nextEdge: Edge = {
      id: makeId('edge'),
      source: connectionSource,
      target,
      protocol: inferProtocol(sourceNode.type, targetNode.type),
      mode: sourceNode.type === 'kafka' || targetNode.type === 'consumer' ? 'ASYNC' : 'SYNC',
      timeout: 1000,
      retries: 0,
      description: '',
    };
    setEdges((current) => [...current, nextEdge]);
    setSelectedEdgeId(nextEdge.id);
    setSelectedId(null);
    setConnectionSource(null);
    showToast({ kind: 'success', title: '节点连接成功', detail: `${getDefinition(sourceNode.type).name} → ${getDefinition(targetNode.type).name}` });
  };

  const onCanvasDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/flow-node');
    if (!type || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    addNode(getDefinition(type), { x: event.clientX - rect.left - 88, y: event.clientY - rect.top - 42 });
  };

  const moveNode = (event: React.PointerEvent<HTMLDivElement>, id: string) => {
    const state = dragState.current;
    if (!state || state.id !== id || state.pointerId !== event.pointerId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(event.clientX - rect.left - state.offsetX, rect.width - 188));
    const y = Math.max(8, Math.min(event.clientY - rect.top - state.offsetY, rect.height - 98));
    setNodes((current) => current.map((node) => node.id === id ? { ...node, x, y } : node));
  };

  const buildRunQueue = () => {
    const start = nodes.find((node) => node.type === 'client')?.id ?? nodes[0]?.id;
    if (!start) return [];
    const result: string[] = [];
    const visited = new Set<string>();
    const queue = [start];
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      result.push(id);
      edges.filter((edge) => edge.source === id).forEach((edge) => queue.push(edge.target));
    }
    return result;
  };

  const runNext = () => {
    if (runIndex.current >= runQueue.current.length) {
      setRunState('idle');
      setActiveRunNode(null);
      showToast({ kind: 'success', title: '运行完成', detail: `共经过 ${runQueue.current.length} 个节点。` });
      return;
    }
    const id = runQueue.current[runIndex.current++];
    const node = nodes.find((item) => item.id === id);
    if (!node) return;
    const definition = getDefinition(node.type);
    const elapsed = Date.now() - runStart.current;
    setActiveRunNode(id);
    setRunLogs((current) => [...current, {
      time: elapsed,
      title: `${definition.name} 正在处理`,
      detail: definition.principles[0],
    }]);
    runTimer.current = window.setTimeout(runNext, 780);
  };

  const startRun = () => {
    if (runState === 'paused') {
      setRunState('running');
      runNext();
      return;
    }
    const queue = buildRunQueue();
    if (!queue.length) {
      showToast({ kind: 'error', title: '画布中还没有可运行节点' });
      return;
    }
    runQueue.current = queue;
    runIndex.current = 0;
    runStart.current = Date.now();
    setRunLogs([]);
    setShowTimeline(true);
    setRunState('running');
    runNext();
  };

  const pauseRun = () => {
    if (runTimer.current) window.clearTimeout(runTimer.current);
    setRunState('paused');
  };

  const resetProject = () => {
    setNodes(starterNodes.map((node) => ({ ...node, config: { ...node.config } })));
    setEdges(starterEdges.map((edge) => ({ ...edge })));
    setSelectedId('service-1');
    setSelectedEdgeId(null);
    setConnectionSource(null);
    setRunLogs([]);
    setActiveRunNode(null);
    showToast({ kind: 'info', title: '已恢复订单查询示例' });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><GitBranch size={20} /></div>
          <div>
            <div className="brand-name">ServiceSmith</div>
            <div className="brand-sub">Visual Backend Architecture Lab</div>
          </div>
          <span className="version-pill">MVP · 01</span>
        </div>
        <div className="project-title">
          <span className="live-dot" />
          订单查询架构实验
          <span className="saved-label"><Check size={12} /> 已自动保存</span>
        </div>
        <div className="top-actions">
          <button className="button ghost" onClick={resetProject}><RotateCcw size={15} /> 恢复示例</button>
          <button className="button project-create" onClick={() => setShowProjectWizard(true)}><FolderPlus size={15} /> 创建项目</button>
          {runState === 'running' ? (
            <button className="button primary" onClick={pauseRun}><Pause size={15} /> 暂停</button>
          ) : (
            <button className="button primary" onClick={startRun}><Play size={15} fill="currentColor" /> {runState === 'paused' ? '继续' : '运行工作流'}</button>
          )}
        </div>
      </header>

      <main className="workspace">
        <aside className="library-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">NODE LIBRARY</span>
              <h2>节点库</h2>
            </div>
            <span className="node-count">{nodeCatalog.length}</span>
          </div>
          <label className="search-box">
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索节点或技术…" />
            {search && <button onClick={() => setSearch('')}><X size={13} /></button>}
          </label>
          <div className="category-chips">
            <button className={activeCategory === 'all' ? 'active' : ''} onClick={() => setActiveCategory('all')}>全部</button>
            {categories.map((category) => (
              <button key={category.id} className={activeCategory === category.id ? 'active' : ''} onClick={() => setActiveCategory(category.id)}>{category.short}</button>
            ))}
          </div>
          <div className="catalog-scroll">
            {categories.map((category) => {
              const items = filteredCatalog.filter((definition) => definition.category === category.id);
              if (!items.length) return null;
              const isCollapsed = collapsed[category.id];
              return (
                <section className="catalog-group" key={category.id}>
                  <button className="group-title" onClick={() => setCollapsed((current) => ({ ...current, [category.id]: !current[category.id] }))}>
                    <span>{isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}{category.name}</span>
                    <em>{items.length}</em>
                  </button>
                  {!isCollapsed && <div className="catalog-items">
                    {items.map((definition) => {
                      const validation = validateNodeAddition(definition, nodes);
                      return (
                        <article
                          key={definition.type}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData('application/flow-node', definition.type);
                            event.dataTransfer.effectAllowed = 'copy';
                          }}
                          className={`catalog-card ${previewType === definition.type && !selectedNode ? 'selected' : ''} ${validation.allowed ? '' : 'locked'}`}
                          onClick={() => { setSelectedId(null); setSelectedEdgeId(null); setPreviewType(definition.type); setInspectorTab('config'); }}
                        >
                          <div className="catalog-icon" style={{ '--node-color': definition.color } as React.CSSProperties}>{definition.icon}</div>
                          <div className="catalog-copy">
                            <strong>{definition.name}</strong>
                            <span>{definition.subtitle}</span>
                            {!validation.allowed && <small><LockKeyhole size={10} /> {validation.reasons[0]}</small>}
                          </div>
                          <button
                            className="quick-add"
                            title={validation.allowed ? `添加 ${definition.name}` : validation.reasons[0]}
                            onClick={(event) => { event.stopPropagation(); addNode(definition); }}
                          >
                            {validation.allowed ? <CirclePlus size={17} /> : <LockKeyhole size={15} />}
                          </button>
                        </article>
                      );
                    })}
                  </div>}
                </section>
              );
            })}
            {!filteredCatalog.length && <div className="empty-search"><Search size={22} /><p>没有找到匹配节点</p></div>}
          </div>
          <div className="library-tip"><CircleHelp size={15} /><span>点击查看详情，或拖到画布添加。锁定节点会显示所缺依赖。</span></div>
        </aside>

        <section className="center-stage">
          <div className="canvas-toolbar">
            <div className="canvas-title"><Box size={15} /> 架构画布 <span>{nodes.length} 节点 · {edges.length} 连线</span></div>
            <div className="legend">
              <span><i className="legend-dot healthy" />可运行</span>
              <span><i className="legend-dot active" />执行中</span>
              {connectionSource && <button className="cancel-connect" onClick={() => setConnectionSource(null)}><Unplug size={13} /> 取消连线</button>}
            </div>
          </div>
          <div
            ref={canvasRef}
            className={`canvas ${connectionSource ? 'connecting' : ''}`}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
            onDrop={onCanvasDrop}
            onClick={(event) => { if (event.target === event.currentTarget) { setSelectedId(null); setSelectedEdgeId(null); } }}
          >
            <div className="canvas-grid" />
            <svg className="edge-layer" width="100%" height="100%">
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#58687b" />
                </marker>
              </defs>
              {edges.map((edge) => {
                const source = nodes.find((node) => node.id === edge.source);
                const target = nodes.find((node) => node.id === edge.target);
                if (!source || !target) return null;
                const x1 = source.x + 178;
                const y1 = source.y + 43;
                const x2 = target.x;
                const y2 = target.y + 43;
                const bend = Math.max(46, Math.abs(x2 - x1) * 0.45);
                const path = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
                const isActive = activeRunNode === edge.target;
                const isSelected = selectedEdgeId === edge.id;
                return (
                  <g key={edge.id} className={`edge ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}>
                    <path
                      className="edge-hit"
                      d={path}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedEdgeId(edge.id);
                        setSelectedId(null);
                        setConnectionSource(null);
                      }}
                    />
                    <path className="edge-line" d={path} markerEnd="url(#arrow)" />
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} className="edge-label">{edge.protocol}</text>
                  </g>
                );
              })}
            </svg>

            {nodes.map((node) => {
              const definition = getDefinition(node.type);
              const selected = selectedId === node.id;
              const active = activeRunNode === node.id;
              const displayName = String(node.config.serviceName || definition.name);
              return (
                <div
                  key={node.id}
                  className={`canvas-node ${selected ? 'selected' : ''} ${active ? 'running' : ''}`}
                  style={{ left: node.x, top: node.y, '--node-color': definition.color } as React.CSSProperties}
                  onClick={(event) => { event.stopPropagation(); setSelectedId(node.id); setSelectedEdgeId(null); setPreviewType(node.type); }}
                  onPointerDown={(event) => {
                    if ((event.target as HTMLElement).closest('button')) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    dragState.current = { id: node.id, pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => moveNode(event, node.id)}
                  onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); dragState.current = null; }}
                >
                  <button className="port input" title="连接到此节点" onClick={(event) => { event.stopPropagation(); finishConnection(node.id); }} />
                  <button className="port output" title="从此节点创建连线" onClick={(event) => { event.stopPropagation(); startConnection(node.id); }} />
                  <div className="node-topline" />
                  <div className="node-icon">{definition.icon}</div>
                  <div className="node-copy"><strong>{displayName}</strong><span>{definition.subtitle}</span></div>
                  <div className="node-health"><i /> READY</div>
                  {active && <div className="run-pulse"><Zap size={11} fill="currentColor" /> RUNNING</div>}
                </div>
              );
            })}

            {!nodes.length && (
              <div className="empty-canvas"><CirclePlus size={32} /><h3>从左侧添加第一个节点</h3><p>你可以点击“＋”，也可以直接拖入画布。</p></div>
            )}
            <div className="canvas-help"><Link2 size={13} /> 点击连线可在右侧单独配置或删除 · 使用节点两侧端口创建连接</div>
          </div>

          {showTimeline && (
            <div className="timeline-panel">
              <div className="timeline-head">
                <span><Activity size={15} /> 运行时间线</span>
                <div><em>{runState === 'running' ? 'LIVE' : runLogs.length ? 'COMPLETE' : 'WAITING'}</em><button onClick={() => setShowTimeline(false)}><X size={14} /></button></div>
              </div>
              <div className="timeline-body">
                {!runLogs.length ? (
                  <div className="timeline-empty"><Play size={15} /> 点击“运行工作流”，查看请求经过各节点时的技术过程。</div>
                ) : runLogs.map((log, index) => (
                  <div className="timeline-event" key={`${log.time}-${index}`}>
                    <span className="event-time">+{log.time}ms</span>
                    <i className={index === runLogs.length - 1 && runState === 'running' ? 'pulsing' : ''} />
                    <strong>{log.title}</strong>
                    <p>{log.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!showTimeline && <button className="open-timeline" onClick={() => setShowTimeline(true)}><Activity size={14} /> 展开运行时间线</button>}
        </section>

        <aside className="inspector-panel">
          {selectedEdge ? (
            <>
              <div className="inspector-head edge-inspector-head">
                <div className="inspector-icon edge-inspector-icon"><Link2 size={21} /></div>
                <div><span>SELECTED CONNECTION</span><h2>{selectedEdge.protocol} 连接</h2><p>{selectedEdge.mode ?? 'SYNC'} · 独立连接配置</p></div>
                <button className="delete-node" title="仅删除这条连接" onClick={() => removeEdge(selectedEdge.id)}><Trash2 size={16} /></button>
              </div>

              <div className="edge-summary">
                <div className="endpoint-card">
                  <small>SOURCE · 源节点</small>
                  <div>
                    <i style={{ '--endpoint-color': selectedEdgeSource ? getDefinition(selectedEdgeSource.type).color : '#68788a' } as React.CSSProperties} />
                    <strong>{selectedEdgeSource ? String(selectedEdgeSource.config.serviceName || getDefinition(selectedEdgeSource.type).name) : '节点不存在'}</strong>
                  </div>
                </div>
                <div className="edge-direction"><ChevronRight size={17} /></div>
                <div className="endpoint-card target">
                  <small>TARGET · 目标节点</small>
                  <div>
                    <i style={{ '--endpoint-color': selectedEdgeTarget ? getDefinition(selectedEdgeTarget.type).color : '#68788a' } as React.CSSProperties} />
                    <strong>{selectedEdgeTarget ? String(selectedEdgeTarget.config.serviceName || getDefinition(selectedEdgeTarget.type).name) : '节点不存在'}</strong>
                  </div>
                </div>
              </div>

              <div className="inspector-scroll edge-inspector-scroll">
                <section className="info-block compact">
                  <div className="section-label"><Info size={13} />连接说明</div>
                  <p>这是一条独立连接。修改或删除它只会影响当前这条调用关系，不会删除两端节点及它们的其他连接。</p>
                </section>

                <section className="config-section edge-config-section">
                  <div className="section-label"><Settings2 size={13} />连接配置</div>
                  <label className="config-field">
                    <span>通信协议</span>
                    <div className="field-control">
                      <select value={selectedEdge.protocol} onChange={(event) => updateEdge('protocol', event.target.value)}>
                        {['HTTP', 'HTTPS', 'gRPC', 'TCP', 'SQL', 'CACHE', 'EVENT', 'METRICS', 'TRACE', 'xDS / HTTP'].map((protocol) => <option key={protocol}>{protocol}</option>)}
                      </select>
                    </div>
                  </label>
                  <label className="config-field">
                    <span>调用模式</span>
                    <div className="field-control">
                      <select value={selectedEdge.mode ?? 'SYNC'} onChange={(event) => updateEdge('mode', event.target.value)}>
                        <option value="SYNC">同步调用</option>
                        <option value="ASYNC">异步调用</option>
                        <option value="STREAM">流式传输</option>
                      </select>
                    </div>
                  </label>
                  <label className="config-field">
                    <span>超时时间</span>
                    <div className="field-control">
                      <input type="number" min={0} value={selectedEdge.timeout ?? 1000} onChange={(event) => updateEdge('timeout', Number(event.target.value))} />
                      <em>ms</em>
                    </div>
                  </label>
                  <label className="config-field">
                    <span>失败重试</span>
                    <div className="field-control">
                      <input type="number" min={0} max={10} value={selectedEdge.retries ?? 0} onChange={(event) => updateEdge('retries', Number(event.target.value))} />
                      <em>次</em>
                    </div>
                  </label>
                  <label className="edge-description-field">
                    <span>用途备注</span>
                    <textarea
                      value={selectedEdge.description ?? ''}
                      placeholder="例如：网关将订单请求转发到订单服务"
                      onChange={(event) => updateEdge('description', event.target.value)}
                    />
                  </label>
                </section>

                <section className="connection-safety">
                  <div><CircleAlert size={15} /><strong>连接操作</strong></div>
                  <p>删除后无法通过界面撤销，但不会删除源节点、目标节点或其他连接。</p>
                  <button className="delete-edge-button" onClick={() => removeEdge(selectedEdge.id)}><Trash2 size={14} />仅删除当前连接</button>
                </section>
              </div>
            </>
          ) : (
            <>
          <div className="inspector-head">
            <div className="inspector-icon" style={{ '--node-color': inspectedDefinition.color } as React.CSSProperties}>{inspectedDefinition.icon}</div>
            <div><span>{selectedNode ? 'SELECTED NODE' : 'LIBRARY PREVIEW'}</span><h2>{selectedNode && selectedNode.config.serviceName ? String(selectedNode.config.serviceName) : inspectedDefinition.name}</h2><p>{inspectedDefinition.subtitle}</p></div>
            {selectedNode && <button className="delete-node" title="删除节点" onClick={() => removeNode(selectedNode.id)}><Trash2 size={16} /></button>}
          </div>

          <div className="inspector-tabs">
            <button className={inspectorTab === 'config' ? 'active' : ''} onClick={() => setInspectorTab('config')}><Settings2 size={14} />配置</button>
            <button className={inspectorTab === 'guide' ? 'active' : ''} onClick={() => setInspectorTab('guide')}><BookOpen size={14} />用法</button>
            <button className={inspectorTab === 'principle' ? 'active' : ''} onClick={() => setInspectorTab('principle')}><Sparkles size={14} />原理</button>
          </div>

          <div className="inspector-scroll">
            {!selectedNode && (
              <div className={`validation-card ${inspectedValidation.allowed ? 'allowed' : 'blocked'}`}>
                <div className="validation-title">
                  {inspectedValidation.allowed ? <Check size={16} /> : <CircleAlert size={16} />}
                  <strong>{inspectedValidation.allowed ? '可以添加此节点' : '当前不满足添加条件'}</strong>
                </div>
                {inspectedValidation.allowed
                  ? <p>依赖条件和实例数量校验均已通过。</p>
                  : <>{inspectedValidation.reasons.map((reason) => <p key={reason}>{reason}</p>)}{inspectedValidation.suggestions.map((suggestion) => <small key={suggestion}>{suggestion}</small>)}</>}
                <button className="button add-from-inspector" onClick={() => addNode(inspectedDefinition)}>
                  {inspectedValidation.allowed ? <CirclePlus size={15} /> : <LockKeyhole size={14} />}
                  添加到画布
                </button>
              </div>
            )}

            {inspectorTab === 'config' && (
              <>
                <section className="info-block compact">
                  <div className="section-label"><Info size={13} />节点说明</div>
                  <p>{inspectedDefinition.description}</p>
                  <div className="tag-row">{inspectedDefinition.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                </section>
                <section className="config-section">
                  <div className="section-label"><Settings2 size={13} />运行配置</div>
                  {!selectedNode && <div className="preview-note">添加节点后可以修改以下配置</div>}
                  {inspectedDefinition.configFields.map((field) => {
                    const value = selectedNode?.config[field.key] ?? inspectedDefinition.defaults[field.key];
                    return (
                      <label className="config-field" key={field.key}>
                        <span>{field.label}{field.help && <span className="help-mark" title={field.help}>?</span>}</span>
                        <div className="field-control">
                          {field.type === 'boolean' ? (
                            <button
                              disabled={!selectedNode}
                              className={`toggle ${value ? 'on' : ''}`}
                              onClick={() => updateConfig(field.key, !value)}
                            ><i /></button>
                          ) : field.type === 'select' ? (
                            <select disabled={!selectedNode} value={String(value)} onChange={(event) => updateConfig(field.key, event.target.value)}>
                              {field.options?.map((option) => <option key={option}>{option}</option>)}
                            </select>
                          ) : (
                            <input
                              disabled={!selectedNode}
                              type={field.type}
                              min={field.min}
                              max={field.max}
                              value={String(value)}
                              onChange={(event) => updateConfig(field.key, field.type === 'number' ? Number(event.target.value) : event.target.value)}
                            />
                          )}
                          {field.unit && <em>{field.unit}</em>}
                        </div>
                      </label>
                    );
                  })}
                </section>
              </>
            )}

            {inspectorTab === 'guide' && (
              <>
                <section className="info-block">
                  <div className="section-label"><BookOpen size={13} />推荐用法</div>
                  <ol>{inspectedDefinition.usage.map((item) => <li key={item}>{item}</li>)}</ol>
                </section>
                {inspectedDefinition.requirements?.length ? (
                  <section className="dependency-block">
                    <div className="section-label"><GitBranch size={13} />添加依赖</div>
                    {inspectedDefinition.requirements.map((requirement) => (
                      <div className="dependency-item" key={requirement.description}>
                        <span>{requirement.description}</span>
                        <div>{requirement.types.map((type) => <button key={type} onClick={() => { setSelectedId(null); setSelectedEdgeId(null); setPreviewType(type); }}>{getDefinition(type).name}</button>)}</div>
                      </div>
                    ))}
                  </section>
                ) : <div className="no-dependency"><Check size={15} />该节点没有前置依赖，可以直接添加。</div>}
                <section className="warning-block">
                  <div className="section-label"><CircleAlert size={13} />常见问题</div>
                  <ul>{inspectedDefinition.pitfalls.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
              </>
            )}

            {inspectorTab === 'principle' && (
              <>
                <section className="principle-hero">
                  <Sparkles size={17} />
                  <span>技术原理</span>
                  <h3>{inspectedDefinition.name} 是如何工作的？</h3>
                </section>
                <section className="info-block principle-list">
                  {inspectedDefinition.principles.map((item, index) => (
                    <div key={item}><span>{String(index + 1).padStart(2, '0')}</span><p>{item}</p></div>
                  ))}
                </section>
                <div className="runtime-explain"><Clock3 size={15} /><div><strong>运行时动态讲解</strong><p>工作流运行到此节点时，时间线会结合当前配置自动说明处理过程。</p></div></div>
                {inspectedDefinition.docs && <a className="docs-link" href={inspectedDefinition.docs} target="_blank" rel="noreferrer">查看官方技术文档 <ExternalLink size={14} /></a>}
              </>
            )}
          </div>
            </>
          )}
        </aside>
      </main>

      {toast && (
        <div className={`toast ${toast.kind}`}>
          <div>{toast.kind === 'success' ? <Check size={17} /> : toast.kind === 'error' ? <CircleAlert size={17} /> : <Info size={17} />}</div>
          <span><strong>{toast.title}</strong>{toast.detail && <p>{toast.detail}</p>}</span>
          <button onClick={() => setToast(null)}><X size={14} /></button>
        </div>
      )}
      {showProjectWizard && <ProjectWizard nodes={nodes} edges={edges} onClose={() => setShowProjectWizard(false)} />}
    </div>
  );
}
