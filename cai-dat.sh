#!/usr/bin/env bash
# Cài mod cache-keeper và bật You should know cho Claude Code.
#   bash cai-dat.sh
set -u

command -v claude >/dev/null 2>&1 || { echo "Không tìm thấy lệnh 'claude'. Cài Claude Code trước: https://claude.com/claude-code"; exit 1; }

LOI=()

chay() {  # chạy một lệnh, ghi lại nếu lỗi nhưng không dừng cả script
  echo "→ $*"
  "$@" || LOI+=("$*")
}

# 1. Mod cache-keeper, lấy thẳng từ GitHub (tự cập nhật khi repo đổi)
chay claude plugin marketplace add Hactory/cong-mods
chay claude plugin install cache-keeper@cong-mods --scope user

# 2. You should know: có sẵn trong Claude Code nhưng tắt mặc định
chay claude plugin enable cc-plugin-you-should-know@builtin

echo
if [ ${#LOI[@]} -eq 0 ]; then
  echo "Xong, không có lỗi. Mở phiên Claude Code MỚI để mod có hiệu lực."
else
  echo "Xong nhưng ${#LOI[@]} lệnh lỗi:"
  printf '  - %s\n' "${LOI[@]}"
  exit 2
fi
