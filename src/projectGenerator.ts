import { getDefinition } from './catalog';
import type { CanvasNode, Edge } from './types';

class ProjectFileTree {
  private readonly files = new Map<string, string>();

  file(path: string, content: string) {
    this.files.set(path.replace(/^\/+/, ''), content);
  }

  toRecord() {
    return Object.fromEntries(this.files);
  }
}

export type ProjectStack = 'spring' | 'iris';

export type ProjectConfig = {
  stack: ProjectStack;
  projectName: string;
  prefix: string;
  description: string;
  selectedServiceIds: string[];
  basePort: number;
  apiBasePath: string;
  javaPackage: string;
  javaVersion: string;
  springBootVersion: string;
  buildTool: 'maven' | 'gradle';
  goModule: string;
  goVersion: string;
  databaseName: string;
  databaseUser: string;
  databasePassword: string;
  enableSwagger: boolean;
  enableCors: boolean;
  enableDocker: boolean;
  includeTopology: boolean;
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
};

type ServiceDescriptor = {
  id: string;
  name: string;
  slug: string;
  className: string;
  moduleName: string;
  port: number;
};

const safeSlug = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
  .replace(/[\u4e00-\u9fa5]/g, '')
  .replace(/^-+|-+$/g, '') || 'service';

const className = (value: string) => safeSlug(value)
  .split('-')
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join('') || 'Application';

const javaIdentifier = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '') || 'app';

function getServices(config: ProjectConfig, nodes: CanvasNode[]): ServiceDescriptor[] {
  const selected = nodes.filter((node) => node.type === 'backend-service' && config.selectedServiceIds.includes(node.id));
  const source = selected.length ? selected : [{ id: 'generated-service', type: 'backend-service', x: 0, y: 0, config: { serviceName: config.projectName } }];
  return source.map((node, index) => {
    const name = String(node.config.serviceName || `服务 ${index + 1}`);
    const slug = safeSlug(name);
    return {
      id: node.id,
      name,
      slug,
      className: className(slug),
      moduleName: `${config.prefix}-${slug}`,
      port: config.basePort + index,
    };
  });
}

function topologyFeatures(nodes: CanvasNode[]) {
  const has = (type: string) => nodes.some((node) => node.type === type);
  return {
    mysql: has('mysql'),
    redis: has('redis'),
    kafka: has('kafka'),
    envoy: has('envoy'),
    prometheus: has('prometheus'),
    jaeger: has('jaeger'),
    gateway: has('api-gateway'),
  };
}

function addCommonFiles(zip: ProjectFileTree, config: ProjectConfig, nodes: CanvasNode[], edges: Edge[], services: ServiceDescriptor[]) {
  const features = topologyFeatures(nodes);
  if (config.includeTopology) {
    zip.file('topology.json', JSON.stringify({
      project: { name: config.projectName, prefix: config.prefix, stack: config.stack },
      generatedAt: new Date().toISOString(),
      nodes: nodes.map((node) => ({ ...node, definition: getDefinition(node.type)?.name ?? node.type })),
      edges,
    }, null, 2));
  }

  zip.file('.env.example', [
    `PROJECT_PREFIX=${config.prefix}`,
    `LOG_LEVEL=${config.logLevel}`,
    features.mysql ? `DB_NAME=${config.databaseName}` : '',
    features.mysql ? `DB_USER=${config.databaseUser}` : '',
    features.mysql ? `DB_PASSWORD=${config.databasePassword}` : '',
    features.redis ? 'REDIS_HOST=localhost' : '',
    features.kafka ? 'KAFKA_BROKERS=localhost:9092' : '',
  ].filter(Boolean).join('\n') + '\n');

  zip.file('README.md', `# ${config.projectName}

${config.description || '由 ServiceSmith 根据架构拓扑生成的项目模板。'}

## 技术栈

- ${config.stack === 'spring' ? `Java ${config.javaVersion} / Spring Boot ${config.springBootVersion}` : `Go ${config.goVersion} / Iris v12`}
- 分层结构：Controller → Service → DAO
- 服务模块：${services.map((service) => service.moduleName).join('、')}
- 拓扑能力：${Object.entries(features).filter(([, enabled]) => enabled).map(([name]) => name).join('、') || '基础服务'}

## 服务端口

${services.map((service) => `- ${service.name}: ${service.port}`).join('\n')}

## 启动

${config.stack === 'spring'
    ? config.buildTool === 'maven'
      ? `\`\`\`bash\nmvn clean package\njava -jar ${services[0].moduleName}/target/*.jar\n\`\`\``
      : `\`\`\`bash\ngradle build\ngradle :${services[0].moduleName}:bootRun\n\`\`\``
    : `\`\`\`bash\ngo work sync\ngo run ./${services[0].moduleName}/cmd/server\n\`\`\``}

如启用了容器配置，可执行：

\`\`\`bash
docker compose up --build
\`\`\`
`);

  if (config.enableDocker) zip.file('docker-compose.yml', dockerCompose(config, services, features));
  if (features.envoy) zip.file('infra/envoy/envoy.yaml', envoyConfig(services));
  if (features.prometheus) zip.file('infra/prometheus/prometheus.yml', prometheusConfig(services, config.stack));
}

