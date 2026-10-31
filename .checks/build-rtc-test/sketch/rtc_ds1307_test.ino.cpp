#include <Arduino.h>
#line 1 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
/*
  DS1307 diagnostic only - Arduino Nano (ATmega328P).
  Wiring: module VCC -> Nano 5V, GND -> GND, SDA -> A4, SCL -> A5.
  DS1307 VCC operating range: 4.5-5.5V; the coin cell is backup power.
  Source: https://www.analog.com/media/en/technical-documentation/data-sheets/DS1307.pdf
  Serial Monitor: 9600 baud; Newline or Both NL & CR.
  No LCD, SIM, sensor, EEPROM or external library is used. Only Wire is needed.
  The clock is NEVER written automatically. Set it only with the time command.
*/
#include <Wire.h>
#include <string.h>

const uint8_t RTC_ADDRESS = 0x68;
const unsigned long CHECK_INTERVAL = 5000UL;
struct RtcTime {
  uint16_t year;
  uint8_t month, day, hour, minute, second;
};
char commandBuffer[32];
uint8_t commandLength = 0;
bool commandOverflow = false, havePreviousTime = false;
unsigned long lastCheckAt = 0, previousReadAt = 0;
uint32_t previousSeconds = 0;

#line 25 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
void printHex(uint8_t value);
#line 28 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
void printTwo(uint8_t value);
#line 29 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
void printHelp();
#line 40 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
uint8_t daysInMonth(uint16_t year, uint8_t month);
#line 44 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
bool validTime(const RtcTime &t);
#line 48 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
bool decodeBcd(uint8_t raw, uint8_t maximum, uint8_t &value);
#line 53 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
uint8_t encodeBcd(uint8_t value);
#line 54 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
bool decodeTime(const uint8_t *raw, RtcTime &t);
#line 66 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
void printTime(const RtcTime &t);
#line 70 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
uint32_t secondsSince2000(const RtcTime &t);
#line 76 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
void printBusError(uint8_t result);
#line 82 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
uint8_t readRaw(uint8_t *raw);
#line 95 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
void scanI2C();
#line 115 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
void checkRTC();
#line 143 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
bool parseTime(const char *line, RtcTime &t);
#line 160 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
void setRTC(const RtcTime &t);
#line 183 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
void processCommand(char *line);
#line 193 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
void readSerial();
#line 204 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
void setup();
#line 211 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
void loop();
#line 25 "D:\\iot\\rtc_ds1307_test\\rtc_ds1307_test.ino"
void printHex(uint8_t value) {
  Serial.print(F("0x")); if (value < 16) Serial.print('0'); Serial.print(value, HEX);
}
void printTwo(uint8_t value) { if (value < 10) Serial.print('0'); Serial.print(value); }
void printHelp() {
  Serial.println(F("\n=== TEST DS1307 / NANO ==="));
  Serial.println(F("VCC -> 5V; GND -> GND; SDA -> A4; SCL -> A5."));
  Serial.println(F("DS1307 can VCC 4.5-5.5V. Pin cuc ao chi de giu gio khi mat nguon chinh."));
  Serial.println(F("Serial: 9600 baud, Newline hoac Both NL & CR."));
  Serial.println(F("I2C hoac SCAN : do cac dia chi I2C."));
  Serial.println(F("RTC          : doc va kiem tra dong ho ngay."));
  Serial.println(F("HELP         : xem lai huong dan."));
  Serial.println(F("Dat gio: nhap YYYY-MM-DD HH:MM:SS bang ngay gio thuc te."));
  Serial.println(F("KHONG tu ghi gio bien dich. Tu doc lai moi 5 giay.\n"));
}
uint8_t daysInMonth(uint16_t year, uint8_t month) {
  if (month == 2) return year % 4 == 0 ? 29 : 28; // This sketch accepts 2000-2099 only.
  return month == 4 || month == 6 || month == 9 || month == 11 ? 30 : 31;
}
bool validTime(const RtcTime &t) {
  return t.year >= 2000 && t.year <= 2099 && t.month >= 1 && t.month <= 12 &&
    t.day >= 1 && t.day <= daysInMonth(t.year, t.month) && t.hour < 24 && t.minute < 60 && t.second < 60;
}
bool decodeBcd(uint8_t raw, uint8_t maximum, uint8_t &value) {
  if ((raw & 15) > 9 || (raw >> 4) > 9) return false;
  value = (raw >> 4) * 10 + (raw & 15);
  return value <= maximum;
}
uint8_t encodeBcd(uint8_t value) { return (value / 10) * 16 + value % 10; }
bool decodeTime(const uint8_t *raw, RtcTime &t) {
  uint8_t year;
  if ((raw[2] & 0x80) || !decodeBcd(raw[0] & 0x7f, 59, t.second) ||
      !decodeBcd(raw[1], 59, t.minute) || !decodeBcd(raw[4], 31, t.day) ||
      !decodeBcd(raw[5], 12, t.month) || !decodeBcd(raw[6], 99, year)) return false;
  t.year = 2000U + year;
  if (raw[2] & 0x40) {
    if (!decodeBcd(raw[2] & 0x1f, 12, t.hour) || !t.hour) return false;
    t.hour = t.hour % 12 + ((raw[2] & 0x20) ? 12 : 0);
  } else if (!decodeBcd(raw[2], 23, t.hour)) return false;
  return validTime(t);
}
void printTime(const RtcTime &t) {
  Serial.print(t.year); Serial.print('-'); printTwo(t.month); Serial.print('-'); printTwo(t.day);
  Serial.print(' '); printTwo(t.hour); Serial.print(':'); printTwo(t.minute); Serial.print(':'); printTwo(t.second);
}
uint32_t secondsSince2000(const RtcTime &t) {
  uint32_t days = 0;
  for (uint16_t year = 2000; year < t.year; year++) days += year % 4 == 0 ? 366 : 365;
  for (uint8_t month = 1; month < t.month; month++) days += daysInMonth(t.year, month);
  return ((days + t.day - 1) * 24UL + t.hour) * 3600UL + t.minute * 60UL + t.second;
}
void printBusError(uint8_t result) {
  if (result == 2) Serial.println(F("[RTC NOT_FOUND] Khong co phan hoi tai 0x68."));
  else if (result == 5 || Wire.getWireTimeoutFlag()) Serial.println(F("[I2C TIMEOUT] Bus bi ket/qua thoi gian cho."));
  else { Serial.print(F("[I2C ERROR] Ma loi: ")); Serial.println(result); }
  Serial.println(F("Kiem tra VCC 5V, GND, SDA=A4, SCL=A5; thay day neu can. Chua ket luan RTC hong."));
}
uint8_t readRaw(uint8_t *raw) {
  Wire.clearWireTimeoutFlag();
  Wire.beginTransmission(RTC_ADDRESS); Wire.write((uint8_t)0);
  uint8_t result = Wire.endTransmission();
  if (result) return result;
  uint8_t received = Wire.requestFrom(RTC_ADDRESS, (uint8_t)7);
  if (received != 7 || Wire.getWireTimeoutFlag()) {
    while (Wire.available()) Wire.read();
    return Wire.getWireTimeoutFlag() ? 5 : 6;
  }
  for (uint8_t i = 0; i < 7; i++) raw[i] = Wire.read();
  return 0;
}
void scanI2C() {
  Serial.println(F("\n=== I2C SCAN ==="));
  uint8_t count = 0; bool foundRtc = false;
  Wire.clearWireTimeoutFlag();
  for (uint8_t address = 8; address < 120; address++) {
    Wire.beginTransmission(address);
    uint8_t result = Wire.endTransmission();
    if (!result) {
      count++; Serial.print(F("FOUND ")); printHex(address);
      if (address == RTC_ADDRESS) { foundRtc = true; Serial.print(F(" <- dia chi RTC")); }
      if (address == 0x27 || address == 0x3f) Serial.print(F(" <- thuong la LCD"));
      Serial.println();
    } else if (result != 2 || Wire.getWireTimeoutFlag()) {
      printBusError(result); break;
    }
  }
  Serial.print(F("So thiet bi: ")); Serial.println(count);
  if (!foundRtc) Serial.println(F("KHONG THAY 0x68. Thay LCD khong co nghia da nhan RTC."));
  Serial.println(F("=== END SCAN ===\n"));
}
void checkRTC() {
  lastCheckAt = millis();
  Serial.print(F("[Uptime ")); Serial.print(lastCheckAt / 1000UL); Serial.println(F("s]"));
  uint8_t raw[7]; uint8_t result = readRaw(raw);
  if (result) { havePreviousTime = false; printBusError(result); return; }
  Serial.print(F("RAW [sec min hour weekday day month year]: "));
  for (uint8_t i = 0; i < 7; i++) { printHex(raw[i]); Serial.print(' '); }
  Serial.println();
  RtcTime now;
  if (!decodeTime(raw, now)) {
    havePreviousTime = false;
    Serial.println(F("[RTC INVALID] Du lieu BCD/ngay gio khong hop le. Dat lai gio thuc te.")); return;
  }
  Serial.print(F("Thoi gian: ")); printTime(now); Serial.println();
  if (raw[0] & 0x80) {
    havePreviousTime = false;
    Serial.println(F("[RTC STOPPED] CH=1: dong ho dang dung. Nhap ngay gio thuc te de bat chay.")); return;
  }
  Serial.println(F("[RTC READ OK] Nhan du 7 byte, CH=0, ngay gio hop le."));
  uint32_t seconds = secondsSince2000(now);
  unsigned long elapsed = millis() - previousReadAt;
  if (havePreviousTime && elapsed >= 2000UL && elapsed <= 15000UL) {
    if (seconds == previousSeconds) Serial.println(F("[CANH BAO] Gio khong tang. Kiem tra thach anh/nguon RTC."));
    else if (seconds < previousSeconds) Serial.println(F("[CANH BAO] Gio quay lui. Kiem tra lai nguon/pin va du lieu RTC."));
    else Serial.println(F("[RTC TICK OK] Thoi gian da tang so voi lan doc truoc."));
  }
  previousSeconds = seconds; previousReadAt = millis(); havePreviousTime = true;
}
bool parseTime(const char *line, RtcTime &t) {
  if (strlen(line) != 19) return false;
  uint16_t fields[6] = {0}; uint8_t field = 0;
  for (uint8_t i = 0; i < 19; i++) {
    if (i == 4 || i == 7 || i == 10 || i == 13 || i == 16) {
      char expected = i < 10 ? '-' : i == 10 ? ' ' : ':';
      if (line[i] != expected) return false;
      field++;
    } else {
      if (line[i] < '0' || line[i] > '9') return false;
      fields[field] = fields[field] * 10 + line[i] - '0';
    }
  }
  t.year = fields[0]; t.month = fields[1]; t.day = fields[2];
  t.hour = fields[3]; t.minute = fields[4]; t.second = fields[5];
  return validTime(t);
}
void setRTC(const RtcTime &t) {
  // This write is only performed following an explicit valid time command.
  Wire.clearWireTimeoutFlag();
  Wire.beginTransmission(RTC_ADDRESS); Wire.write((uint8_t)0);
  Wire.write(encodeBcd(t.second)); // CH=0 starts the oscillator.
  Wire.write(encodeBcd(t.minute)); Wire.write(encodeBcd(t.hour));
  uint8_t weekday = ((secondsSince2000(t) / 86400UL + 6) % 7) + 1; // Sunday=1; 2000-01-01=Saturday.
  Wire.write(weekday); Wire.write(encodeBcd(t.day)); Wire.write(encodeBcd(t.month));
  Wire.write(encodeBcd(t.year - 2000));
  uint8_t result = Wire.endTransmission();
  if (result || Wire.getWireTimeoutFlag()) { printBusError(result); return; }
  uint8_t raw[7]; RtcTime verified;
  result = readRaw(raw);
  if (result) { printBusError(result); return; }
  uint32_t expected = secondsSince2000(t);
  if ((raw[0] & 0x80) || !decodeTime(raw, verified) || secondsSince2000(verified) < expected ||
      secondsSince2000(verified) - expected > 2) {
    Serial.println(F("[SET FAILED] Doc lai khong khop gio vua ghi.")); return;
  }
  havePreviousTime = false;
  Serial.println(F("[SET OK] Da ghi va doc lai xac nhan. Cho 5 giay de kiem tra gio tang."));
  checkRTC();
}
void processCommand(char *line) {
  if (!strcmp(line, "I2C") || !strcmp(line, "i2c") || !strcmp(line, "SCAN") || !strcmp(line, "scan")) scanI2C();
  else if (!strcmp(line, "RTC") || !strcmp(line, "rtc")) checkRTC();
  else if (!strcmp(line, "HELP") || !strcmp(line, "help")) printHelp();
  else {
    RtcTime time;
    if (parseTime(line, time)) setRTC(time);
    else Serial.println(F("Lenh khong hop le. Dung I2C / RTC / HELP hoac YYYY-MM-DD HH:MM:SS."));
  }
}
void readSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r' || c == '\n') {
      if (commandOverflow) Serial.println(F("Lenh qua dai. Gui lai lenh tren 1 dong."));
      else if (commandLength) { commandBuffer[commandLength] = '\0'; processCommand(commandBuffer); }
      commandLength = 0; commandOverflow = false;
    } else if (commandLength < sizeof(commandBuffer) - 1) commandBuffer[commandLength++] = c;
    else commandOverflow = true;
  }
}
void setup() {
  Serial.begin(9600);
  Wire.begin(); Wire.setClock(100000UL); Wire.setWireTimeout(25000UL, true);
  // Keep the existing alert outputs off while running this standalone diagnostic.
  pinMode(6, OUTPUT); pinMode(9, OUTPUT); digitalWrite(6, LOW); digitalWrite(9, LOW);
  printHelp(); scanI2C(); checkRTC();
}
void loop() {
  readSerial();
  if (millis() - lastCheckAt >= CHECK_INTERVAL) checkRTC();
}

