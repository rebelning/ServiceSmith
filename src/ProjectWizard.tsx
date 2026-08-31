import {
  Boxes,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Code2,
  Coffee,
  Database,
  FileCode2,
  Folder,
  FolderOutput,
  FolderTree,
  Gauge,
  Layers3,
  PackageCheck,
  ServerCog,
  Settings2,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { getDefinition } from './catalog';
import { DirectoryOutputError, selectDirectoryAndWriteProject } from './directoryWriter';
import { generateProjectFiles, getProjectFilePreview, type ProjectConfig, type ProjectStack } from './projectGenerator';
import type { CanvasNode, Edge } from './types';

type Props = {
  nodes: CanvasNode[];
  edges: Edge[];
  onClose: () => void;
};

const featureNames: Record<string, string> = {
  mysql: 'MySQL 数据源', redis: 'Redis 缓存', kafka: 'Kafka 消息', envoy: 'Envoy 代理',
  prometheus: 'Prometheus 指标', jaeger: 'Jaeger 链路', 'api-gateway': 'API 网关',
};

export default function ProjectWizard({ nodes, edges, onClose }: Props) {
  const serviceNodes = nodes.filter((node) => node.type === 'backend-service');
  const [step, setStep] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [outputPath, setOutputPath] = useState('');
  const [outputError, setOutputError] = useState('');
  const [config, setConfig] = useState<ProjectConfig>({
    stack: 'spring',
    projectName: '架构拓扑示例项目',
    prefix: 'servicesmith',
    description: '由 ServiceSmith 根据当前拓扑生成的后端项目模板。',
    selectedServiceIds: serviceNodes.map((node) => node.id),
    basePort: 8080,
    apiBasePath: '/api/v1',
    javaPackage: 'com.example.servicesmith',
    javaVersion: '21',
    springBootVersion: '3.3.5',
    buildTool: 'maven',
    goModule: 'github.com/example/servicesmith',
    goVersion: '1.22',
    databaseName: 'servicesmith',
    databaseUser: 'servicesmith',
    databasePassword: 'change-me',
    enableSwagger: true,
    enableCors: true,
    enableDocker: true,
    includeTopology: true,
    logLevel: 'INFO',
  });

  const update = <K extends keyof ProjectConfig>(key: K, value: ProjectConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }));
    setGenerated(false);
    setOutputPath('');
    setOutputError('');
  };

  const topologyFeatures = useMemo(() => {
    const supported = ['mysql', 'redis', 'kafka', 'envoy', 'prometheus', 'jaeger', 'api-gateway'];
    return supported.filter((type) => nodes.some((node) => node.type === type));
  }, [nodes]);

  const prefixValid = /^[a-z][a-z0-9-]{1,30}$/.test(config.prefix);
  const packageValid = config.stack === 'spring'
    ? /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(config.javaPackage)
    : /^[a-z0-9._-]+\.[a-z]{2,}\/[^\s]+$/i.test(config.goModule);
  const stepTwoValid = prefixValid && packageValid && config.projectName.trim().length > 1 && config.basePort > 0 && config.basePort < 65535;
  const preview = getProjectFilePreview(config, nodes);

  const setStack = (stack: ProjectStack) => {
    update('stack', stack);
    setGenerated(false);
  };

  const toggleService = (id: string) => {
    const current = config.selectedServiceIds;
    update('selectedServiceIds', current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const writeProjectToDirectory = async () => {
    if (!stepTwoValid) return;
    setGenerating(true);
    setOutputError('');
    try {
      const output = generateProjectFiles(config, nodes, edges);
      const result = await selectDirectoryAndWriteProject(output);
      setGenerated(true);
      setOutputPath(`${result.directoryName}/${result.projectDirectoryName} · ${result.fileCount} 个源码文件`);
    } catch (error) {
      setGenerated(false);
      if (error instanceof DirectoryOutputError) {
        if (error.code !== 'CANCELLED') setOutputError(error.message);
      } else {
        setOutputError(error instanceof Error ? error.message : '项目源码输出失败。');
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="wizard-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="project-wizard" role="dialog" aria-modal="true" aria-label="创建项目模板">
        <header className="wizard-header">
          <div className="wizard-title-icon"><FolderTree size={21} /></div>
          <div><span>PROJECT GENERATOR</span><h2>按照拓扑创建项目</h2><p>生成包含 Controller、Service、DAO 分层的实际工程模板</p></div>
          <button className="wizard-close" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="wizard-stepper">
          {[
            [1, '技术框架'], [2, '项目配置'], [3, '确认生成'],
          ].map(([number, label], index) => (
            <div className={`wizard-step ${step === number ? 'active' : ''} ${step > Number(number) ? 'done' : ''}`} key={String(number)}>
              <i>{step > Number(number) ? <Check size={12} /> : number}</i>
              <span>{label}</span>
              {index < 2 && <em />}
            </div>
          ))}
        </div>

        <div className="wizard-content">
          {step === 1 && (
            <div className="stack-step">
              <div className="wizard-section-heading"><span>01</span><div><h3>选择后端技术框架</h3><p>模板结构保持一致，运行环境和依赖会按框架自动生成。</p></div></div>
              <div className="stack-options">
                <button className={`stack-card ${config.stack === 'spring' ? 'selected' : ''}`} onClick={() => setStack('spring')}>
                  <div className="stack-logo spring"><Coffee size={30} /></div>
                  <div className="stack-choice-copy"><span>JAVA ECOSYSTEM</span><h4>Spring Boot</h4><p>适合企业服务、微服务和复杂领域业务，生成 Maven 多模块工程。</p></div>
                  <div className="stack-tags"><em>Java 21</em><em>Spring Web</em><em>Actuator</em></div>
                  <i className="select-check"><Check size={13} /></i>
                </button>
                <button className={`stack-card ${config.stack === 'iris' ? 'selected' : ''}`} onClick={() => setStack('iris')}>
                  <div className="stack-logo iris"><Code2 size={30} /></div>
                  <div className="stack-choice-copy"><span>GO ECOSYSTEM</span><h4>Golang Iris</h4><p>适合轻量高性能 API 服务，生成 Go Workspace 和独立服务模块。</p></div>
                  <div className="stack-tags"><em>Go 1.22</em><em>Iris v12</em><em>Go Work</em></div>
                  <i className="select-check"><Check size={13} /></i>
                </button>
              </div>
              <div className="layer-contract">
                <div><Layers3 size={18} /><span><strong>统一分层约定</strong><small>所有生成模块都包含以下三层</small></span></div>
                <div className="layer-flow"><b>Controller</b><ChevronRight size={13} /><b>Service</b><ChevronRight size={13} /><b>DAO</b></div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="config-step">
              <div className="wizard-config-main">
                <section className="wizard-form-section">
                  <div className="form-section-title"><Settings2 size={15} /><div><strong>基础信息</strong><span>项目命名和代码命名空间</span></div></div>
                  <div className="wizard-form-grid">
                    <label className="wide"><span>项目名称 <b>*</b></span><input value={config.projectName} onChange={(event) => update('projectName', event.target.value)} /></label>
                    <label><span>项目前缀 <b>*</b></span><input className={!prefixValid ? 'invalid' : ''} value={config.prefix} onChange={(event) => update('prefix', event.target.value.toLowerCase())} /><small>{prefixValid ? '用于模块名、容器名和配置前缀' : '小写字母开头，只允许字母、数字和短横线'}</small></label>
                    <label><span>{config.stack === 'spring' ? 'Java 基础包名' : 'Go Module 地址'} <b>*</b></span><input className={!packageValid ? 'invalid' : ''} value={config.stack === 'spring' ? config.javaPackage : config.goModule} onChange={(event) => config.stack === 'spring' ? update('javaPackage', event.target.value) : update('goModule', event.target.value)} /></label>
                    <label className="wide"><span>项目说明</span><textarea value={config.description} onChange={(event) => update('description', event.target.value)} /></label>
                  </div>
                </section>

                <section className="wizard-form-section">
                  <div className="form-section-title"><ServerCog size={15} /><div><strong>运行环境</strong><span>版本、端口与 API 约定</span></div></div>
                  <div className="wizard-form-grid three">
                    {config.stack === 'spring' ? <>
                      <label><span>Java 版本</span><select value={config.javaVersion} onChange={(event) => update('javaVersion', event.target.value)}><option>17</option><option>21</option></select></label>
                      <label><span>Spring Boot</span><select value={config.springBootVersion} onChange={(event) => update('springBootVersion', event.target.value)}><option>3.2.12</option><option>3.3.5</option><option>3.4.0</option></select></label>
                      <label><span>构建工具</span><select value={config.buildTool} onChange={(event) => update('buildTool', event.target.value as 'maven' | 'gradle')}><option value="maven">Maven</option><option value="gradle">Gradle</option></select></label>
                    </> : <>
                      <label><span>Go 版本</span><select value={config.goVersion} onChange={(event) => update('goVersion', event.target.value)}><option>1.21</option><option>1.22</option><option>1.23</option></select></label>
                      <label><span>Iris 版本</span><input value="v12" disabled /></label>
                    </>}
                    <label><span>起始端口</span><input type="number" min={1024} max={65000} value={config.basePort} onChange={(event) => update('basePort', Number(event.target.value))} /></label>
                    <label><span>API 基础路径</span><input value={config.apiBasePath} onChange={(event) => update('apiBasePath', event.target.value)} /></label>
                    <label><span>日志级别</span><select value={config.logLevel} onChange={(event) => update('logLevel', event.target.value as ProjectConfig['logLevel'])}><option>DEBUG</option><option>INFO</option><option>WARN</option><option>ERROR</option></select></label>
                  </div>
                </section>

                {nodes.some((node) => node.type === 'mysql') && (
                  <section className="wizard-form-section">
                    <div className="form-section-title"><Database size={15} /><div><strong>数据库配置</strong><span>从拓扑中的 MySQL 节点自动启用</span></div></div>
                    <div className="wizard-form-grid three">
                      <label><span>数据库名</span><input value={config.databaseName} onChange={(event) => update('databaseName', event.target.value)} /></label>
                      <label><span>用户名</span><input value={config.databaseUser} onChange={(event) => update('databaseUser', event.target.value)} /></label>
                      <label><span>开发密码</span><input type="password" value={config.databasePassword} onChange={(event) => update('databasePassword', event.target.value)} /></label>
                    </div>
                    <p className="security-hint"><ShieldCheck size={12} />密码只写入本地生成模板的示例环境变量，不会上传到服务器。</p>
                  </section>
                )}

                <section className="wizard-form-section">
                  <div className="form-section-title"><Gauge size={15} /><div><strong>基础能力</strong><span>项目常用的必要工程配置</span></div></div>
                  <div className="visual-toggles">
                    {[
                      ['enableDocker', 'Docker Compose', '生成服务及中间件启动编排'],
                      ['includeTopology', '拓扑清单', '将节点和连接写入 topology.json'],
                      ['enableSwagger', 'OpenAPI 文档', config.stack === 'spring' ? '集成 Springdoc Swagger UI' : '保留 API 文档目录'],
                      ['enableCors', '跨域配置', '生成开发环境 CORS 配置'],
                    ].map(([key, name, detail]) => (
                      <button className={(config[key as keyof ProjectConfig] ? 'on' : '')} key={key} onClick={() => update(key as keyof ProjectConfig, !config[key as keyof ProjectConfig] as never)}>
                        <i><Check size={11} /></i><span><strong>{name}</strong><small>{detail}</small></span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              <aside className="topology-mapping-panel">
                <div className="mapping-title"><Boxes size={15} /><div><strong>拓扑映射</strong><span>{nodes.length} 个节点 · {edges.length} 条连接</span></div></div>
                <div className="mapping-block"><span>服务模块</span>
                  {serviceNodes.length ? serviceNodes.map((node, index) => {
                    const selected = config.selectedServiceIds.includes(node.id);
                    return <button className={`service-map-item ${selected ? 'selected' : ''}`} key={node.id} onClick={() => toggleService(node.id)}><i>{selected && <Check size={10} />}</i><div><strong>{String(node.config.serviceName || getDefinition(node.type).name)}</strong><small>{config.prefix}-{String(node.config.serviceName || 'service').toLowerCase().replace(/\s+/g, '-')} · :{config.basePort + index}</small></div></button>;
                  }) : <div className="mapping-empty">没有后端服务节点，将生成一个默认应用模块。</div>}
                </div>
                <div className="mapping-block"><span>基础设施</span>
                  <div className="infra-map-list">
                    {topologyFeatures.length ? topologyFeatures.map((type) => <div key={type}><i style={{ '--infra-color': getDefinition(type).color } as React.CSSProperties}>{getDefinition(type).icon}</i><span><strong>{featureNames[type]}</strong><small>自动写入工程配置</small></span><Check size={11} /></div>) : <div className="mapping-empty">当前拓扑没有需要映射的基础设施节点。</div>}
                  </div>
                </div>
              </aside>
            </div>
          )}

          {step === 3 && (
            <div className="confirm-step">
              <div className="generation-summary">
                <div className={`summary-stack ${config.stack}`}><span>{config.stack === 'spring' ? <Coffee size={24} /> : <Code2 size={24} />}</span><div><small>生成技术栈</small><strong>{config.stack === 'spring' ? 'Java Spring Boot' : 'Golang Iris'}</strong><p>{config.stack === 'spring' ? `${config.javaPackage} · Java ${config.javaVersion}` : `${config.goModule} · Go ${config.goVersion}`}</p></div></div>
                <div className="summary-metric"><small>项目</small><strong>{config.projectName}</strong><span>{config.prefix}</span></div>
                <div className="summary-metric"><small>服务模块</small><strong>{preview.services.length}</strong><span>起始端口 {config.basePort}</span></div>
                <div className="summary-metric"><small>拓扑映射</small><strong>{topologyFeatures.length}</strong><span>基础设施能力</span></div>
              </div>

              <div className="preview-layout">
                <section className="file-preview">
                  <div className="preview-title"><FolderTree size={15} /><div><strong>工程文件预览</strong><span>将直接写入所选目录的源码结构</span></div></div>
                  <div className="file-tree">
                    <div className="tree-root"><Folder size={14} /><strong>{config.prefix}-{config.projectName.toLowerCase().replace(/\s+/g, '-')}</strong></div>
                    {preview.common.map((file) => <div className="tree-file level-one" key={file}><FileCode2 size={12} /><span>{file}</span></div>)}
                    {preview.services.map((service) => <div className="tree-service" key={service.id}>
                      <div><Folder size={13} /><strong>{service.moduleName}</strong><em>:{service.port}</em></div>
                      {preview.perService.map((file) => <span key={file}><FileCode2 size={10} />{file}</span>)}
                    </div>)}
                  </div>
                </section>

                <section className="generation-checks">
                  <div className="preview-title"><PackageCheck size={15} /><div><strong>生成检查</strong><span>模板包含的工程约定</span></div></div>
                  {[
                    'Controller、Service、DAO 三层代码已创建',
                    `${preview.services.length} 个服务模块从拓扑映射`,
                    `${topologyFeatures.length} 项基础设施配置已生成`,
                    config.enableDocker ? 'Dockerfile 与 Compose 编排已启用' : '未生成容器编排',
                    config.includeTopology ? '完整拓扑已写入 topology.json' : '未附加拓扑清单',
                    '环境变量示例与启动文档已创建',
                  ].map((item) => <div className="generation-check" key={item}><Check size={12} /><span>{item}</span></div>)}
                  <div className="local-generation-note"><ShieldCheck size={15} /><p><strong>直接写入你选择的目录</strong><span>系统会新建项目文件夹；如同名目录已存在则停止写入，保护已有源码。</span></p></div>
                </section>
              </div>

              {generated && <div className="generated-success"><Check size={16} /><span><strong>项目模板源码已成功输出</strong><small>{outputPath}</small></span></div>}
              {outputError && <div className="generated-error"><CircleAlert size={16} /><span><strong>无法输出项目源码</strong><small>{outputError}</small></span></div>}
            </div>
          )}
        </div>

        <footer className="wizard-footer">
          <div className="wizard-context"><Zap size={13} /><span>当前拓扑将生成 <strong>{preview.services.length}</strong> 个服务模块和 <strong>{topologyFeatures.length}</strong> 项基础设施配置</span></div>
          <div className="wizard-actions">
            {step > 1 && <button className="wizard-button secondary" onClick={() => setStep((current) => current - 1)}><ChevronLeft size={15} />上一步</button>}
            {step < 3 ? <button className="wizard-button primary" disabled={step === 2 && !stepTwoValid} onClick={() => setStep((current) => current + 1)}>下一步<ChevronRight size={15} /></button>
              : <button className="wizard-button generate" disabled={generating || !stepTwoValid} onClick={writeProjectToDirectory}>{generating ? <><i className="button-spinner" />正在写入…</> : <><FolderOutput size={15} />选择目录并创建项目</>}</button>}
          </div>
          {step === 2 && !stepTwoValid && <div className="wizard-error"><CircleAlert size={12} />请完善标红的必填配置</div>}
        </footer>
      </div>
    </div>
  );
}