function dockerCompose(config: ProjectConfig, services: ServiceDescriptor[], features: ReturnType<typeof topologyFeatures>) {
  const blocks: string[] = ['services:'];
  services.forEach((service) => {
    blocks.push(`  ${service.moduleName}:
    build:${config.stack === 'spring' ? `
      context: .
      dockerfile: ${service.moduleName}/Dockerfile` : ` ./${service.moduleName}`}
    ports:
      - "${service.port}:${service.port}"
    environment:
      SERVER_PORT: ${service.port}
      LOG_LEVEL: \${LOG_LEVEL:-${config.logLevel}}${features.mysql ? `
      DB_HOST: mysql
      DB_NAME: \${DB_NAME:-${config.databaseName}}
      DB_USER: \${DB_USER:-${config.databaseUser}}
      DB_PASSWORD: \${DB_PASSWORD:-${config.databasePassword}}` : ''}${features.redis ? '\n      REDIS_HOST: redis' : ''}${features.kafka ? '\n      KAFKA_BROKERS: kafka:9092' : ''}
${features.mysql || features.redis || features.kafka ? `    depends_on:${features.mysql ? '\n+      - mysql' : ''}${features.redis ? '\n+      - redis' : ''}${features.kafka ? '\n+      - kafka' : ''}` : ''}`);
  });
  if (features.mysql) blocks.push(`  mysql:
    image: mysql:8.4
    environment:
      MYSQL_DATABASE: \${DB_NAME:-${config.databaseName}}
      MYSQL_USER: \${DB_USER:-${config.databaseUser}}
      MYSQL_PASSWORD: \${DB_PASSWORD:-${config.databasePassword}}
      MYSQL_ROOT_PASSWORD: \${DB_PASSWORD:-${config.databasePassword}}
    ports:
      - "3306:3306"
    volumes:
      - mysql-data:/var/lib/mysql`);
  if (features.redis) blocks.push(`  redis:
    image: redis:7.4-alpine
    ports:
      - "6379:6379"`);
  if (features.kafka) blocks.push(`  kafka:
    image: bitnami/kafka:3.7
    ports:
      - "9092:9092"
    environment:
      KAFKA_CFG_NODE_ID: 0
      KAFKA_CFG_PROCESS_ROLES: controller,broker
      KAFKA_CFG_CONTROLLER_QUORUM_VOTERS: 0@kafka:9093
      KAFKA_CFG_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_CFG_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_CFG_CONTROLLER_LISTENER_NAMES: CONTROLLER`);
  if (features.envoy) blocks.push(`  envoy:
    image: envoyproxy/envoy:v1.31-latest
    ports:
      - "10000:10000"
    volumes:
      - ./infra/envoy/envoy.yaml:/etc/envoy/envoy.yaml:ro
    depends_on:
${services.map((service) => `      - ${service.moduleName}`).join('\n')}`);
  if (features.prometheus) blocks.push(`  prometheus:
    image: prom/prometheus:v2.54.1
    ports:
      - "9090:9090"
    volumes:
      - ./infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro`);
  if (features.mysql) blocks.push('volumes:\n  mysql-data:');
  return blocks.join('\n') + '\n';
}

