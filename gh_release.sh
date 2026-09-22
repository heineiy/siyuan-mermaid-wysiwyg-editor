#!/bin/bash
# gh release 发布脚本（参考 siyuan-plugin-task-note-management/gh_release.sh，适配 npm + 当前分支）
# 用法：先 `bash build-package.sh` 生成根目录 package.zip，再 `bash gh_release.sh`
# 依赖：gh 已登录、plugin.json 有 version、CHANGELOG.md 有 `## $version` 段落
set -e
cd "$(dirname "$0")"

SKIP_CONFIRM="${1:-}"

# 当前分支
current_branch=$(git rev-parse --abbrev-ref HEAD)

# 从 plugin.json 取版本（可移植，兼容 BSD/GNU sed）
version=v$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' plugin.json | head -1)
echo "Preparing release for version: $version (branch: $current_branch)"

# 若已存在则询问覆盖（--yes 跳过）
if git rev-parse "$version" >/dev/null 2>&1 || gh release view "$version" >/dev/null 2>&1; then
    if [ "$SKIP_CONFIRM" != "--yes" ]; then
        read -p "Version $version already exists. Overwrite? (y/n) " confirm
        if [ "$confirm" != "y" ]; then
            echo "Release aborted."; exit 0
        fi
    fi
fi

# 提交并推送（含产物日志；package.zip 已在 .gitignore，不入库）
git add .
git commit -m "🔖 $version" || echo "No changes to commit"
git push origin "$current_branch" || echo "push skipped/failed"

# 提取 release notes：CHANGELOG.md 中 `## $version` 段
release_notes=$(awk "/^## $version/ {flag=1; next} /^## / {flag=0} flag" CHANGELOG.md | sed '/^$/d')
if [ -z "$release_notes" ]; then
    echo "Warning: empty or missing CHANGELOG section '## $version'; proceeding without notes."
fi

# 清理已存在的 release/tag 后重建（幂等）
if gh release view "$version" &>/dev/null; then
    gh release delete "$version" -y
fi
if git ls-remote --tags origin | grep -q "refs/tags/$version"; then
    git push origin :refs/tags/"$version" 2>/dev/null || true
fi
if git rev-parse "$version" &>/dev/null 2>&1; then
    git tag -d "$version"
fi

# 保证构建产物存在
[ -f package.zip ] || { echo "Error: package.zip missing. Run build/package first."; exit 1; }

# 创建 Latest release（附件为 package.zip）
gh release create "$version" package.zip \
    --title "$version / $(date +%Y%m%d)" \
    --notes "$release_notes" \
    --latest

echo "Release $version created successfully!"