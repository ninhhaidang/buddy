# cc-buddy 🎰

**Công cụ tìm & lăn pet cho Claude Code `/buddy`. Chọn pet mơ ước của bạn.**

---

## Yêu cầu

- **Claude Code >= 2.1.89**
- **Bun** (khuyên dùng — kết quả chính xác tuyệt đối) hoặc **Node.js >= 16**

Cài Bun (Mac/Linux):
```bash
curl -fsSL https://bun.sh/install | bash
```

Cài Bun (Windows PowerShell):
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

---

## Cài đặt

Tải repo này về máy:

```bash
git clone https://github.com/ninhhaidang/buddy.git
cd buddy
```

Trên **Mac/Linux**, cấp quyền chạy:

```bash
chmod +x run.sh
```

---

## Chạy công cụ

### Tương tác (đề xuất)

```bash
# Mac/Linux
./run.sh

# Windows PowerShell
.\run.ps1
```

Lần đầu chạy sẽ hỏi chọn ngôn ngữ (English / Tiếng Việt), sau đó vào menu chính:

```
Bạn muốn làm gì?
  [1] 🔍  Tìm & áp dụng buddy
  [2] 👀  Xem buddy hiện tại
  [3] 📋  Bảng thú cưng
  [4] 🧪  Tự kiểm tra hash
  [5] 🌐  Đổi ngôn ngữ
  [6] 👋  Thoát
```

### Dòng lệnh (CLI)

```bash
# Tìm legendary dragon shiny, mũ wizard, mắt ✦
./run.sh search -s dragon -r legendary --hat wizard --eye '✦' --shiny

# Xem buddy hiện tại
./run.sh check

# Áp dụng một userID
./run.sh apply <userID>

# Bảng thú cưng
./run.sh gallery

# Kiểm tra hash
./run.sh selftest

# Đổi ngôn ngữ
./run.sh lang
```

### Tham số dòng lệnh

| Tham số | Mô tả |
|---------|--------|
| `-s, --species <tên>` | Loài pet (duck, dragon, cat...) |
| `-r, --rarity <tên>` | Độ hiếm: common, uncommon, rare, epic, legendary |
| `-e, --eye <ký tự>` | Mắt: `·` `✦` `×` `◉` `@` `°` |
| `--hat <tên>` | Mũ: none, crown, tophat, propeller, halo, wizard, beanie, tinyduck |
| `--shiny` | Yêu cầu shiny |
| `-l, --limit <N>` | Số lần thử tối đa (mặc định: 100 triệu) |
| `--min-points <N>` | Tổng 5 chỉ số >= N (0-500) |
| `--stat <TÊN> <N>` | Chỉ số TÊN >= N. Lặp lại được. Hợp lệ: DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK |
| `--parallel` | Dùng tất cả CPU để tìm nhanh hơn |
| `--unlimited` | Tìm không giới hạn (chạy mãi cho đến khi ra pet) |
| `--apply` | Tự động áp dụng không hỏi xác nhận |
| `--lang <en\|vi>` | Chọn ngôn ngữ |
| `--json` | Xuất kết quả dạng JSON |

---

## 18 loài pet

| | | | | | |
|---|---|---|---|---|---|
| 🦆 duck | 🪿 goose | 🫧 blob | 🐱 cat | 🐉 dragon | 🐙 octopus |
| 🦉 owl | 🐧 penguin | 🐢 turtle | 🐌 snail | 👻 ghost | 🦎 axolotl |
| 🦫 capybara | 🌵 cactus | 🤖 robot | 🐰 rabbit | 🍄 mushroom | 🐈 chonk |

---

## Độ hiếm

| Độ hiếm | Xác suất |
|---------|----------|
| ★ common | 60% |
| ★★ uncommon | 25% |
| ★★★ rare | 10% |
| ★★★★ epic | 4% |
| ★★★★★ legendary | 1% |

**Shiny**: xác suất 1% ở mọi độ hiếm.
**Mũ**: pet common không có mũ.

---

## Chỉnh tay thuộc tính

Sau khi tìm và áp dụng, có thể sửa tay `~/.claude.json` để chỉnh bất kỳ thuộc tính nào:

```jsonc
{
  "companionOverride": {
    "species": "dragon",
    "rarity": "legendary",
    "eye": "✦",
    "hat": "wizard",
    "shiny": true,
    "stats": {
      "CHAOS": 99,
      "WISDOM": 95
    }
  }
}
```

Chỉ cần ghi các trường muốn đổi, các trường khác giữ nguyên. Stats được merge từng trường — đổi một cái không mất cái khác.

---

## Cách hoạt động

Hệ thống pet `/buddy` của Claude Code có 2 lớp:

- **Bones** — loài, độ hiếm, mắt, mũ, chỉ số, shiny. Tạo từ `hash(userID + SALT)`, tính mỗi lần chạy, không lưu.
- **Soul** — tên và tính cách. Tạo bởi model, lưu trong `~/.claude.json`.

Công cụ này:
1. Tìm random `userID` cho đến khi hash ra pet mong muốn
2. Inject hỗ trợ `companionOverride` vào Claude Code
3. Ghi cả `userID` và override vào config — ba lớp đảm bảo

---

## Lưu ý

- Cần **Claude Code >= 2.1.89**
- Cấu hình được backup tự động trước mỗi lần ghi: `~/.claude.json.bak.<timestamp>`
- Nên chạy `selftest` lần đầu để xác nhận hash chính xác
- Người dùng OAuth: công cụ tự xóa `accountUuid` để seed về `userID`, không ảnh hưởng đến đăng nhập

---

## License

MIT