function envoyConfig(services: ServiceDescriptor[]) {
  return `static_resources:
  listeners:
    - name: ingress
      address:
        socket_address: { address: 0.0.0.0, port_value: 10000 }
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: ingress_http
                route_config:
                  name: local_route
                  virtual_hosts:
                    - name: services
                      domains: ["*"]
                      routes:
${services.map((service) => `                        - match: { prefix: "/${service.slug}" }
                          route: { cluster: ${service.moduleName}, timeout: 3s }`).join('\n')}
                http_filters:
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router
  clusters:
${services.map((service) => `    - name: ${service.moduleName}
      connect_timeout: 1s
      type: STRICT_DNS
      load_assignment:
        cluster_name: ${service.moduleName}
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address: { address: ${service.moduleName}, port_value: ${service.port} }`).join('\n')}
`;
}

function prometheusConfig(services: ServiceDescriptor[], stack: ProjectStack) {
  return `global:
  scrape_interval: 15s
scrape_configs:
${services.map((service) => `  - job_name: ${service.moduleName}
    metrics_path: ${stack === 'spring' ? '/actuator/prometheus' : '/metrics'}
    static_configs:
      - targets: ["${service.moduleName}:${service.port}"]`).join('\n')}
`;
}

function addSpringProject(zip: ProjectFileTree, config: ProjectConfig, nodes: CanvasNode[], services: ServiceDescriptor[]) {
  const features = topologyFeatures(nodes);
  const modules = services.map((service) => service.moduleName);
  if (config.buildTool === 'maven') zip.file('pom.xml', `<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <groupId>${config.javaPackage}</groupId>
  <artifactId>${config.prefix}-parent</artifactId>
  <version>0.1.0-SNAPSHOT</version>
  <packaging>pom</packaging>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>${config.springBootVersion}</version>
    <relativePath/>
  </parent>
  <properties><java.version>${config.javaVersion}</java.version></properties>
  <modules>${modules.map((module) => `\n    <module>${module}</module>`).join('')}\n  </modules>
</project>
`);
  else {
    zip.file('settings.gradle', `rootProject.name = '${config.prefix}-parent'\n${modules.map((module) => `include '${module}'`).join('\n')}\n`);
    zip.file('build.gradle', `plugins {
    id 'org.springframework.boot' version '${config.springBootVersion}' apply false
    id 'io.spring.dependency-management' version '1.1.6' apply false
}

allprojects {
    group = '${config.javaPackage}'
    version = '0.1.0-SNAPSHOT'
    repositories { mavenCentral() }
}

subprojects {
    apply plugin: 'java'
    apply plugin: 'org.springframework.boot'
    apply plugin: 'io.spring.dependency-management'
    java { toolchain { languageVersion = JavaLanguageVersion.of(${config.javaVersion}) } }
    tasks.named('test') { useJUnitPlatform() }
}
`);
  }

  services.forEach((service) => {
    const root = service.moduleName;
    const servicePackage = `${config.javaPackage}.${javaIdentifier(service.slug)}`;
    const packagePath = servicePackage.replaceAll('.', '/');
    if (config.buildTool === 'maven') zip.file(`${root}/pom.xml`, springModulePom(config, service, features));
    else zip.file(`${root}/build.gradle`, springModuleGradle(config, features));
    zip.file(`${root}/src/main/java/${packagePath}/${service.className}Application.java`, `package ${servicePackage};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ${service.className}Application {
    public static void main(String[] args) {
        SpringApplication.run(${service.className}Application.class, args);
    }
}
`);
    zip.file(`${root}/src/main/java/${packagePath}/controller/SystemController.java`, `package ${servicePackage}.controller;

import ${servicePackage}.service.SystemService;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("${config.apiBasePath}/${service.slug}")
public class SystemController {
    private final SystemService service;
    public SystemController(SystemService service) { this.service = service; }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() { return ResponseEntity.ok(service.status()); }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> find(@PathVariable @NotBlank String id) {
        return ResponseEntity.ok(service.findById(id));
    }
}
`);
    zip.file(`${root}/src/main/java/${packagePath}/service/SystemService.java`, `package ${servicePackage}.service;

import ${servicePackage}.dao.SystemDao;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class SystemService {
    private final SystemDao dao;
    public SystemService(SystemDao dao) { this.dao = dao; }
    public Map<String, Object> findById(String id) { return dao.findById(id); }
    public Map<String, Object> status() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("service", "${service.name}");
        result.put("status", "UP");
        result.put("time", Instant.now().toString());
        return result;
    }
}
`);
    zip.file(`${root}/src/main/java/${packagePath}/dao/SystemDao.java`, `package ${servicePackage}.dao;

import java.util.Map;

public interface SystemDao {
    Map<String, Object> findById(String id);
}
`);
    zip.file(`${root}/src/main/java/${packagePath}/dao/DefaultSystemDao.java`, `package ${servicePackage}.dao;

import org.springframework.stereotype.Repository;
import java.util.LinkedHashMap;
import java.util.Map;

@Repository
public class DefaultSystemDao implements SystemDao {
    @Override
    public Map<String, Object> findById(String id) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", id);
        result.put("source", "dao");
        return result;
    }
}
`);
    if (config.enableCors) zip.file(`${root}/src/main/java/${packagePath}/config/WebConfig.java`, `package ${servicePackage}.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**").allowedOrigins("http://localhost:3000").allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS");
    }
}
`);
    zip.file(`${root}/src/main/resources/application.yml`, springApplicationYaml(config, service, features));
    zip.file(`${root}/src/test/java/${packagePath}/${service.className}ApplicationTests.java`, `package ${servicePackage};

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class ${service.className}ApplicationTests {
    @Test void contextLoads() { }
}
`);
    if (config.enableSwagger) zip.file(`${root}/src/main/resources/static/openapi-notes.md`, `# OpenAPI\n\n启动服务后访问 /swagger-ui.html 查看接口文档。\n`);
    if (config.enableDocker) zip.file(`${root}/Dockerfile`, config.buildTool === 'maven' ? `FROM maven:3.9-eclipse-temurin-${config.javaVersion} AS build
WORKDIR /src
COPY . .
RUN mvn -pl ${service.moduleName} -am package -DskipTests
FROM eclipse-temurin:${config.javaVersion}-jre
WORKDIR /app
COPY --from=build /src/${service.moduleName}/target/*.jar app.jar
EXPOSE ${service.port}
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
` : `FROM gradle:8.10-jdk${config.javaVersion} AS build
WORKDIR /src
COPY . .
RUN gradle :${service.moduleName}:bootJar --no-daemon
FROM eclipse-temurin:${config.javaVersion}-jre
WORKDIR /app
COPY --from=build /src/${service.moduleName}/build/libs/*.jar app.jar
EXPOSE ${service.port}
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
`);
  });
}

