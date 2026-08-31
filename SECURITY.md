# Security Policy

## Supported versions

ServiceSmith 目前处于早期开发阶段。安全修复会优先应用于最新的 `0.1.x` 版本和默认分支。

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| Older | No |

## Reporting a vulnerability

请不要通过公开 Issue 报告安全漏洞。

推荐使用 GitHub 仓库 **Security → Advisories → Report a vulnerability** 的私有报告功能，并提供：

- 受影响的版本或提交
- 复现步骤或最小示例
- 可能造成的影响
- 已知的缓解或修复建议

维护者应在收到报告后的 7 天内确认，并在问题解决前尽量保持沟通。修复完成后，我们会在征得报告者同意的情况下公开致谢。

## Security considerations

- ServiceSmith 在浏览器本地生成和写入项目源码，不会主动上传项目配置。
- 目录写入需要用户通过浏览器明确授权。
- 生成模板中的密码仅用于本地示例，部署前必须通过环境变量或密钥管理系统替换。
- 不要在 Issue、日志、拓扑导出文件或截图中提交真实凭证。
