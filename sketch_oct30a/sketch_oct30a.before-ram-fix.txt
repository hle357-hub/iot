#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <EEPROM.h>
#include <RTClib.h>
#include <SoftwareSerial.h>

#define TRIGGER_PIN 2
#define ECHO_PIN 3
#define LED_PIN 6
#define SIREN_PIN 9
#define SIM_TX 10
#define SIM_RX 11

#define HOUR_SEND 19
#define MINUTE_SEND 00

// Địa chỉ EEPROM
#define ADDR_MIN_DISTANCE 0
#define ADDR_MAX_DISTANCE 4
#define ADDR_LAST_DAY 8

// Ngưỡng cảnh báo 3 cấp độ
#define LEVEL_1_DISTANCE 30.0 // Cấp 1: Nước bắt đầu lên cao
#define LEVEL_2_DISTANCE 20.0 // Cấp 2: Nước nguy hiểm
#define LEVEL_3_DISTANCE 10.0 // Cấp 3: Nước rất nguy hiểm

RTC_DS1307 rtc; // Đã đổi sang DS1307 cho khớp với phần cứng của bạn
SoftwareSerial simSerial(SIM_RX, SIM_TX);
LiquidCrystal_I2C lcd(0x27, 16, 2);

float hysteresis_on = 2.0;
float hysteresis_off = 5.0;
int alert_level = 0; // 0: Không cảnh báo, 1-3: Cấp độ cảnh báo
bool alerting = false;

float min_distance = 1000.0;
float max_distance = 0.0;
String phone_number = "0327484058"; // BẠN NHỚ SỬA LẠI SỐ ĐIỆN THOẠI Ở ĐÂY NHÉ

#define MCU_SIM_BAUDRATE 9600
#define SET_BAUDRATE "AT+IPREX=9600"
bool report_sent = false;

// Biến cho tính trung bình (giảm từ 10 xuống 5)
float distance_samples[5];
int sample_index = 0;
float average_distance = 0.0;
bool samples_filled = false;

// Biến cho nhấp nháy LED và còi
unsigned long last_blink_time = 0;
bool led_state = false;
bool siren_state = false;