function springModulePom(config: ProjectConfig, service: ServiceDescriptor, features: ReturnType<typeof topologyFeatures>) {
  const dependencies = [
    ['org.springframework.boot', 'spring-boot-starter-web'],
    ['org.springframework.boot', 'spring-boot-starter-validation'],
    ['org.springframework.boot', 'spring-boot-starter-actuator'],
    ...(features.mysql ? [['org.springframework.boot', 'spring-boot-starter-data-jpa'], ['com.mysql', 'mysql-connector-j', 'runtime']] : []),
    ...(features.redis ? [['org.springframework.boot', 'spring-boot-starter-data-redis']] : []),
    ...(features.kafka ? [['org.springframework.kafka', 'spring-kafka']] : []),
    ...(features.prometheus ? [['io.micrometer', 'micrometer-registry-prometheus']] : []),
    ...(config.enableSwagger ? [['org.springdoc', 'springdoc-openapi-starter-webmvc-ui', '2.6.0']] : []),
    ['org.springframework.boot', 'spring-boot-starter-test', 'test'],
  ];
  return `<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent><groupId>${config.javaPackage}</groupId><artifactId>${config.prefix}-parent</artifactId><version>0.1.0-SNAPSHOT</version></parent>
  <artifactId>${service.moduleName}</artifactId>
  <dependencies>
${dependencies.map(([group, artifact, scope]) => `    <dependency><groupId>${group}</groupId><artifactId>${artifact}</artifactId>${scope === 'runtime' || scope === 'test' ? `<scope>${scope}</scope>` : scope ? `<version>${scope}</version>` : ''}</dependency>`).join('\n')}
  </dependencies>
  <build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build>
</project>
`;
}

