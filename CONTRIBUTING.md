# Contributing to ServiceSmith

感谢你愿意帮助改进 ServiceSmith。我们欢迎错误修复、节点定义、模板适配、教学案例、文档和界面体验方面的贡献。

## 开始之前

- 搜索现有 Issue，避免重复工作。
- 较大的功能或领域模型变更请先创建 Discussion 或 Feature Request。
- 安全问题不要创建公开 Issue，请按照 [SECURITY.md](SECURITY.md) 处理。
- 参与项目即表示你同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 本地开发

要求 Node.js 20.19 或更高版本。

```bash
git clone <your-fork-url>
cd servicesmith
npm install
npm run dev
```

提交前运行：

```bash
npm run check
```

## 项目结构

- `src/catalog.ts`：节点定义、技术说明与依赖规则
- `src/validation.ts`：节点添加规则校验
- `src/App.tsx`：画布、节点和连接交互
- `src/ProjectWizard.tsx`：项目创建向导
- `src/projectGenerator.ts`：Spring Boot 与 Go Iris 源码模板
- `src/directoryWriter.ts`：本地目录写入

更完整的设计说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 提交规范

建议使用清晰的 Conventional Commit 前缀：

- `feat:` 新功能
- `fix:` 错误修复
- `docs:` 文档
- `refactor:` 不改变行为的重构
- `test:` 测试与验证
- `chore:` 工程维护

一次 Pull Request 尽量只解决一个主题。请避免提交 `dist`、`node_modules` 或本地生成项目。

## Pull Request 检查清单

- 功能范围清晰，并关联相应 Issue。
- 保持现有 TypeScript 严格类型约束。
- 新节点包含说明、用法、原理、风险和默认配置。
- 新生成模板保持 Controller → Service → DAO 分层约定。
- 没有在代码、配置或截图中提交密钥和个人信息。
- `npm run check` 通过。
- 对用户可见的功能同步更新 README 或相关文档。

## 节点贡献要求

新增节点应通过 `NodeDefinition` 声明，而不是在界面中写特殊判断。需要提供：

1. 唯一的 `type`。
2. 所属分类、显示名称、颜色和标签。
3. 配置字段与安全默认值。
4. 技术说明、推荐用法、工作原理和常见问题。
5. 所需的前置依赖与最大实例数。

## 许可证

提交到本仓库的贡献将按照项目的 [MIT License](LICENSE) 发布。
