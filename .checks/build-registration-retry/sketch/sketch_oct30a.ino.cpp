#include <Arduino.h>
#line 1 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <EEPROM.h>
#include <RTClib.h>
#include <SoftwareSerial.h>
#include <avr/pgmspace.h>
#include <stdio.h>
#include <string.h>
#include <math.h>

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

float hysteresis_off = 5.0;
int alert_level = 0; // 0: Không cảnh báo, 1-3: Cấp độ cảnh báo
bool alerting = false;

float min_distance = 1000.0;
float max_distance = 0.0;
const char phone_number[] PROGMEM = "0973150240"; // So nhan SMS/cuoc goi

#define MCU_SIM_BAUDRATE 9600

bool report_sent = false;

// Biến cho tính trung bình (giảm từ 10 xuống 5)
float distance_samples[5];
int sample_index = 0;
float average_distance = 0.0;
bool samples_filled = false;

// Biến cho nhấp nháy LED và còi
unsigned long last_blink_time = 0;
bool led_state = false;

#line 57 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
void setup();
#line 129 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
void loop();
#line 204 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
void checkAlertLevel(DateTime now);
#line 242 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
void handleAlertSignals();
#line 284 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
float measureDistance();
#line 295 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
void checkSerialForTimeUpdate();
#line 366 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
bool waitSimResponse(byte mode, unsigned long timeoutMs);
#line 394 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
bool sim_at_cmd_wait(const __FlashStringHelper *cmd, unsigned long timeoutMs);
#line 406 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
bool sim_at_cmd(const __FlashStringHelper *cmd);
#line 411 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
void reconnectNetwork();
#line 423 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
void printNetworkStatus();
#line 438 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
bool sendSMS(const char *message);
#line 464 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
void makeCall();
#line 484 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
void displayData(DateTime now, float distance, float avg_distance);
#line 530 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
void writeFloatToEEPROM(int address, float value);
#line 537 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
float readFloatFromEEPROM(int address);
#line 57 "D:\\iot\\sketch_oct30a\\sketch_oct30a.ino"
void setup() {
  Serial.begin(MCU_SIM_BAUDRATE);
  simSerial.begin(MCU_SIM_BAUDRATE);
  delay(200);
  
  // Khởi tạo SIM module
  Serial.println(F("CANH BAO LU - RAM FIX v6 RENET"));
  sim_at_cmd(F("AT"));
  sim_at_cmd(F("ATE0"));
  sim_at_cmd(F("AT+IPREX?"));
  sim_at_cmd(F("ATI"));
  sim_at_cmd(F("AT+CMEE=2"));
  printNetworkStatus();
  sim_at_cmd(F("AT+CIMI"));
  sim_at_cmd(F("AT+CMGF=1"));
  sim_at_cmd(F("AT+CNMI=1,2,0,0,0"));
  
  if (!rtc.begin()) {
    Serial.println(F("Khong tim thay RTC"));
    while (1);
  }
  
  if (!rtc.isrunning()) {
    Serial.println(F("RTC mat nguon, dat thoi gian ban dau"));
    rtc.adjust(DateTime(2023, 1, 1, 0, 0, 0));
  }
  
  Serial.println(F("Nhap thoi gian (YYYY-MM-DD HH:MM:SS) de cap nhat RTC"));
  Serial.println(F("Go NET va Enter de kiem tra SIM/song/dang ky mang."));
  Serial.println(F("RENET: thu dang ky lai; SCAN: quet mang; TESTSMS: gui SMS thu."));
  
  lcd.init();
  lcd.backlight();
  lcd.setCursor(2, 0);
  lcd.print(F("Canh Bao Lu"));
  delay(500);
  lcd.setCursor(0, 1);
  lcd.print(F("Khoi Dong"));
  delay(500);
  
  for (int i = 0; i < 7; i++) {
    lcd.setCursor(9 + i, 1);
    lcd.print(F("."));
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
  if (!isfinite(min_distance) || !isfinite(max_distance) ||
      min_distance < 0.0 || min_distance > 1000.0 ||
      max_distance < 0.0 || max_distance > 1000.0) {
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
    Serial.println(F("Thuc hien gui tin nhan bao nuoc theo ngay "));
    char message[161];
    char high[16], low[16];
    dtostrf(min_distance, 1, 2, high);
    dtostrf(max_distance, 1, 2, low);
    int length = snprintf_P(message, sizeof(message),
        PSTR("Bao cao muc nuoc ngay %u/%u/%u: Muc cao nhat: %s cm, Muc thap nhat: %s cm."),
        (unsigned)now.day(), (unsigned)now.month(), (unsigned)now.year(), high, low);
    if (length >= 0 && (size_t)length < sizeof(message)) {
      Serial.println(message);
      sendSMS(message);
    } else {
      Serial.println(F("SMS qua dai, khong gui noi dung bi cat."));
    }
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
    char message[161];
    char distance[16];
    dtostrf(average_distance, 1, 2, distance);
    int length = snprintf_P(message, sizeof(message),
        PSTR("CANH BAO LU Cap %u luc %u:%02u ngay %u/%u/%u. Muc nuoc: %s cm"),
        (unsigned)alert_level, (unsigned)now.hour(), (unsigned)now.minute(),
        (unsigned)now.day(), (unsigned)now.month(), (unsigned)now.year(), distance);
    if (length >= 0 && (size_t)length < sizeof(message)) {
      Serial.println(message);
      sendSMS(message);
    } else {
      Serial.println(F("SMS qua dai, khong gui noi dung bi cat."));
    }

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
  static char input[20];
  static byte length = 0;
  static bool overflow = false;
  while (Serial.available()) {
    char c = Serial.read();
    if (c != '\r' && c != '\n') {
      if (length < sizeof(input) - 1) input[length++] = c;
      else overflow = true;
      continue;
    }
    if (length == 0 && !overflow) continue;
    input[length] = '\0';
    if (!overflow && strcmp_P(input, PSTR("NET")) == 0) {
      length = 0;
      overflow = false;
      printNetworkStatus();
      continue;
    }
    if (!overflow && strcmp_P(input, PSTR("RENET")) == 0) {
      length = 0;
      overflow = false;
      reconnectNetwork();
      continue;
    }
    if (!overflow && strcmp_P(input, PSTR("SCAN")) == 0) {
      length = 0;
      overflow = false;
      Serial.println(F("=== QUET MANG: cho toi 65 giay ==="));
      sim_at_cmd_wait(F("AT+COPS=?"), 65000UL);
      Serial.println(F("=== QUET MANG KET THUC ==="));
      continue;
    }
    if (!overflow && strcmp_P(input, PSTR("TESTSMS")) == 0) {
      length = 0;
      overflow = false;
      char message[48];
      strcpy_P(message, PSTR("Kiem tra SMS tu he thong canh bao lu."));
      sendSMS(message);
      continue;
    }
    bool valid = !overflow && length == 19;
    uint16_t fields[6] = {0, 0, 0, 0, 0, 0};
    byte field = 0;
    for (byte i = 0; valid && i < 19; i++) {
      if (i == 4 || i == 7 || i == 10 || i == 13 || i == 16) {
        char expected = (i == 4 || i == 7) ? '-' : (i == 10 ? ' ' : ':');
        if (input[i] != expected) valid = false;
        field++;
      } else if (input[i] >= '0' && input[i] <= '9') {
        fields[field] = fields[field] * 10 + input[i] - '0';
      } else valid = false;
    }
    valid = valid && fields[0] >= 2000 && fields[0] <= 2099 &&
        fields[1] >= 1 && fields[1] <= 12 && fields[2] >= 1 && fields[2] <= 31 &&
        fields[3] < 24 && fields[4] < 60 && fields[5] < 60;
    if (valid) {
      DateTime updated(fields[0], fields[1], fields[2], fields[3], fields[4], fields[5]);
      if (updated.isValid()) {
        rtc.adjust(updated);
        Serial.print(F("Thoi gian RTC da duoc cap nhat: "));
        Serial.println(input);
      } else valid = false;
    }
    if (!valid) Serial.println(F("Nhap dung: YYYY-MM-DD HH:MM:SS"));
    length = 0;
    overflow = false;
  }
}

// mode: 0 = OK; 1 = dau nhac >; 2 = +CMGS va OK.
bool waitSimResponse(byte mode, unsigned long timeoutMs) {
  char line[48];
  byte length = 0;
  bool overflow = false;
  bool smsAccepted = false;
  unsigned long start = millis();
  while (millis() - start < timeoutMs) {
    if (!simSerial.available()) continue;
    char c = simSerial.read();
    Serial.write(c);
    if (mode == 1 && c == '>') return true;
    if (c == '\r' || c == '\n') {
      line[length] = '\0';
      if (strncmp_P(line, PSTR("ERROR"), 5) == 0 ||
          strncmp_P(line, PSTR("+CMS ERROR"), 10) == 0 ||
          strncmp_P(line, PSTR("+CME ERROR"), 10) == 0) return false;
      if (!overflow && strcmp_P(line, PSTR("OK")) == 0 && mode != 1) {
        if (mode == 0 || smsAccepted) return true;
      }
      if (strncmp_P(line, PSTR("+CMGS:"), 6) == 0) smsAccepted = true;
      length = 0;
      overflow = false;
    } else if (length < sizeof(line) - 1) line[length++] = c;
    else overflow = true;
  }
  return false;
}

bool sim_at_cmd_wait(const __FlashStringHelper *cmd, unsigned long timeoutMs) {
  while (simSerial.available()) simSerial.read();
  Serial.println();
  Serial.print(F(">> "));
  Serial.println(cmd);
  simSerial.println(cmd);
  bool ok = waitSimResponse(0, timeoutMs);
  Serial.println();
  if (!ok) Serial.println(F("Lenh chua duoc xac nhan OK (loi hoac het thoi gian cho)."));
  return ok;
}

bool sim_at_cmd(const __FlashStringHelper *cmd) {
  return sim_at_cmd_wait(cmd, 3000UL);
}

// Chi chay khi nguoi dung go RENET; khong doi bang tan, APN hay ep nha mang.
void reconnectNetwork() {
  Serial.println(F("=== THU DANG KY LAI MANG ==="));
  Serial.println(F("Trong luc thu mang, phep do tam dung toi khoang 75 giay."));
  if (sim_at_cmd_wait(F("AT+CFUN=1"), 10000UL)) {
    sim_at_cmd_wait(F("AT+COPS=0"), 65000UL);
  }
  Serial.println(F("OK cua lenh chua du de ket luan da dang ky mang."));
  printNetworkStatus();
  Serial.println(F("=== THU DANG KY LAI KET THUC ==="));
}

// Chi doc trang thai; khong ep nha mang, bang tan hay thay doi APN.
void printNetworkStatus() {
  Serial.println(F("=== CHAN DOAN MANG BAT DAU ==="));
  sim_at_cmd(F("AT+CFUN?"));
  sim_at_cmd(F("AT+CNMP?"));
  sim_at_cmd(F("AT+CNBP?"));
  sim_at_cmd(F("AT+CPIN?"));
  sim_at_cmd(F("AT+CSQ"));
  sim_at_cmd(F("AT+CREG?"));
  sim_at_cmd(F("AT+CEREG?"));
  sim_at_cmd(F("AT+COPS?"));
  sim_at_cmd(F("AT+CPSI?"));
  Serial.println(F("=== CHAN DOAN MANG KET THUC ==="));
}


bool sendSMS(const char *message) {
  Serial.println(F("Thuc hien gui tin nhan SMS..."));
  if (!sim_at_cmd(F("AT+CMGF=1"))) {
    Serial.println(F("SMS that bai: SIM khong xac nhan che do van ban."));
    return false;
  }
  simSerial.print(F("AT+CMGS=\""));
  simSerial.print(reinterpret_cast<const __FlashStringHelper *>(phone_number));
  simSerial.print(F("\"\r"));
  if (!waitSimResponse(1, 10000)) {
    simSerial.write((uint8_t)27); // Huy neu module dang cho noi dung.
    Serial.println(F("SMS that bai: khong nhan duoc dau >."));
    return false;
  }
  simSerial.print(message);
  simSerial.write((uint8_t)26);
  if (!waitSimResponse(2, 60000)) {
    simSerial.write((uint8_t)27);
    Serial.println();
    Serial.println(F("Chua xac nhan gui SMS. Go NET de kiem tra mang."));
    return false;
  }
  Serial.println(F("SIM da xac nhan gui SMS (+CMGS va OK)."));
  return true;
}

void makeCall() {
  Serial.println(F("Thuc hien cuoc goi..."));
  simSerial.print(F("ATD"));
  simSerial.print(reinterpret_cast<const __FlashStringHelper *>(phone_number));
  simSerial.println(F(";"));
  
  Serial.println(F("--- TRANG THAI CUOC GOI ---"));
  // Đổ chuông 15 giây và lắng nghe liên tục phản hồi
  unsigned long waitTime = millis();
  while(millis() - waitTime < 15000) { 
    if(simSerial.available()) {
      Serial.write(simSerial.read());
    }
  }
  Serial.println(F("\n---------------------------"));
  
  simSerial.println(F("ATH")); // Cúp máy
  delay(1000);
}

void displayData(DateTime now, float distance, float avg_distance) {
  Serial.print(F("Thoi gian: "));
  Serial.print(now.hour());
  Serial.print(F(":"));
  if (now.minute() < 10) Serial.print(F("0"));
  Serial.print(now.minute());
  Serial.print(F(" "));
  Serial.print(now.day());
  Serial.print(F("/"));
  Serial.print(now.month());
  Serial.print(F("/"));
  Serial.print(now.year());
  Serial.print(F(" | KC: "));
  Serial.print(distance);
  Serial.print(F(" cm | TB: "));
  Serial.print(avg_distance);
  Serial.print(F(" cm | Cap: "));
  Serial.println(alert_level);
  
  lcd.clear();
  if (alerting) {
    lcd.setCursor(0, 0);
    if (alert_level == 1) lcd.print(F("CANH BAO CAP 1!"));
    else if (alert_level == 2) lcd.print(F("CANH BAO CAP 2!"));
    else if (alert_level == 3) lcd.print(F("CANH BAO CAP 3!"));
    lcd.setCursor(0, 1);
    lcd.print(F("Muc: "));
    lcd.print(avg_distance);
    lcd.print(F(" cm"));
  } else {
    lcd.setCursor(0, 0);
    lcd.print(F("Gio: "));
    lcd.print(now.hour());
    lcd.print(F(":"));
    if (now.minute() < 10) lcd.print(F("0"));
    lcd.print(now.minute());
    lcd.print(F(":"));
    if (now.second() < 10) lcd.print(F("0"));
    lcd.print(now.second());
    lcd.setCursor(0, 1);
    lcd.print(F("Muc: "));
    lcd.print(avg_distance);
    lcd.print(F(" cm"));
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

