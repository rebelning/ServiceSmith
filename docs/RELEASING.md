# Release Guide

## Before the first public release

1. 创建 GitHub 仓库并确认最终组织或所有者。
2. 替换 README 中的 `<repository-url>`。
3. 确认 MIT License 的版权主体是否需要改为个人或组织名称。
4. 启用 Issues、Discussions 和 Private vulnerability reporting。
5. 配置默认分支保护，要求 CI 通过后才能合并。
6. 确认没有提交 `.env`、密钥、个人目录或构建产物。
7. 添加至少一张产品截图或演示视频。

## Version release

1. 更新 `CHANGELOG.md`。
2. 同步修改 `package.json` 版本。
3. 执行 `npm ci` 和 `npm run check`。
4. 创建带注释的 Git tag，例如 `v0.1.0`。
5. 创建 GitHub Release 并附上 Changelog。
6. 在干净环境中验证 Release 源码可以安装和启动。

## Suggested branch protection

- Require a pull request before merging.
- Require the `build` status check.
- Require conversation resolution.
- Block force pushes and branch deletion.
