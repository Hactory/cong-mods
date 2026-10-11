#!/usr/bin/env bash
# Cài bộ plugin của Công cho Claude Code.
#   bash cai-dat.sh            # cài tất cả
#   bash cai-dat.sh --chi-mod  # chỉ cài 2 mod tự làm (cache-keeper, viet-hoa)
set -u

CHI_MOD=0
[ "${1:-}" = "--chi-mod" ] && CHI_MOD=1

command -v claude >/dev/null 2>&1 || { echo "Không tìm thấy lệnh 'claude'. Cài Claude Code trước: https://claude.com/claude-code"; exit 1; }

LOI=()

chay() {  # chạy một lệnh, ghi lại nếu lỗi nhưng không dừng cả script
  echo "→ $*"
  "$@" || LOI+=("$*")
}

# 1. Hai mod tự làm, lấy thẳng từ GitHub (tự cập nhật khi repo đổi)
chay claude plugin marketplace add Hactory/cong-mods
chay claude plugin install cache-keeper@cong-mods --scope user
chay claude plugin install viet-hoa@cong-mods --scope user

# 2. Plugin công khai từ GitHub
if [ "$CHI_MOD" = 0 ]; then
  for repo in \
    anthropics/claude-plugins-official \
    callstackincubator/agent-skills \
    openai/codex-plugin-cc \
    jarrodwatts/claude-hud \
    warpdotdev/claude-code-warp; do
    chay claude plugin marketplace add "$repo"
  done
  for p in \
    superpowers@claude-plugins-official \
    commit-commands@claude-plugins-official \
    github@claude-plugins-official \
    expo@claude-plugins-official \
    telegram@claude-plugins-official \
    react-native-best-practices@callstack-agent-skills \
    codex@openai-codex \
    claude-hud@claude-hud \
    warp@claude-code-warp; do
    chay claude plugin install "$p" --scope user
  done
fi

echo
if [ ${#LOI[@]} -eq 0 ]; then
  echo "Xong, không có lỗi. Mở phiên Claude Code MỚI để plugin có hiệu lực."
else
  echo "Xong nhưng ${#LOI[@]} lệnh lỗi:"
  printf '  - %s\n' "${LOI[@]}"
  exit 2
fi