function springModuleGradle(config: ProjectConfig, features: ReturnType<typeof topologyFeatures>) {
  const dependencies = [
    "implementation 'org.springframework.boot:spring-boot-starter-web'",
    "implementation 'org.springframework.boot:spring-boot-starter-validation'",
    "implementation 'org.springframework.boot:spring-boot-starter-actuator'",
    ...(features.mysql ? ["implementation 'org.springframework.boot:spring-boot-starter-data-jpa'", "runtimeOnly 'com.mysql:mysql-connector-j'"] : []),
    ...(features.redis ? ["implementation 'org.springframework.boot:spring-boot-starter-data-redis'"] : []),
    ...(features.kafka ? ["implementation 'org.springframework.kafka:spring-kafka'"] : []),
    ...(features.prometheus ? ["runtimeOnly 'io.micrometer:micrometer-registry-prometheus'"] : []),
    ...(config.enableSwagger ? ["implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:2.6.0'"] : []),
    "testImplementation 'org.springframework.boot:spring-boot-starter-test'",
  ];
  return `dependencies {\n${dependencies.map((dependency) => `    ${dependency}`).join('\n')}\n}\n`;
}

function springApplicationYaml(config: ProjectConfig, service: ServiceDescriptor, features: ReturnType<typeof topologyFeatures>) {
  return `server:
  port: \${SERVER_PORT:${service.port}}
spring:
  application:
    name: ${service.moduleName}${features.mysql ? `
  datasource:
    url: jdbc:mysql://\${DB_HOST:localhost}:3306/\${DB_NAME:${config.databaseName}}?useSSL=false&serverTimezone=UTC
    username: \${DB_USER:${config.databaseUser}}
    password: \${DB_PASSWORD:${config.databasePassword}}
  jpa:
    open-in-view: false
    hibernate:
      ddl-auto: validate` : ''}${features.redis ? `
  data:
    redis:
      host: \${REDIS_HOST:localhost}
      port: 6379` : ''}${features.kafka ? `
  kafka:
    bootstrap-servers: \${KAFKA_BROKERS:localhost:9092}` : ''}
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics${features.prometheus ? ',prometheus' : ''}
logging:
  level:
    root: \${LOG_LEVEL:${config.logLevel}}
`;
}

