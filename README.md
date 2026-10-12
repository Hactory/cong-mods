# Bộ mod Claude Code của Công

Mod là plugin vẽ thêm giao diện bên trong Claude Code; chạy được trong terminal và trong tab Code của app desktop. Bộ này gồm 2 thứ:

| Mod | Làm gì |
|---|---|
| `cache-keeper` | Khung gọn trên ô nhập: đếm ngược cache còn ấm, % context, quota 5 giờ/tuần kèm giờ reset (xanh dưới 50%, cam dưới 80%, đỏ từ 80%), chi phí phiên, 3 gợi ý bước tiếp do Haiku soạn (phím 1-3 điền vào ô nhập, 0 bỏ qua). Cột nút bên phải (một hàng sát phải khi chưa có gợi ý): `tiến độ` (phím t, hoặc `/tien-do`), `copy ID` (phím c), `handoff` (phím h: tóm tắt phiên, lưu vào `~/.claude/handoffs/`, xoá chat rồi điền bản tóm tắt để làm tiếp) |
| **You should know** (`cc-plugin-you-should-know@builtin`) | Có sẵn trong Claude Code, tắt mặc định. Khi bật, một agent phụ theo dõi lúc Claude làm việc dài và đưa lên trên ô nhập những điều đáng biết mà bạn dễ bỏ sót (thẻ "Heads up"); phím 1 "Understood", 2 trao đổi trong phiên chính, 0 bỏ qua. Không chạy được với tổ chức bật HIPAA/ZDR |

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

Mod cần Claude Code bản mới (đã chạy trên 2.1.296). Bản cũ chưa hỗ trợ mod thì `claude update`.

## Tắt, cập nhật

```bash
claude plugin disable cache-keeper@cong-mods
claude plugin disable cc-plugin-you-should-know@builtin
claude plugin marketplace update cong-mods && claude plugin update cache-keeper@cong-mods
```
