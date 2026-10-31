# DS1307 — tự dò lại và chẩn đoán Serial

Nạp `D:/iot/sketch_oct30a/sketch_oct30a.ino` bằng Arduino IDE. Đóng kết nối USB trên web trước khi nạp hoặc mở Serial Monitor. Serial Monitor: 9600 baud, Newline hoặc Both NL & CR.

## Hoạt động

- Khi RTC lỗi: ngừng lấy mẫu và ngừng xuất số đo mới. Đèn/còi giữ cấp cảnh báo cuối; xử lý SIM và các lệnh điều khiển vẫn chạy. Một phiên SMS đã bắt đầu vẫn được xử lý theo trạng thái hiện tại; không tự thử lại SMS.
- Tự kiểm tra RTC mỗi 5 giây khi chưa có lần đọc gần hơn. Chỉ đo lại khi DS1307 trả đủ dữ liệu, đồng hồ đang chạy và ngày giờ hợp lệ.
- Khi phục hồi: in `@RTC OK`, xóa bộ lọc cũ và lấy lại 5 mẫu. Không nối trung bình qua khoảng mất RTC.
- Không tự đặt giờ bằng thời điểm biên dịch. RTC dừng hoặc ngày giờ không hợp lệ cần được đặt giờ thực tế.
- Web và bản tải chương trình trên web không được sửa trong lần này. Dùng file Nano tại đường dẫn phía trên.

## Lệnh trong Serial Monitor

`RTC`: kiểm tra ngay và in giờ đọc được hoặc nguyên nhân lỗi.

`I2C`: dò các địa chỉ I²C từ 0x08 đến 0x77. Địa chỉ mong đợi của DS1307 là 0x68. LCD của chương trình dùng 0x27; thấy LCD không đồng nghĩa đã nhận RTC. Khi bus hết thời gian chờ, dừng dò và in TIMEOUT. Nếu SIM đang xử lý, chờ xong rồi gửi lại lệnh chẩn đoán.

`YYYY-MM-DD HH:MM:SS`: thay bằng ngày giờ thực tế để đặt RTC. Chỉ báo cập nhật thành công sau khi ghi và đọc lại xác nhận. Lệnh dùng được cả khi đồng hồ đang dừng hoặc chứa ngày giờ lỗi, nếu thiết bị vẫn giao tiếp được.

## Đọc lỗi

- `NOT_FOUND`: DS1307 không xác nhận địa chỉ 0x68. Kiểm tra nguồn, GND, SDA nối A4 và SCL nối A5 của Nano.
- `I2C_READ`: lỗi giao tiếp, thiếu dữ liệu hoặc hết thời gian chờ. Kiểm tra dây và nguồn.
- `STOPPED`: bit dừng đồng hồ đang bật; đặt giờ thực tế.
- `INVALID`: dữ liệu BCD hoặc ngày giờ không hợp lệ; đặt lại giờ.

## Kiểm tra trên thiết bị

1. RTC hoạt động: gõ RTC, kiểm tra giờ tăng; phải có các dòng Thoi gian / KC / TB / Cap.
2. RTC mất kết nối: phải có lỗi, không có số đo mới, chương trình vẫn nhận lệnh và in sức khỏe định kỳ.
3. Sau khi khắc phục dây/nguồn: phải tự nhận lại trong lần kiểm tra kế tiếp (khoảng 5 giây), có @RTC OK và bộ lọc bắt đầu lại từ mẫu đầu.
4. RTC dừng hoặc ngày giờ lỗi: phải báo STOPPED/INVALID và chưa đo lại cho tới khi đặt được giờ hợp lệ.
5. Khi đã tạm dừng đo bằng lệnh điều khiển: phục hồi RTC không tự hủy yêu cầu tạm dừng.

Đã biên dịch cho arduino:avr:nano: flash 27.070 byte (88%), RAM tĩnh 1.383 byte (67%), còn 665 byte. Chưa xác minh các tình huống dây/nguồn trên module thực.
