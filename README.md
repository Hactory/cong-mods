# Bộ plugin Claude Code của Công

Gồm mod tự làm `cache-keeper`, plugin có sẵn **You should know** (bật lên) và 9 plugin công khai. Mod là plugin vẽ thêm giao diện bên trong Claude Code; chạy được trong terminal và trong tab Code của app desktop.

## Cài nhanh: dán prompt này vào Claude Code

```text
Cài giúp tôi bộ plugin Claude Code ở https://github.com/Hactory/cong-mods.
1. Clone repo về một thư mục tạm, đọc README.md và cai-dat.sh trước khi chạy.
2. Hỏi tôi muốn cài tất cả hay chỉ cache-keeper + You should know, rồi chạy
   `bash cai-dat.sh` (tất cả) hoặc `bash cai-dat.sh --chi-mod`.
3. Báo lại lệnh nào lỗi, nếu có, và nói tôi việc cần làm thêm ở mục "Sau khi cài" trong README.
4. Nhắc tôi mở một phiên Claude Code MỚI để plugin có hiệu lực.
```

Muốn tự cài bằng tay:

```bash
git clone https://github.com/Hactory/cong-mods && bash cong-mods/cai-dat.sh
```

## Có gì trong bộ

### Mod tự làm và plugin có sẵn

| Mod | Làm gì |
|---|---|
| `cache-keeper` | Khung gọn trên ô nhập: đếm ngược cache còn ấm, % context, quota 5 giờ/tuần kèm giờ reset (xanh dưới 50%, cam dưới 80%, đỏ từ 80%), chi phí phiên, 3 gợi ý bước tiếp do Haiku soạn (phím 1-3 điền vào ô nhập, 0 bỏ qua). Hàng nút: `tiến độ` (phím t, hoặc `/tien-do`), `copy ID` (phím c), `handoff` (phím h: tóm tắt phiên, lưu vào `~/.claude/handoffs/`, xoá chat rồi điền bản tóm tắt để làm tiếp) |
| **You should know** (`cc-plugin-you-should-know@builtin`) | Plugin có sẵn trong Claude Code, tắt mặc định. Khi bật, một agent phụ theo dõi lúc Claude làm việc dài và đưa lên trên ô nhập những điều đáng biết mà bạn dễ bỏ sót (thẻ "Heads up"); phím 1 "Understood", 2 trao đổi trong phiên chính, 0 bỏ qua. Không chạy được với tổ chức bật HIPAA/ZDR |

### Plugin công khai

| Plugin | Nguồn | Ghi chú |
|---|---|---|
| `superpowers` | anthropics/claude-plugins-official | Bộ skill quy trình: brainstorm, plan, TDD, debug, review |
| `commit-commands` | anthropics/claude-plugins-official | `/commit`, `/commit-push-pr`, dọn nhánh |
| `github` | anthropics/claude-plugins-official | Cần đăng nhập GitHub (xem dưới) |
| `expo` | anthropics/claude-plugins-official | Skill cho app Expo/React Native |
| `telegram` | anthropics/claude-plugins-official | Nhắn qua Telegram; cần bot riêng |
| `react-native-best-practices` | callstackincubator/agent-skills | Tối ưu hiệu năng React Native |
| `codex` | openai/codex-plugin-cc | Gọi Codex (OpenAI) làm mắt thứ hai; cần Codex CLI |
| `claude-hud` | jarrodwatts/claude-hud | Dòng trạng thái (statusline) trong terminal |
| `warp` | warpdotdev/claude-code-warp | Tích hợp terminal Warp |

Không dùng React Native/Expo, Telegram hay Warp thì gỡ bằng `claude plugin uninstall <tên>`.

## Sau khi cài

- Mở phiên Claude Code **mới**: phiên đang chạy chưa nạp plugin vừa cài.
- `claude-hud`: gõ `/claude-hud:setup` để bật statusline.
- `telegram`: gõ `/telegram:configure` rồi dán token bot của chính bạn (tạo ở @BotFather).
- `codex`: cài Codex CLI và đăng nhập, rồi `/codex:setup`.
- `github`: chạy `gh auth login` nếu MCP GitHub báo lỗi đăng nhập.
- Mod cần Claude Code bản mới (đã chạy trên 2.1.296). Bản cũ chưa hỗ trợ mod thì `claude update`.

## Tắt, gỡ, cập nhật

```bash
claude plugin disable cache-keeper@cong-mods
claude plugin disable cc-plugin-you-should-know@builtin
claude plugin marketplace update cong-mods && claude plugin update cache-keeper@cong-mods
```