void setup() {
  Serial.begin(MCU_SIM_BAUDRATE);
  simSerial.begin(MCU_SIM_BAUDRATE);
  delay(200);
  
  // Khởi tạo SIM module
  sim_at_cmd("AT");
  sim_at_cmd("AT+IPREX?");
  sim_at_cmd(SET_BAUDRATE);
  sim_at_cmd("ATI");
  sim_at_cmd("AT+CPIN?");
  sim_at_cmd("AT+CSQ");
  sim_at_cmd("AT+CIMI");
  sim_at_cmd("AT+CMGF=1");
  sim_at_cmd("AT+CNMI=1,2,0,0,0");
  
  if (!rtc.begin()) {
    Serial.println("Khong tim thay RTC");
    while (1);
  }
  
  if (!rtc.isrunning()) {
    Serial.println("RTC mat nguon, dat thoi gian ban dau");
    rtc.adjust(DateTime(2023, 1, 1, 0, 0, 0));
  }
  
  Serial.println("Nhap thoi gian (YYYY-MM-DD HH:MM:SS) de cap nhat RTC");
  
  lcd.init();
  lcd.backlight();
  lcd.setCursor(2, 0);
  lcd.print("Canh Bao Lu");
  delay(500);
  lcd.setCursor(0, 1);
  lcd.print("Khoi Dong");
  delay(500);
  
  for (int i = 0; i < 7; i++) {
    lcd.setCursor(9 + i, 1);
    lcd.print(".");
    delay(500);
  }
  lcd.clear();
  
  pinMode(TRIGGER_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  pinMode(SIREN_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  digitalWrite(SIREN_PIN, LOW);
  
  // Khởi tạo mảng mẫu
  for (int i = 0; i < 5; i++) {
    distance_samples[i] = 0.0;
  }
  
  // Khôi phục dữ liệu từ EEPROM
  min_distance = readFloatFromEEPROM(ADDR_MIN_DISTANCE);
  max_distance = readFloatFromEEPROM(ADDR_MAX_DISTANCE);
  if (min_distance > 1000.0 || max_distance < 0.0) {
    min_distance = 1000.0;
    max_distance = 0.0;
    writeFloatToEEPROM(ADDR_MIN_DISTANCE, min_distance);
    writeFloatToEEPROM(ADDR_MAX_DISTANCE, max_distance);
  }
}

void loop() {
  DateTime now = rtc.now();
  float distance = measureDistance();
  checkSerialForTimeUpdate();
  
  // Cập nhật mẫu và tính trung bình (5 mẫu)
  distance_samples[sample_index] = distance;
  sample_index = (sample_index + 1) % 5;
  if (sample_index == 0) samples_filled = true;
  average_distance = 0.0;
  int sample_count = samples_filled ? 5 : sample_index;
  if (sample_count > 0) {
    for (int i = 0; i < sample_count; i++) {
      average_distance += distance_samples[i];
    }
    average_distance /= sample_count;
  }
  
  // Cập nhật min/max
  if (distance < min_distance) {
    min_distance = distance;
    writeFloatToEEPROM(ADDR_MIN_DISTANCE, min_distance);
  }
  if (distance > max_distance) {
    max_distance = distance;
    writeFloatToEEPROM(ADDR_MAX_DISTANCE, max_distance);
  }
  
  // Reset min/max khi sang ngày mới
  byte last_day = EEPROM.read(ADDR_LAST_DAY);
  if (now.day() != last_day && now.hour() >= 20) {
    min_distance = distance;
    max_distance = distance;
    writeFloatToEEPROM(ADDR_MIN_DISTANCE, min_distance);
    writeFloatToEEPROM(ADDR_MAX_DISTANCE, max_distance);
    EEPROM.write(ADDR_LAST_DAY, (byte)now.day());
  }
  
  // Gửi báo cáo hàng ngày
  if (now.hour() == HOUR_SEND && now.minute() == MINUTE_SEND && now.second() == 00 && !report_sent) {
    Serial.println("Thuc hien gui tin nhan bao nuoc theo ngay ");
    String message1 = "Bao cao muc nuoc ngay " + String(now.day()) + "/" + String(now.month()) + "/" + String(now.year()) + ": Muc cao nhat: " + String(min_distance) + " cm, Muc thap nhat: " + String(max_distance) + " cm.";
    Serial.println(message1);
    sendSMS(message1);
    delay(200);
    report_sent = true;
    EEPROM.write(ADDR_LAST_DAY, (byte)now.day());
  }
  else if (now.hour() != 20) {
    report_sent = false;
  }
  
  // Logic cảnh báo 3 cấp độ
  if (samples_filled) {
    checkAlertLevel(now);
  }
  
  // Xử lý nhấp nháy LED và còi theo cấp độ
  handleAlertSignals();
  
  // Hiển thị dữ liệu
  displayData(now, distance, average_distance);
  delay(1000);
}

void checkAlertLevel(DateTime now) {
  int previous_level = alert_level;
  
  // Xác định cấp độ cảnh báo
  if (average_distance <= LEVEL_3_DISTANCE) {
    alert_level = 3;
  } else if (average_distance <= LEVEL_2_DISTANCE) {
    alert_level = 2;
  } else if (average_distance <= LEVEL_1_DISTANCE) {
    alert_level = 1;
  } else if (average_distance > LEVEL_1_DISTANCE + hysteresis_off) {
    alert_level = 0;
  }
  
  // Khi cấp độ thay đổi, gửi thông báo
  if (alert_level > previous_level && alert_level > 0) {
    String level_text = "";
    if (alert_level == 1) level_text = "Cap 1 - Canh giac";
    else if (alert_level == 2) level_text = "Cap 2 - Nguy hiem";
    else if (alert_level == 3) level_text = "Cap 3 - Rat nguy hiem";
    
    String message = "CANH BAO LU " + level_text + " luc " + String(now.hour()) + ":" + String(now.minute()) + " ngay " + String(now.day()) + "/" + String(now.month()) + "/" + String(now.year()) + ". Muc nuoc: " + String(average_distance) + " cm";
    
    Serial.println(message);
    sendSMS(message);
    
    // Cấp 3 thực hiện cuộc gọi
    if (alert_level == 3) {
      makeCall();
    }
  }
  alerting = (alert_level > 0);
}

void handleAlertSignals() {
  unsigned long current_time = millis();
  int blink_interval = 0;
  
  if (alert_level == 0) {
    // Tắt hết
    digitalWrite(LED_PIN, LOW);
    digitalWrite(SIREN_PIN, LOW);
    led_state = false;
    siren_state = false;
  } 
  else if (alert_level == 1) {
    // Cấp 1: Chỉ LED nhấp nháy nhanh (200ms)
    blink_interval = 200;
    if (current_time - last_blink_time >= blink_interval) {
      led_state = !led_state;
      digitalWrite(LED_PIN, led_state ? HIGH : LOW);
      digitalWrite(SIREN_PIN, LOW);
      last_blink_time = current_time;
    }
  } 
  else if (alert_level == 2) {
    // Cấp 2: LED và còi cùng nhấp nháy nhanh (200ms)
    blink_interval = 200;
    if (current_time - last_blink_time >= blink_interval) {
      led_state = !led_state;
      digitalWrite(LED_PIN, led_state ? HIGH : LOW);
      digitalWrite(SIREN_PIN, led_state ? HIGH : LOW);
      last_blink_time = current_time;
    }
  } 
  else if (alert_level == 3) {
    // Cấp 3: LED và còi nhấp nháy rất nhanh (100ms)
    blink_interval = 100;
    if (current_time - last_blink_time >= blink_interval) {
      led_state = !led_state;
      digitalWrite(LED_PIN, led_state ? HIGH : LOW);
      digitalWrite(SIREN_PIN, led_state ? HIGH : LOW);
      last_blink_time = current_time;
    }
  }
}

float measureDistance() {
  digitalWrite(TRIGGER_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIGGER_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIGGER_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH);
  float distance = duration * 0.034 / 2;
  return distance;
}

void checkSerialForTimeUpdate() {
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    if (input.length() == 19 && input[4] == '-' && input[7] == '-' && input[10] == ' ' && input[13] == ':' && input[16] == ':') {
      int year = input.substring(0, 4).toInt();
      int month = input.substring(5, 7).toInt();
      int day = input.substring(8, 10).toInt();
      int hour = input.substring(11, 13).toInt();
      int minute = input.substring(14, 16).toInt();
      int second = input.substring(17, 19).toInt();
      
      if (year >= 2000 && year <= 2099 && month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59) {
        rtc.adjust(DateTime(year, month, day, hour, minute, second));
        Serial.println("Thoi gian RTC da duoc cap nhat: " + input);
      } else {
        Serial.println("Dinh dang thoi gian khong hop le. Vui long nhap: YYYY-MM-DD HH:MM:SS");
      }
    } else {
      Serial.println("Dinh dang thoi gian khong dung. Vui long nhap: YYYY-MM-DD HH:MM:SS");
    }
  }
}

void sim_at_wait() {
  delay(100);
  while (simSerial.available()) {
    Serial.write(simSerial.read());
  }
}

bool sim_at_cmd(String cmd) {
  simSerial.println(cmd);
  sim_at_wait();
  return true;
}

bool sim_at_send(char c) {
  simSerial.write(c);
  return true;
}

void sendSMS(String message) {
  Serial.println("Thuc hien gui tin nhan SMS...");
  simSerial.println("AT+CMGF=1"); 
  delay(500);
  
  // Dọn sạch bộ nhớ đệm cũ trước khi gửi lệnh mới
  while(simSerial.available()) simSerial.read();
  
  // Gửi lệnh khai báo số điện thoại
  simSerial.print("AT+CMGS=\"");
  simSerial.print(phone_number);
  simSerial.print("\"\r"); // QUAN TRỌNG: Chỉ dùng \r, tuyệt đối không dùng println ở dòng này
  
  delay(1000); // Chờ 1 giây để module SIM hiện dấu >
  
  Serial.print("SIM cho phep nhap noi dung (Dau >): ");
  while(simSerial.available()) {
    Serial.write(simSerial.read()); // In ra xem có dấu > không
  }
  Serial.println();
  
  // Đẩy nội dung tin nhắn
  simSerial.print(message); 
  delay(500);
  
  // Gửi mã kết thúc tin nhắn (Ctrl+Z)
  simSerial.write(26); 
  
  Serial.println("--- PHAN HOI TU SIM ---");
  // Lắng nghe liên tục trong 7 giây (chống tràn bộ nhớ)
  unsigned long waitTime = millis();
  while(millis() - waitTime < 7000) {
    if(simSerial.available()) {
      Serial.write(simSerial.read());
    }
  }
  Serial.println("\n-----------------------");
  Serial.println("Da ra lenh xong!");
}

void makeCall() {
  Serial.println("Thuc hien cuoc goi...");
  simSerial.print("ATD");
  simSerial.print(phone_number);
  simSerial.println(";");
  
  Serial.println("--- TRANG THAI CUOC GOI ---");
  // Đổ chuông 15 giây và lắng nghe liên tục phản hồi
  unsigned long waitTime = millis();
  while(millis() - waitTime < 15000) { 
    if(simSerial.available()) {
      Serial.write(simSerial.read());
    }
  }
  Serial.println("\n---------------------------");
  
  simSerial.println("ATH"); // Cúp máy
  delay(1000);
}

void displayData(DateTime now, float distance, float avg_distance) {
  Serial.print("Thoi gian: ");
  Serial.print(now.hour());
  Serial.print(":");
  if (now.minute() < 10) Serial.print("0");
  Serial.print(now.minute());
  Serial.print(" ");
  Serial.print(now.day());
  Serial.print("/");
  Serial.print(now.month());
  Serial.print("/");
  Serial.print(now.year());
  Serial.print(" | KC: ");
  Serial.print(distance);
  Serial.print(" cm | TB: ");
  Serial.print(avg_distance);
  Serial.print(" cm | Cap: ");
  Serial.println(alert_level);
  
  lcd.clear();
  if (alerting) {
    lcd.setCursor(0, 0);
    if (alert_level == 1) lcd.print("CANH BAO CAP 1!");
    else if (alert_level == 2) lcd.print("CANH BAO CAP 2!");
    else if (alert_level == 3) lcd.print("CANH BAO CAP 3!");
    lcd.setCursor(0, 1);
    lcd.print("Muc: ");
    lcd.print(avg_distance);
    lcd.print(" cm");
  } else {
    lcd.setCursor(0, 0);
    lcd.print("Gio: ");
    lcd.print(now.hour());
    lcd.print(":");
    if (now.minute() < 10) lcd.print("0");
    lcd.print(now.minute());
    lcd.print(":");
    if (now.second() < 10) lcd.print("0");
    lcd.print(now.second());
    lcd.setCursor(0, 1);
    lcd.print("Muc: ");
    lcd.print(avg_distance);
    lcd.print(" cm");
  }
}

void writeFloatToEEPROM(int address, float value) {
  byte* p = (byte*)&value;
  for (int i = 0; i < sizeof(float); i++) {
    EEPROM.write(address + i, p[i]);
  }
}

float readFloatFromEEPROM(int address) {
  float value;
  byte* p = (byte*)&value;
  for (int i = 0; i < sizeof(float); i++) {
    p[i] = EEPROM.read(address + i);
  }
  return value;
}