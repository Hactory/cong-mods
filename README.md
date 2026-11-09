# Bộ mod Claude Code của Công

Mod là plugin vẽ thêm giao diện bên trong Claude Code; chạy được trong terminal và trong tab Code của app desktop. Bộ này gồm 2 thứ:

| Mod | Làm gì |
|---|---|
| `cache-keeper` | Hiển thị context, quota và chi phí ngay cạnh ô nhập, cộng vài nút tiện tay. Chi tiết ở mục dưới. |
| **You should know** (`cc-plugin-you-should-know@builtin`) | Có sẵn trong Claude Code, tắt mặc định. Khi bật, một agent phụ theo dõi lúc Claude làm việc dài và đưa lên trên ô nhập những điều đáng biết mà bạn dễ bỏ sót. `cache-keeper` vẽ lại thẻ này cho gọn và đặt vào chỗ 3 gợi ý; các nút giữ nguyên tác dụng. Không chạy được với tổ chức bật HIPAA/ZDR |

## cache-keeper hiện gì

**Khung trên ô nhập**

- Một hàng: cache còn ấm bao lâu · chi phí phiên · hai vòng quota 5 giờ và tuần (số % nằm giữa vòng) kèm giờ reset.
- 3 gợi ý bước tiếp do Haiku soạn (phím 1-3 điền vào ô nhập, 0 bỏ qua), hoặc thẻ You should know khi có.
- Cột nút bên phải:
  - `tiến độ` (phím t, hoặc `/tien-do`): bảng việc và subagent của phiên.
  - `lưu ý` (phím l, hoặc `/luu-y`): Haiku đọc lại cả phiên, rút tối đa 10 điều dễ bỏ sót (cần bạn quyết, rủi ro, còn treo, chưa kiểm chứng, Claude tự đổi); mỗi mục có nút hỏi tiếp.
  - `copy ID` (phím c): chép mã phiên.
  - `handoff` (phím h): soạn bản bàn giao phiên, lưu vào `~/.claude/handoffs/`, hiện ngay trên ô chat và chép sẵn. Muốn làm tiếp ở phiên sạch thì tự gõ `/clear` rồi dán (⌘V).

**Dòng dưới ô nhập**

- Thanh context 10 ô đổi màu kèm số token (vd `394k`). Màu theo % đã dùng: xanh dưới 50%, cam dưới 80%, đỏ từ 80%. % tính theo mốc tự tóm tắt 600k token (`autoCompactWindow`); dùng mốc khác thì sửa `CTX_MOC` trong `plugins/cache-keeper/hooks/lib.ts`.
- Nút `Nén`: chạy `/compact` giữ lại mục tiêu, việc đã xong, việc dở và quyết định đã chốt; không chạy được thì điền sẵn `/compact` vào ô chat. Nút mờ khi context còn xanh, rõ khi cam, thành `🔴 Nén` khi đỏ. Nén xong thanh context cập nhật ngay.

Hook của mod mà lỗi thì Claude Code tự bỏ qua, việc của Claude vẫn chạy tiếp (có test chứng minh).

## Cài nhanh: dán prompt này vào Claude Code

```text
Cài giúp tôi bộ mod Claude Code ở https://github.com/Hactory/cong-mods.
1. Clone repo về một thư mục tạm, đọc README.md và cai-dat.sh trước khi chạy.
2. Chạy `bash cai-dat.sh`, báo lại lệnh nào lỗi nếu có.
3. Nhắc tôi mở một phiên Claude Code MỚI để mod có hiệu lực.
```

Muốn tự cài bằng tay:

```bash
git clone https://github.com/Hactory/cong-mods && bash cong-mods/cai-dat.sh
```

Mod cần Claude Code bản mới (đã chạy trên 2.1.319). Bản cũ chưa hỗ trợ mod thì `claude update`.

## Tắt, cập nhật

```bash
claude plugin disable cache-keeper@cong-mods
claude plugin disable cc-plugin-you-should-know@builtin
claude plugin marketplace update cong-mods && claude plugin update cache-keeper@cong-mods
```