function addIrisProject(zip: ProjectFileTree, config: ProjectConfig, nodes: CanvasNode[], services: ServiceDescriptor[]) {
  const features = topologyFeatures(nodes);
  zip.file('go.work', `go ${config.goVersion}\n\nuse (\n${services.map((service) => `\t./${service.moduleName}`).join('\n')}\n)\n`);
  services.forEach((service) => {
    const root = service.moduleName;
    const modulePath = `${config.goModule}/${service.moduleName}`;
    zip.file(`${root}/go.mod`, `module ${modulePath}\n\ngo ${config.goVersion}\n\nrequire github.com/kataras/iris/v12 v12.2.11\n`);
    zip.file(`${root}/cmd/server/main.go`, `package main

import (
    "fmt"
    "os"
    "${modulePath}/internal/controller"
    "${modulePath}/internal/dao"
    "${modulePath}/internal/service"
    "github.com/kataras/iris/v12"
)

func main() {
    app := iris.New()
    app.Use(iris.Compression)${config.enableCors ? `
    app.UseRouter(func(ctx iris.Context) {
        ctx.Header("Access-Control-Allow-Origin", "http://localhost:3000")
        ctx.Header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        ctx.Header("Access-Control-Allow-Headers", "Content-Type,Authorization")
        if ctx.Method() == iris.MethodOptions { ctx.StatusCode(iris.StatusNoContent); return }
        ctx.Next()
    })` : ''}
    repository := dao.NewSystemDAO()
    systemService := service.NewSystemService(repository, "${service.name}")
    systemController := controller.NewSystemController(systemService)
    systemController.Register(app.Party("${config.apiBasePath}/${service.slug}"))
    port := env("SERVER_PORT", "${service.port}")
    app.Listen(fmt.Sprintf(":%s", port))
}

func env(key, fallback string) string {
    if value := os.Getenv(key); value != "" { return value }
    return fallback
}
`);
    zip.file(`${root}/internal/controller/system_controller.go`, `package controller

import (
    "${modulePath}/internal/service"
    "github.com/kataras/iris/v12"
)

type SystemController struct { service *service.SystemService }
func NewSystemController(s *service.SystemService) *SystemController { return &SystemController{service: s} }
func (c *SystemController) Register(api iris.Party) {
    api.Get("/health", c.health)
    api.Get("/{id:string}", c.findByID)
}
func (c *SystemController) health(ctx iris.Context) { ctx.JSON(c.service.Status()) }
func (c *SystemController) findByID(ctx iris.Context) { ctx.JSON(c.service.FindByID(ctx.Params().Get("id"))) }
`);
    zip.file(`${root}/internal/service/system_service.go`, `package service

import (
    "time"
    "${modulePath}/internal/dao"
)

type SystemService struct { dao dao.SystemDAO; name string }
func NewSystemService(repository dao.SystemDAO, name string) *SystemService { return &SystemService{dao: repository, name: name} }
func (s *SystemService) FindByID(id string) map[string]any { return s.dao.FindByID(id) }
func (s *SystemService) Status() map[string]any {
    return map[string]any{"service": s.name, "status": "UP", "time": time.Now().UTC()}
}
`);
    zip.file(`${root}/internal/dao/system_dao.go`, `package dao

type SystemDAO interface { FindByID(id string) map[string]any }
type memorySystemDAO struct{}
func NewSystemDAO() SystemDAO { return &memorySystemDAO{} }
func (d *memorySystemDAO) FindByID(id string) map[string]any {
    return map[string]any{"id": id, "source": "dao"}
}
`);
    zip.file(`${root}/internal/model/system.go`, `package model

type SystemRecord struct {
    ID string \`json:"id"\`
    Source string \`json:"source"\`
}
`);
    zip.file(`${root}/config/config.yaml`, `server:\n  port: ${service.port}\n  basePath: ${config.apiBasePath}\nlog:\n  level: ${config.logLevel}${features.mysql ? `\ndatabase:\n  driver: mysql\n  host: \${DB_HOST:localhost}\n  name: \${DB_NAME:${config.databaseName}}` : ''}${features.redis ? '\nredis:\n  host: ${REDIS_HOST:localhost}\n  port: 6379' : ''}${features.kafka ? '\nkafka:\n  brokers: ${KAFKA_BROKERS:localhost:9092}' : ''}\n`);
    if (config.enableSwagger) zip.file(`${root}/docs/openapi.yaml`, `openapi: 3.0.3
info:
  title: ${service.name} API
  version: 0.1.0
paths:
  ${config.apiBasePath}/${service.slug}/health:
    get:
      summary: 服务健康检查
      responses:
        "200": { description: 服务正常 }
`);
    zip.file(`${root}/internal/service/system_service_test.go`, `package service

import (
    "testing"
    "${modulePath}/internal/dao"
)
func TestStatus(t *testing.T) {
    service := NewSystemService(dao.NewSystemDAO(), "${service.name}")
    if service.Status()["status"] != "UP" { t.Fatal("expected service to be UP") }
}
`);
    if (config.enableDocker) zip.file(`${root}/Dockerfile`, `FROM golang:${config.goVersion}-alpine AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /app ./cmd/server
FROM alpine:3.20
COPY --from=build /app /app
EXPOSE ${service.port}
ENTRYPOINT ["/app"]
`);
  });
}

export function getProjectFilePreview(config: ProjectConfig, nodes: CanvasNode[]) {
  const services = getServices(config, nodes);
  const common = [
    'README.md',
    '.env.example',
    config.stack === 'spring' ? (config.buildTool === 'maven' ? 'pom.xml' : 'settings.gradle / build.gradle') : 'go.work',
    ...(config.includeTopology ? ['topology.json'] : []),
    ...(config.enableDocker ? ['docker-compose.yml'] : []),
  ];
  const perService = config.stack === 'spring'
    ? [config.buildTool === 'maven' ? 'pom.xml' : 'build.gradle', 'src/main/java/…/controller', 'src/main/java/…/service', 'src/main/java/…/dao', 'src/main/resources/application.yml', 'src/test/java/…']
    : ['go.mod', 'cmd/server/main.go', 'internal/controller', 'internal/service', 'internal/dao', 'internal/model', 'config/config.yaml'];
  return { services, common, perService };
}

export function generateProjectFiles(config: ProjectConfig, nodes: CanvasNode[], edges: Edge[]) {
  const files = new ProjectFileTree();
  const services = getServices(config, nodes);
  addCommonFiles(files, config, nodes, edges, services);
  if (config.stack === 'spring') addSpringProject(files, config, nodes, services);
  else addIrisProject(files, config, nodes, services);
  return {
    rootName: `${config.prefix}-${safeSlug(config.projectName)}`,
    files: files.toRecord(),
  };
}
