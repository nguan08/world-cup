// app.js - World Cup Prediction Web App core logic

const TEAMS = [
  // BLUE ZONE
  { name: 'สเปน', zone: 'blue', multiplier: 1.0 },
  { name: 'ฝรั่งเศส', zone: 'blue', multiplier: 1.0 },
  { name: 'บราซิล', zone: 'blue', multiplier: 1.1 },
  { name: 'อาร์เจนตินา', zone: 'blue', multiplier: 1.1 },
  { name: 'อังกฤษ', zone: 'blue', multiplier: 1.1 },
  { name: 'เยอรมนี', zone: 'blue', multiplier: 1.2 },
  { name: 'โปรตุเกส', zone: 'blue', multiplier: 1.2 },
  { name: 'เบลเยียม', zone: 'blue', multiplier: 1.3 },
  { name: 'เนเธอร์แลนด์', zone: 'blue', multiplier: 1.3 },

  // GREEN ZONE
  { name: 'สวิตเซอร์แลนด์', zone: 'green', multiplier: 1.4 },
  { name: 'อุรุกวัย', zone: 'green', multiplier: 1.4 },
  { name: 'เม็กซิโก', zone: 'green', multiplier: 1.5 },
  { name: 'สหรัฐอเมริกา', zone: 'green', multiplier: 1.5 },
  { name: 'โมร็อกโก', zone: 'green', multiplier: 1.5 },
  { name: 'นอร์เวย์', zone: 'green', multiplier: 1.6 },
  { name: 'โคลอมเบีย', zone: 'green', multiplier: 1.6 },
  { name: 'ตูนิเซีย', zone: 'green', multiplier: 1.7 },
  { name: 'สาธารณรัฐเช็ก', zone: 'green', multiplier: 1.7 },
  { name: 'โครเอเชีย', zone: 'green', multiplier: 1.7 },

  // YELLOW ZONE
  { name: 'แคนาดา', zone: 'yellow', multiplier: 1.8 },
  { name: 'ญี่ปุ่น', zone: 'yellow', multiplier: 1.8 },
  { name: 'เอกวาดอร์', zone: 'yellow', multiplier: 1.8 },
  { name: 'บอสเนีย', zone: 'yellow', multiplier: 1.9 },
  { name: 'อียิปต์', zone: 'yellow', multiplier: 1.9 },
  { name: 'ออสเตรีย', zone: 'yellow', multiplier: 1.9 },
  { name: 'อิหร่าน', zone: 'yellow', multiplier: 2.0 },
  { name: 'ไอเวอรีโคสต์', zone: 'yellow', multiplier: 2.0 },
  { name: 'เกาหลีใต้', zone: 'yellow', multiplier: 2.1 },
  { name: 'แอลจีเรีย', zone: 'yellow', multiplier: 2.1 },

  // LIGHT ORANGE ZONE
  { name: 'ปารากวัย', zone: 'light-orange', multiplier: 2.2 },
  { name: 'สวีเดน', zone: 'light-orange', multiplier: 2.2 },
  { name: 'ฮอนดูรัส', zone: 'light-orange', multiplier: 2.3 },
  { name: 'สกอตแลนด์', zone: 'light-orange', multiplier: 2.3 },
  { name: 'เซเนกัล', zone: 'light-orange', multiplier: 2.4 },
  { name: 'กานา', zone: 'light-orange', multiplier: 2.4 },
  { name: 'ออสเตรเลีย', zone: 'light-orange', multiplier: 2.5 },
  { name: 'ซาอุดีอาระเบีย', zone: 'light-orange', multiplier: 2.5 },
  { name: 'ยูเครน', zone: 'light-orange', multiplier: 2.6 },
  { name: 'แอฟริกาใต้', zone: 'light-orange', multiplier: 2.6 },

  // RED-ORANGE ZONE
  { name: 'นิวซีแลนด์', zone: 'red-orange', multiplier: 2.7 },
  { name: 'ปานามา', zone: 'red-orange', multiplier: 2.7 },
  { name: 'กาตาร์', zone: 'red-orange', multiplier: 2.8 },
  { name: 'จอร์แดน', zone: 'red-orange', multiplier: 2.8 },
  { name: 'อุซเบกิสถาน', zone: 'red-orange', multiplier: 2.8 },
  { name: 'อิรัก', zone: 'red-orange', multiplier: 2.9 },
  { name: 'คูราเซา', zone: 'red-orange', multiplier: 2.9 },
  { name: 'เคปเวิร์ด', zone: 'red-orange', multiplier: 2.9 },
  { name: 'อิตาลี', zone: 'red-orange', multiplier: 3.0 }
];

const INITIAL_MATCHES = [
  { id: 1, home: 'เม็กซิโก', away: 'แอฟริกาใต้', homeScore: 2, awayScore: 0, status: 'finished', isKnockout: false, date: '2026-06-11' },
  { id: 2, home: 'เกาหลีใต้', away: 'สาธารณรัฐเช็ก', homeScore: 2, awayScore: 1, status: 'finished', isKnockout: false, date: '2026-06-11' },
  { id: 3, home: 'แคนาดา', away: 'บอสเนีย', homeScore: 1, awayScore: 1, status: 'finished', isKnockout: false, date: '2026-06-12' },
  { id: 4, home: 'สหรัฐอเมริกา', away: 'ปารากวัย', homeScore: 4, awayScore: 1, status: 'finished', isKnockout: false, date: '2026-06-12' },
  { id: 5, home: 'กาตาร์', away: 'สวิตเซอร์แลนด์', homeScore: null, awayScore: null, status: 'pending', isKnockout: false, date: '2026-06-13' },
  { id: 6, home: 'บราซิล', away: 'โมร็อกโก', homeScore: null, awayScore: null, status: 'pending', isKnockout: false, date: '2026-06-13' },
  { id: 7, home: 'อิตาลี', away: 'สกอตแลนด์', homeScore: null, awayScore: null, status: 'pending', isKnockout: false, date: '2026-06-14' },
  { id: 8, home: 'ออสเตรเลีย', away: 'ตุรกี', homeScore: null, awayScore: null, status: 'pending', isKnockout: false, date: '2026-06-14' },
  { id: 100, home: 'เยอรมนี', away: 'โครเอเชีย', homeScore: null, awayScore: null, status: 'pending', isKnockout: true, isFinal: true, date: '2026-07-19' }
];

const INITIAL_PLAYERS = [
  {
    "name": "ตู้ม 77",
    "teams": [
      "เม็กซิโก",
      "แอฟริกาใต้",
      "เกาหลีใต้",
      "สหรัฐอเมริกา",
      "ไอเวอรีโคสต์",
      "อังกฤษ",
      "โมร็อกโก",
      "กาตาร์",
      "อาร์เจนตินา",
      "ออสเตรเลีย",
      "สเปน",
      "ญี่ปุ่น",
      "ฝรั่งเศส",
      "เซเนกัล",
      "สวิตเซอร์แลนด์"
    ],
    "guess": 3,
    "targetScore": 31.1
  },
  {
    "name": "SNACK Arsenal",
    "teams": [
      "แอฟริกาใต้",
      "แคนาดา",
      "บอสเนีย",
      "สหรัฐอเมริกา",
      "ปารากวัย",
      "อาร์เจนตินา",
      "อังกฤษ",
      "สเปน",
      "กาตาร์",
      "สวิตเซอร์แลนด์",
      "ฝรั่งเศส",
      "เซเนกัล",
      "อุซเบกิสถาน",
      "อิรัก",
      "ญี่ปุ่น"
    ],
    "guess": 3,
    "targetScore": 28.5
  },
  {
    "name": "มุ้ง มิ้ง",
    "teams": [
      "เม็กซิโก",
      "แอฟริกาใต้",
      "เกาหลีใต้",
      "สาธารณรัฐเช็ก",
      "ปารากวัย",
      "โมร็อกโก",
      "ยูเครน",
      "สเปน",
      "อิตาลี",
      "โปรตุเกส",
      "สวิตเซอร์แลนด์",
      "ญี่ปุ่น",
      "เซเนกัล",
      "อังกฤษ",
      "ฝรั่งเศส"
    ],
    "guess": 3,
    "targetScore": 28.3
  },
  {
    "name": "YEAR",
    "teams": [
      "เม็กซิโก",
      "แคนาดา",
      "สหรัฐอเมริกา",
      "ปารากวัย",
      "เอกวาดอร์",
      "สเปน",
      "ฝรั่งเศส",
      "โมร็อกโก",
      "นิวซีแลนด์",
      "อิตาลี",
      "สวิตเซอร์แลนด์",
      "กาตาร์",
      "อังกฤษ",
      "ปานามา",
      "ญี่ปุ่น"
    ],
    "guess": 3,
    "targetScore": 27.8
  },
  {
    "name": "มง มงคล",
    "teams": [
      "เม็กซิโก",
      "เกาหลีใต้",
      "แคนาดา",
      "ปารากวัย",
      "บราซิล",
      "ฝรั่งเศส",
      "เอกวาดอร์",
      "โมร็อกโก",
      "อุรุกวัย",
      "อาร์เจนตินา",
      "ญี่ปุ่น",
      "อังกฤษ",
      "ออสเตรเลีย",
      "นิวซีแลนด์",
      "สวิตเซอร์แลนด์"
    ],
    "guess": 3,
    "targetScore": 27.8
  },
  {
    "name": "P ดีไซน์ชล Y9",
    "teams": [
      "เม็กซิโก",
      "แคนาดา",
      "สหรัฐอเมริกา",
      "ปารากวัย",
      "โครเอเชีย",
      "กาตาร์",
      "โมร็อกโก",
      "สเปน",
      "ญี่ปุ่น",
      "อิตาลี",
      "ฝรั่งเศส",
      "โปรตุเกส",
      "นิวซีแลนด์",
      "ออสเตรเลีย",
      "อังกฤษ"
    ],
    "guess": 4,
    "targetScore": 27.8
  },
  {
    "name": "กอล์ฟ BRY",
    "teams": [
      "แอฟริกาใต้",
      "เกาหลีใต้",
      "สาธารณรัฐเช็ก",
      "สหรัฐอเมริกา",
      "อิตาลี",
      "อังกฤษ",
      "สวีเดน",
      "เซเนกัล",
      "เบลเยียม",
      "นิวซีแลนด์",
      "ฝรั่งเศส",
      "สวิตเซอร์แลนด์",
      "ญี่ปุ่น",
      "สเปน",
      "ไอเวอรีโคสต์"
    ],
    "guess": 3,
    "targetScore": 27.1
  },
  {
    "name": "เด็กในตึกที่แสนดี",
    "teams": [
      "แคนาดา",
      "บอสเนีย",
      "สหรัฐอเมริกา",
      "ปารากวัย",
      "บราซิล",
      "อาร์เจนตินา",
      "อิตาลี",
      "ญี่ปุ่น",
      "อังกฤษ",
      "โมร็อกโก",
      "อิรัก",
      "ฝรั่งเศส",
      "โครเอเชีย",
      "นิวซีแลนด์",
      "กาตาร์"
    ],
    "guess": 4,
    "targetScore": 26
  },
  {
    "name": "หน่อย หนองคาย",
    "teams": [
      "เกาหลีใต้",
      "สหรัฐอเมริกา",
      "ปารากวัย",
      "เซเนกัล",
      "สเปน",
      "โครเอเชีย",
      "คูราเซา",
      "บราซิล",
      "สวิตเซอร์แลนด์",
      "โคลอมเบีย",
      "ญี่ปุ่น",
      "นิวซีแลนด์",
      "ฝรั่งเศส",
      "อังกฤษ",
      "อิรัก"
    ],
    "guess": 3,
    "targetScore": 25.4
  },
  {
    "name": "บ้านเช่า TheMua",
    "teams": [
      "เม็กซิโก",
      "เกาหลีใต้",
      "แคนาดา",
      "สเปน",
      "โมร็อกโก",
      "ฝรั่งเศส",
      "กาตาร์",
      "ไอเวอรีโคสต์",
      "อังกฤษ",
      "ญี่ปุ่น",
      "ออสเตรเลีย",
      "สวิตเซอร์แลนด์",
      "โครเอเชีย",
      "เซเนกัล",
      "บราซิล"
    ],
    "guess": 3,
    "targetScore": 23.4
  },
  {
    "name": "พี่ WonderMilk",
    "teams": [
      "เม็กซิโก",
      "เกาหลีใต้",
      "แคนาดา",
      "ญี่ปุ่น",
      "แอลจีเรีย",
      "บราซิล",
      "เซเนกัล",
      "ซาอุดีอาระเบีย",
      "โมร็อกโก",
      "อังกฤษ",
      "อาร์เจนตินา",
      "อิตาลี",
      "สเปน",
      "โครเอเชีย",
      "สวิตเซอร์แลนด์"
    ],
    "guess": 3,
    "targetScore": 23.4
  },
  {
    "name": "บ๊วย ลายคราม",
    "teams": [
      "เม็กซิโก",
      "สหรัฐอเมริกา",
      "ปารากวัย",
      "ออสเตรเลีย",
      "โคลอมเบีย",
      "นิวซีแลนด์",
      "บราซิล",
      "เยอรมนี",
      "อาร์เจนตินา",
      "อังกฤษ",
      "สวีเดน",
      "เซเนกัล",
      "กาตาร์",
      "สวิตเซอร์แลนด์",
      "ญี่ปุ่น"
    ],
    "guess": 3,
    "targetScore": 22.4
  },
  {
    "name": "ปาร์ค & บูบู้",
    "teams": [
      "เม็กซิโก",
      "เกาหลีใต้",
      "ปารากวัย",
      "เซเนกัล",
      "อุรุกวัย",
      "อิตาลี",
      "เยอรมนี",
      "สวีเดน",
      "โมร็อกโก",
      "ญี่ปุ่น",
      "สเปน",
      "สวิตเซอร์แลนด์",
      "ฝรั่งเศส",
      "อาร์เจนตินา",
      "แอลจีเรีย"
    ],
    "guess": 3,
    "targetScore": 22.4
  },
  {
    "name": "บูม เจ้าสัว",
    "teams": [
      "เม็กซิโก",
      "เกาหลีใต้",
      "ปารากวัย",
      "โปรตุเกส",
      "นิวซีแลนด์",
      "ฝรั่งเศส",
      "เซเนกัล",
      "สเปน",
      "โครเอเชีย",
      "ซาอุดีอาระเบีย",
      "ญี่ปุ่น",
      "กานา",
      "ตูนิเซีย",
      "อังกฤษ",
      "สวิตเซอร์แลนด์"
    ],
    "guess": 3,
    "targetScore": 22.4
  },
  {
    "name": "เจ๊ไฮ ซิ่งวิ่ง",
    "teams": [
      "เม็กซิโก",
      "สาธารณรัฐเช็ก",
      "บอสเนีย",
      "ปารากวัย",
      "สเปน",
      "นิวซีแลนด์",
      "โมร็อกโก",
      "อาร์เจนตินา",
      "ยูเครน",
      "ฝรั่งเศส",
      "เซเนกัล",
      "อิตาลี",
      "บราซิล",
      "ซาอุดีอาระเบีย",
      "สวิตเซอร์แลนด์"
    ],
    "guess": 3,
    "targetScore": 21
  },
  {
    "name": "เสี่ยโอม SHELL",
    "teams": [
      "แอฟริกาใต้",
      "เกาหลีใต้",
      "สาธารณรัฐเช็ก",
      "ปารากวัย",
      "สเปน",
      "เอกวาดอร์",
      "โปรตุเกส",
      "ญี่ปุ่น",
      "เบลเยียม",
      "โครเอเชีย",
      "โมร็อกโก",
      "ฝรั่งเศส",
      "นิวซีแลนด์",
      "อิตาลี",
      "สวิตเซอร์แลนด์"
    ],
    "guess": 3,
    "targetScore": 21
  },
  {
    "name": "แตงโม อบเชย",
    "teams": [
      "เม็กซิโก",
      "สาธารณรัฐเช็ก",
      "บอสเนีย",
      "ปารากวัย",
      "สเปน",
      "นิวซีแลนด์",
      "อิตาลี",
      "โมร็อกโก",
      "ฝรั่งเศส",
      "เอกวาดอร์",
      "สวิตเซอร์แลนด์",
      "ญี่ปุ่น",
      "เซเนกัล",
      "ออสเตรีย",
      "บราซิล"
    ],
    "guess": 3,
    "targetScore": 21
  },
  {
    "name": "กว้าง Y9",
    "teams": [
      "แอฟริกาใต้",
      "สาธารณรัฐเช็ก",
      "สหรัฐอเมริกา",
      "ปารากวัย",
      "ฝรั่งเศส",
      "เซเนกัล",
      "สวีเดน",
      "สเปน",
      "โมร็อกโก",
      "เนเธอร์แลนด์",
      "สวิตเซอร์แลนด์",
      "ญี่ปุ่น",
      "อาร์เจนตินา",
      "นิวซีแลนด์",
      "กาตาร์"
    ],
    "guess": 2,
    "targetScore": 21
  },
  {
    "name": "ป๊อป Y8",
    "teams": [
      "เกาหลีใต้",
      "สหรัฐอเมริกา",
      "อังกฤษ",
      "อิตาลี",
      "ฝรั่งเศส",
      "นิวซีแลนด์",
      "อุซเบกิสถาน",
      "กาตาร์",
      "สเปน",
      "สวิตเซอร์แลนด์",
      "กานา",
      "โคลอมเบีย",
      "โมร็อกโก",
      "ญี่ปุ่น",
      "เนเธอร์แลนด์"
    ],
    "guess": 2,
    "targetScore": 21
  },
  {
    "name": "บ๊วย น้ำแข็งพราว",
    "teams": [
      "เม็กซิโก",
      "แอฟริกาใต้",
      "สหรัฐอเมริกา",
      "อียิปต์",
      "ญี่ปุ่น",
      "บราซิล",
      "กานา",
      "อิตาลี",
      "อาร์เจนตินา",
      "สเปน",
      "นิวซีแลนด์",
      "สวิตเซอร์แลนด์",
      "เซเนกัล",
      "โครเอเชีย",
      "อังกฤษ"
    ],
    "guess": 3,
    "targetScore": 20.6
  },
  {
    "name": "ปลาหวาน",
    "teams": [
      "เม็กซิโก",
      "แอฟริกาใต้",
      "บอสเนีย",
      "ปารากวัย",
      "โปรตุเกส",
      "เซเนกัล",
      "โครเอเชีย",
      "นิวซีแลนด์",
      "อียิปต์",
      "โมร็อกโก",
      "สวิตเซอร์แลนด์",
      "สเปน",
      "อังกฤษ",
      "ฝรั่งเศส",
      "อิตาลี"
    ],
    "guess": 4,
    "targetScore": 20.3
  },
  {
    "name": "แฟน แม่มดบิ๊ก",
    "teams": [
      "เกาหลีใต้",
      "สาธารณรัฐเช็ก",
      "ปารากวัย",
      "โครเอเชีย",
      "กาตาร์",
      "สวีเดน",
      "ฝรั่งเศส",
      "อิตาลี",
      "สเปน",
      "ญี่ปุ่น",
      "สวิตเซอร์แลนด์",
      "อาร์เจนตินา",
      "เซเนกัล",
      "นิวซีแลนด์",
      "อังกฤษ"
    ],
    "guess": 5,
    "targetScore": 18.3
  },
  {
    "name": "Di.บอมบ์",
    "teams": [
      "แอฟริกาใต้",
      "แคนาดา",
      "บอสเนีย",
      "ปารากวัย",
      "อิตาลี",
      "เบลเยียม",
      "อุรุกวัย",
      "กาตาร์",
      "ญี่ปุ่น",
      "โมร็อกโก",
      "สวิตเซอร์แลนด์",
      "แอลจีเรีย",
      "สเปน",
      "อาร์เจนตินา",
      "อังกฤษ"
    ],
    "guess": 3,
    "targetScore": 18
  },
  {
    "name": "เจนนี่",
    "teams": [
      "แอฟริกาใต้",
      "แคนาดา",
      "บอสเนีย",
      "ปารากวัย",
      "อิตาลี",
      "สเปน",
      "ฝรั่งเศส",
      "อาร์เจนตินา",
      "อังกฤษ",
      "เซเนกัล",
      "กาตาร์",
      "สวิตเซอร์แลนด์",
      "กานา",
      "โครเอเชีย",
      "โมร็อกโก"
    ],
    "guess": 3,
    "targetScore": 18
  },
  {
    "name": "แอนนี่",
    "teams": [
      "แอฟริกาใต้",
      "แคนาดา",
      "บอสเนีย",
      "ปารากวัย",
      "สเปน",
      "ออสเตรเลีย",
      "ญี่ปุ่น",
      "ฝรั่งเศส",
      "บราซิล",
      "อาร์เจนตินา",
      "เซเนกัล",
      "นิวซีแลนด์",
      "โครเอเชีย",
      "อิหร่าน",
      "อิตาลี"
    ],
    "guess": 3,
    "targetScore": 18
  },
  {
    "name": "ฟาร์ม มิลค์แลนด์",
    "teams": [
      "เม็กซิโก",
      "เกาหลีใต้",
      "นิวซีแลนด์",
      "ญี่ปุ่น",
      "ปานามา",
      "โครเอเชีย",
      "อิรัก",
      "สเปน",
      "ฝรั่งเศส",
      "กานา",
      "กาตาร์",
      "สวิตเซอร์แลนด์",
      "เซเนกัล",
      "บราซิล",
      "อาร์เจนตินา"
    ],
    "guess": 3,
    "targetScore": 18
  },
  {
    "name": "JOJOO",
    "teams": [
      "แอฟริกาใต้",
      "แคนาดา",
      "บอสเนีย",
      "ปารากวัย",
      "บราซิล",
      "ไอเวอรีโคสต์",
      "สเปน",
      "โมร็อกโก",
      "อังกฤษ",
      "ฝรั่งเศส",
      "สวิตเซอร์แลนด์",
      "เอกวาดอร์",
      "โครเอเชีย",
      "นิวซีแลนด์",
      "โคลอมเบีย"
    ],
    "guess": 3,
    "targetScore": 18
  },
  {
    "name": "สเป็ค สปีด",
    "teams": [
      "เม็กซิโก",
      "แคนาดา",
      "ปารากวัย",
      "อาร์เจนตินา",
      "ญี่ปุ่น",
      "ฝรั่งเศส",
      "โมร็อกโก",
      "ฮอนดูรัส",
      "อิตาลี",
      "สวิตเซอร์แลนด์",
      "สเปน",
      "โคลอมเบีย",
      "อิรัก",
      "บราซิล",
      "กาตาร์"
    ],
    "guess": 2,
    "targetScore": 17.3
  },
  {
    "name": "ต้น เปียกตง",
    "teams": [
      "บอสเนีย",
      "สหรัฐอเมริกา",
      "อังกฤษ",
      "แอลจีเรีย",
      "โคลอมเบีย",
      "เซเนกัล",
      "เอกวาดอร์",
      "กาตาร์",
      "นิวซีแลนด์",
      "อิตาลี",
      "โปรตุเกส",
      "อุรุกวัย",
      "สวิตเซอร์แลนด์",
      "บราซิล",
      "ฝรั่งเศส"
    ],
    "guess": 3,
    "targetScore": 16.3
  },
  {
    "name": "ก้อง พุธโธง",
    "teams": [
      "บอสเนีย",
      "สหรัฐอเมริกา",
      "สวิตเซอร์แลนด์",
      "โครเอเชีย",
      "โมร็อกโก",
      "นิวซีแลนด์",
      "เยอรมนี",
      "กานา",
      "ฝรั่งเศส",
      "กาตาร์",
      "เบลเยียม",
      "เอกวาดอร์",
      "อิตาลี",
      "อังกฤษ",
      "ญี่ปุ่น"
    ],
    "guess": 4,
    "targetScore": 16.2
  },
  {
    "name": "ฟิวช่า",
    "teams": [
      "แอฟริกาใต้",
      "สาธารณรัฐเช็ก",
      "แคนาดา",
      "ปารากวัย",
      "โปรตุเกส",
      "สเปน",
      "เซเนกัล",
      "โมร็อกโก",
      "อาร์เจนตินา",
      "สวิตเซอร์แลนด์",
      "แอลจีเรีย",
      "อุรุกวัย",
      "อังกฤษ",
      "กาตาร์",
      "นิวซีแลนด์"
    ],
    "guess": 4,
    "targetScore": 15.9
  },
  {
    "name": "เบ๊นซ์ โซล่าเซลล์",
    "teams": [
      "แคนาดา",
      "สหรัฐอเมริกา",
      "ยูเครน",
      "โปรตุเกส",
      "นอร์เวย์",
      "กาตาร์",
      "อียิปต์",
      "สเปน",
      "นิวซีแลนด์",
      "อิตาลี",
      "ฝรั่งเศส",
      "ญี่ปุ่น",
      "สวิตเซอร์แลนด์",
      "อังกฤษ",
      "โมร็อกโก"
    ],
    "guess": 3,
    "targetScore": 15.9
  },
  {
    "name": "น้ำทิพย์ ฟลูอออน",
    "teams": [
      "เกาหลีใต้",
      "แคนาดา",
      "ฝรั่งเศส",
      "สเปน",
      "โคลอมเบีย",
      "โปรตุเกส",
      "สวีเดน",
      "อาร์เจนตินา",
      "ออสเตรเลีย",
      "กาตาร์",
      "โมร็อกโก",
      "ญี่ปุ่น",
      "โครเอเชีย",
      "นิวซีแลนด์",
      "สวิตเซอร์แลนด์"
    ],
    "guess": 3,
    "targetScore": 15.9
  },
  {
    "name": "ต้น YEC9",
    "teams": [
      "เกาหลีใต้",
      "ปารากวัย",
      "โมร็อกโก",
      "กานา",
      "อิรัก",
      "สเปน",
      "อุซเบกิสถาน",
      "กาตาร์",
      "ฝรั่งเศส",
      "บราซิล",
      "อาร์เจนตินา",
      "นิวซีแลนด์",
      "สวิตเซอร์แลนด์",
      "ญี่ปุ่น",
      "โคลอมเบีย"
    ],
    "guess": 5,
    "targetScore": 14.9
  },
  {
    "name": "ยอด YEC9",
    "teams": [
      "เกาหลีใต้",
      "ปารากวัย",
      "นอร์เวย์",
      "สเปน",
      "ฝรั่งเศส",
      "บราซิล",
      "โคลอมเบีย",
      "ญี่ปุ่น",
      "อาร์เจนตินา",
      "กานา",
      "อุซเบกิสถาน",
      "นิวซีแลนด์",
      "สวิตเซอร์แลนด์",
      "แอลจีเรีย",
      "โมร็อกโก"
    ],
    "guess": 6,
    "targetScore": 14.9
  },
  {
    "name": "ฟิล์ม ฟิวส์แลนด์",
    "teams": [
      "สหรัฐอเมริกา",
      "ปารากวัย",
      "อังกฤษ",
      "สวิตเซอร์แลนด์",
      "เอกวาดอร์",
      "ปานามา",
      "ฝรั่งเศส",
      "บราซิล",
      "สเปน",
      "อิตาลี",
      "สกอตแลนด์",
      "กาตาร์",
      "เซเนกัล",
      "โคลอมเบีย",
      "ญี่ปุ่น"
    ],
    "guess": 3,
    "targetScore": 14.9
  },
  {
    "name": "ปาล์ม มอมเม้นท์",
    "teams": [
      "สาธารณรัฐเช็ก",
      "แคนาดา",
      "ปารากวัย",
      "โคลอมเบีย",
      "อิตาลี",
      "อาร์เจนตินา",
      "ฝรั่งเศส",
      "โมร็อกโก",
      "เซเนกัล",
      "อังกฤษ",
      "อิหร่าน",
      "กาตาร์",
      "สวิตเซอร์แลนด์",
      "สเปน",
      "แอลจีเรีย"
    ],
    "guess": 3,
    "targetScore": 13.1
  },
  {
    "name": "เดช ซูเปอร์ริชาร์จ",
    "teams": [
      "เม็กซิโก",
      "สาธารณรัฐเช็ก",
      "ปารากวัย",
      "นิวซีแลนด์",
      "แอลจีเรีย",
      "ยูเครน",
      "สเปน",
      "ฝรั่งเศส",
      "อุรุกวัย",
      "บราซิล",
      "อิตาลี",
      "กาตาร์",
      "โมร็อกโก",
      "ญี่ปุ่น",
      "อาร์เจนตินา"
    ],
    "guess": 3,
    "targetScore": 15.2
  },
  {
    "name": "เมย์ แกรนด์พลาซ่า",
    "teams": [
      "เกาหลีใต้",
      "ปารากวัย",
      "เซเนกัล",
      "ออสเตรเลีย",
      "สเปน",
      "ญี่ปุ่น",
      "เบลเยียม",
      "อังกฤษ",
      "ฝรั่งเศส",
      "สวิตเซอร์แลนด์",
      "สวีเดน",
      "กาตาร์",
      "โมร็อกโก",
      "นอร์เวย์",
      "โครเอเชีย"
    ],
    "guess": 3,
    "targetScore": 15.1
  },
  {
    "name": "พี่ยักษ์",
    "teams": [
      "เกาหลีใต้",
      "ปารากวัย",
      "เซเนกัล",
      "โปรตุเกส",
      "นอร์เวย์",
      "อังกฤษ",
      "สเปน",
      "กาตาร์",
      "ปานามา",
      "ฝรั่งเศส",
      "โคลอมเบีย",
      "ญี่ปุ่น",
      "สวิตเซอร์แลนด์",
      "โครเอเชีย",
      "กานา"
    ],
    "guess": 3,
    "targetScore": 15.1
  },
  {
    "name": "ปอนด์ สัมมาชีพ",
    "teams": [
      "เกาหลีใต้",
      "ปารากวัย",
      "กาตาร์",
      "อุรุกวัย",
      "โมร็อกโก",
      "สเปน",
      "นิวซีแลนด์",
      "อิตาลี",
      "ฝรั่งเศส",
      "อาร์เจนตินา",
      "โครเอเชีย",
      "สวิตเซอร์แลนด์",
      "บราซิล",
      "สกอตแลนด์",
      "เอกวาดอร์"
    ],
    "guess": 4,
    "targetScore": 15.1
  },
  {
    "name": "โอ่ Y9",
    "teams": [
      "เม็กซิโก",
      "แคนาดา",
      "โมร็อกโก",
      "ฝรั่งเศส",
      "เอกวาดอร์",
      "กาตาร์",
      "เนเธอร์แลนด์",
      "สวิตเซอร์แลนด์",
      "ญี่ปุ่น",
      "อุรุกวัย",
      "สเปน",
      "ไอเวอรีโคสต์",
      "อาร์เจนตินา",
      "เซเนกัล",
      "นิวซีแลนด์"
    ],
    "guess": 3,
    "targetScore": 12.9
  },
  {
    "name": "กอล์ฟ สลัก Y9",
    "teams": [
      "เม็กซิโก",
      "แคนาดา",
      "อังกฤษ",
      "อาร์เจนตินา",
      "อิตาลี",
      "โมร็อกโก",
      "นิวซีแลนด์",
      "ยูเครน",
      "กานา",
      "สวีเดน",
      "โปรตุเกส",
      "ออสเตรเลีย",
      "สเปน",
      "สวิตเซอร์แลนด์",
      "ญี่ปุ่น"
    ],
    "guess": 3,
    "targetScore": 12.9
  },
  {
    "name": "ซัน CALTEX",
    "teams": [
      "เม็กซิโก",
      "ปารากวัย",
      "อาร์เจนตินา",
      "บราซิล",
      "สวิตเซอร์แลนด์",
      "ฝรั่งเศส",
      "ออสเตรีย",
      "ญี่ปุ่น",
      "โมร็อกโก",
      "สเปน",
      "อุซเบกิสถาน",
      "เซเนกัล",
      "เอกวาดอร์",
      "โครเอเชีย",
      "นิวซีแลนด์"
    ],
    "guess": 3,
    "targetScore": 11.9
  },
  {
    "name": "อ้วน จอมบงการ",
    "teams": [
      "สหรัฐอเมริกา",
      "เซเนกัล",
      "เยอรมนี",
      "สเปน",
      "โคลอมเบีย",
      "สวิตเซอร์แลนด์",
      "นิวซีแลนด์",
      "ญี่ปุ่น",
      "อิตาลี",
      "อาร์เจนตินา",
      "อิรัก",
      "โมร็อกโก",
      "อังกฤษ",
      "กานา",
      "เคปเวิร์ด"
    ],
    "guess": 3,
    "targetScore": 10.5
  },
  {
    "name": "เก๋ Y9",
    "teams": [
      "สหรัฐอเมริกา",
      "ญี่ปุ่น",
      "สเปน",
      "โมร็อกโก",
      "โคลอมเบีย",
      "เนเธอร์แลนด์",
      "นิวซีแลนด์",
      "สวิตเซอร์แลนด์",
      "ซาอุดีอาระเบีย",
      "ฝรั่งเศส",
      "อิตาลี",
      "กาตาร์",
      "บราซิล",
      "แอลจีเรีย",
      "ไอเวอรีโคสต์"
    ],
    "guess": 4,
    "targetScore": 10.5
  },
  {
    "name": "ฝั่ง ตั้งสมบัต",
    "teams": [
      "แอฟริกาใต้",
      "สาธารณรัฐเช็ก",
      "ปารากวัย",
      "สเปน",
      "โครเอเชีย",
      "อาร์เจนตินา",
      "สวิตเซอร์แลนด์",
      "โคลอมเบีย",
      "สวีเดน",
      "เซเนกัล",
      "ฝรั่งเศส",
      "ญี่ปุ่น",
      "ไอเวอรีโคสต์",
      "เยอรมนี",
      "นิวซีแลนด์"
    ],
    "guess": 3,
    "targetScore": 10.5
  },
  {
    "name": "กรรณิกา",
    "teams": [
      "เกาหลีใต้",
      "เอกวาดอร์",
      "สเปน",
      "โปรตุเกส",
      "เซเนกัล",
      "อาร์เจนตินา",
      "บราซิล",
      "ญี่ปุ่น",
      "สวิตเซอร์แลนด์",
      "โมร็อกโก",
      "ไอเวอรีโคสต์",
      "นิวซีแลนด์",
      "โคลอมเบีย",
      "อิตาลี",
      "นอร์เวย์"
    ],
    "guess": 5,
    "targetScore": 10.5
  },
  {
    "name": "เก่ง โฟกัส",
    "teams": [
      "สหรัฐอเมริกา",
      "ญี่ปุ่น",
      "โมร็อกโก",
      "อังกฤษ",
      "นิวซีแลนด์",
      "บราซิล",
      "อุซเบกิสถาน",
      "เยอรมนี",
      "สวิตเซอร์แลนด์",
      "เซเนกัล",
      "กาตาร์",
      "นอร์เวย์",
      "ฝรั่งเศส",
      "แอลจีเรีย",
      "ออสเตรีย"
    ],
    "guess": 5,
    "targetScore": 10.5
  },
  {
    "name": "จอน นามรอง",
    "teams": [
      "เกาหลีใต้",
      "อาร์เจนตินา",
      "เซเนกัล",
      "สเปน",
      "เบลเยียม",
      "สวิตเซอร์แลนด์",
      "ฝรั่งเศส",
      "สวีเดน",
      "โคลอมเบีย",
      "อิตาลี",
      "แอลจีเรีย",
      "กานา",
      "ญี่ปุ่น",
      "โมร็อกโก",
      "อุซเบกิสถาน"
    ],
    "guess": 5,
    "targetScore": 10.5
  },
  {
    "name": "น้องกิ๊ก คนสวย",
    "teams": [
      "สหรัฐอเมริกา",
      "สวิตเซอร์แลนด์",
      "นิวซีแลนด์",
      "โครเอเชีย",
      "เซเนกัล",
      "โปรตุเกส",
      "สเปน",
      "เบลเยียม",
      "ฝรั่งเศส",
      "อิตาลี",
      "สกอตแลนด์",
      "โคลอมเบีย",
      "ญี่ปุ่น",
      "แอลจีเรีย",
      "อุซเบกิสถาน"
    ],
    "guess": 5,
    "targetScore": 10.5
  },
  {
    "name": "หงวด โรงกลึง",
    "teams": [
      "แอฟริกาใต้",
      "สาธารณรัฐเช็ก",
      "ปารากวัย",
      "โมร็อกโก",
      "ญี่ปุ่น",
      "นิวซีแลนด์",
      "อุซเบกิสถาน",
      "เซเนกัล",
      "ฝรั่งเศส",
      "เยอรมนี",
      "สวิตเซอร์แลนด์",
      "สวีเดน",
      "อังกฤษ",
      "สเปน",
      "กาตาร์"
    ],
    "guess": 5,
    "targetScore": 10.5
  },
  {
    "name": "สิตา ยาคูท์",
    "teams": [
      "เกาหลีใต้",
      "อุรุกวัย",
      "อังกฤษ",
      "ญี่ปุ่น",
      "สเปน",
      "โมร็อกโก",
      "แอลจีเรีย",
      "ฝรั่งเศส",
      "เซเนกัล",
      "บราซิล",
      "นิวซีแลนด์",
      "โครเอเชีย",
      "สวิตเซอร์แลนด์",
      "เอกวาดอร์",
      "เคปเวิร์ด"
    ],
    "guess": 5,
    "targetScore": 10.5
  },
  {
    "name": "อั้ม เอสซ่า",
    "teams": [
      "สาธารณรัฐเช็ก",
      "แคนาดา",
      "สเปน",
      "โครเอเชีย",
      "เนเธอร์แลนด์",
      "ฝรั่งเศส",
      "โมร็อกโก",
      "สวิตเซอร์แลนด์",
      "อียิปต์",
      "เยอรมนี",
      "อิรัก",
      "ญี่ปุ่น",
      "แอลจีเรีย",
      "เซเนกัล",
      "นิวซีแลนด์"
    ],
    "guess": 4,
    "targetScore": 8.8
  },
  {
    "name": "ประธานบอม Miles",
    "teams": [
      "สาธารณรัฐเช็ก",
      "แคนาดา",
      "โปรตุเกส",
      "เบลเยียม",
      "โมร็อกโก",
      "ไอเวอรีโคสต์",
      "ซาอุดีอาระเบีย",
      "นิวซีแลนด์",
      "ญี่ปุ่น",
      "สเปน",
      "สวิตเซอร์แลนด์",
      "กาตาร์",
      "ฝรั่งเศส",
      "อิตาลี",
      "อิรัก"
    ],
    "guess": 3,
    "targetScore": 8.8
  },
  {
    "name": "คุณแม่เป้สปอย",
    "teams": [
      "เม็กซิโก",
      "อาร์เจนตินา",
      "โครเอเชีย",
      "สเปน",
      "ฝรั่งเศส",
      "กาตาร์",
      "เซเนกัล",
      "กานา",
      "สวีเดน",
      "สวิตเซอร์แลนด์",
      "อังกฤษ",
      "อุซเบกิสถาน",
      "อิตาลี",
      "ญี่ปุ่น",
      "อุรุกวัย"
    ],
    "guess": 3,
    "targetScore": 7.5
  },
  {
    "name": "ฝัน หนองกี่",
    "teams": [
      "เม็กซิโก",
      "สวีเดน",
      "สเปน",
      "ฝรั่งเศส",
      "เซเนกัล",
      "ญี่ปุ่น",
      "อิหร่าน",
      "เอกวาดอร์",
      "ไอเวอรีโคสต์",
      "บราซิล",
      "นิวซีแลนด์",
      "โคลอมเบีย",
      "โครเอเชีย",
      "สวิตเซอร์แลนด์",
      "อาร์เจนตินา"
    ],
    "guess": 3,
    "targetScore": 7.5
  },
  {
    "name": "บูม ซอยอย่าได้แคร์",
    "teams": [
      "เม็กซิโก",
      "เยอรมนี",
      "กาตาร์",
      "นิวซีแลนด์",
      "อิตาลี",
      "อังกฤษ",
      "โครเอเชีย",
      "สเปน",
      "แอลจีเรีย",
      "สกอตแลนด์",
      "ฝรั่งเศส",
      "ซาอุดีอาระเบีย",
      "ญี่ปุ่น",
      "อุซเบกิสถาน",
      "โคลอมเบีย"
    ],
    "guess": 3,
    "targetScore": 7.5
  },
  {
    "name": "บีม",
    "teams": [
      "แอฟริกาใต้",
      "สาธารณรัฐเช็ก",
      "อังกฤษ",
      "สเปน",
      "แอลจีเรีย",
      "อุซเบกิสถาน",
      "นิวซีแลนด์",
      "เยอรมนี",
      "สวิตเซอร์แลนด์",
      "อิตาลี",
      "อียิปต์",
      "โคลอมเบีย",
      "โครเอเชีย",
      "ฝรั่งเศส",
      "เซเนกัล"
    ],
    "guess": 4,
    "targetScore": 6
  },
  {
    "name": "ปุ๊ก บางพระ",
    "teams": [
      "อังกฤษ",
      "อุรุกวัย",
      "ฝรั่งเศส",
      "เบลเยียม",
      "ญี่ปุ่น",
      "ฮอนดูรัส",
      "สกอตแลนด์",
      "อิตาลี",
      "แอลจีเรีย",
      "กาตาร์",
      "นิวซีแลนด์",
      "โคลอมเบีย",
      "เซเนกัล",
      "สวิตเซอร์แลนด์",
      "บราซิล"
    ],
    "guess": 5,
    "targetScore": 0
  },
  {
    "name": "ต้อง LAPAZ",
    "teams": [
      "ตูนิเซีย",
      "ออสเตรีย",
      "อาร์เจนตินา",
      "กาตาร์",
      "ฝรั่งเศส",
      "โมร็อกโก",
      "ญี่ปุ่น",
      "เซเนกัล",
      "สเปน",
      "อังกฤษ",
      "โครเอเชีย",
      "ไอเวอรีโคสต์",
      "อิรัก",
      "สวิตเซอร์แลนด์",
      "แอลจีเรีย"
    ],
    "guess": 5,
    "targetScore": 0
  },
  {
    "name": "เมย์ ดนัย แคมป์เก้า",
    "teams": [
      "บราซิล",
      "ฝรั่งเศส",
      "โมร็อกโก",
      "ญี่ปุ่น",
      "อิรัก",
      "นิวซีแลนด์",
      "โครเอเชีย",
      "โคลอมเบีย",
      "อังกฤษ",
      "ฮอนดูรัส",
      "สวิตเซอร์แลนด์",
      "อียิปต์",
      "กาตาร์",
      "อิตาลี",
      "อาร์เจนตินา"
    ],
    "guess": 5,
    "targetScore": 0
  }
];

// State variables
let matches = [];
let players = [];
let isAdmin = false;

function initAdminState() {
  isAdmin = sessionStorage.getItem('worldcup_isAdmin') === 'true';
  updateAdminUI();
}

function updateAdminUI() {
  const openAddPlayerBtn = document.getElementById('open-add-player-btn');
  const openAddMatchBtn = document.getElementById('open-add-match-btn');
  const adminStatusText = document.getElementById('admin-status-text');
  const adminLoginToggleBtn = document.getElementById('admin-login-toggle-btn');
  const resetAllBtn = document.getElementById('reset-all-btn');
  
  if (isAdmin) {
    if (openAddPlayerBtn) openAddPlayerBtn.style.display = 'block';
    if (openAddMatchBtn) openAddMatchBtn.style.display = 'block';
    if (adminStatusText) {
      adminStatusText.textContent = 'แอดมิน';
      adminStatusText.style.color = 'var(--zone-green)';
    }
    if (adminLoginToggleBtn) {
      adminLoginToggleBtn.textContent = 'ออกจากระบบ';
      adminLoginToggleBtn.classList.remove('btn-secondary');
      adminLoginToggleBtn.classList.add('btn-primary');
      adminLoginToggleBtn.style.background = 'linear-gradient(135deg, var(--accent), #e11d48)';
    }
    if (resetAllBtn) resetAllBtn.style.display = 'block';
  } else {
    if (openAddPlayerBtn) openAddPlayerBtn.style.display = 'none';
    if (openAddMatchBtn) openAddMatchBtn.style.display = 'none';
    if (adminStatusText) {
      adminStatusText.textContent = 'ผู้เข้าชม';
      adminStatusText.style.color = 'var(--text-muted)';
    }
    if (adminLoginToggleBtn) {
      adminLoginToggleBtn.textContent = 'เข้าสู่ระบบแอดมิน';
      adminLoginToggleBtn.classList.remove('btn-primary');
      adminLoginToggleBtn.classList.add('btn-secondary');
      adminLoginToggleBtn.style.background = 'rgba(255, 255, 255, 0.05)';
    }
    if (resetAllBtn) resetAllBtn.style.display = 'none';
  }

  // Re-render leaderboard and dashboard to show/hide edit column
  if (document.getElementById('dashboard') && document.getElementById('dashboard').classList.contains('active')) {
    renderDashboard();
  }
  if (document.getElementById('leaderboard') && document.getElementById('leaderboard').classList.contains('active')) {
    renderLeaderboard();
  }
  // Always update the admin column header visibility even if not on those tabs
  const lbAdminCol = document.getElementById('lb-admin-col');
  if (lbAdminCol) lbAdminCol.style.display = isAdmin ? 'table-cell' : 'none';
  const top5AdminCol = document.getElementById('top5-admin-col');
  if (top5AdminCol) top5AdminCol.style.display = isAdmin ? 'table-cell' : 'none';
}

// Initialize data from localstorage or initial arrays
function initData() {
  const storedMatches = localStorage.getItem('worldcup_matches');
  const storedPlayers = localStorage.getItem('worldcup_players');
  
  if (storedMatches) {
    matches = JSON.parse(storedMatches);
    // Migrate: add dates from INITIAL_MATCHES if missing
    let migrated = false;
    matches.forEach(m => {
      if (!m.date) {
        const initialMatch = INITIAL_MATCHES.find(im => im.id === m.id);
        if (initialMatch && initialMatch.date) {
          m.date = initialMatch.date;
          migrated = true;
        }
      }
    });
    if (migrated) localStorage.setItem('worldcup_matches', JSON.stringify(matches));
  } else {
    matches = [...INITIAL_MATCHES];
    localStorage.setItem('worldcup_matches', JSON.stringify(matches));
  }
  
  if (storedPlayers) {
    players = JSON.parse(storedPlayers);
  } else {
    players = [...INITIAL_PLAYERS];
    localStorage.setItem('worldcup_players', JSON.stringify(players));
  }

  loadEliminatedTeams();
}

// Calculate team points from matches
function calculateTeamPoints() {
  const teamScores = {};
  
  // Initialize all teams with 0 points
  TEAMS.forEach(team => {
    teamScores[team.name] = {
      points: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0
    };
  });
  
  // Compute match points
  matches.forEach(match => {
    if (match.status !== 'finished') return;
    
    const h = match.homeScore;
    const a = match.awayScore;
    
    // Add stats to teams
    if (teamScores[match.home]) {
      teamScores[match.home].played++;
      teamScores[match.home].goalsFor += h;
      teamScores[match.home].goalsAgainst += a;
    }
    if (teamScores[match.away]) {
      teamScores[match.away].played++;
      teamScores[match.away].goalsFor += a;
      teamScores[match.away].goalsAgainst += h;
    }
    
    let homeResPoints = 0;
    let awayResPoints = 0;
    
    if (h > a) {
      homeResPoints = 3; // Win
      awayResPoints = 1; // Loss
      if (teamScores[match.home]) teamScores[match.home].wins++;
      if (teamScores[match.away]) teamScores[match.away].losses++;
    } else if (h < a) {
      homeResPoints = 1; // Loss
      awayResPoints = 3; // Win
      if (teamScores[match.home]) teamScores[match.home].losses++;
      if (teamScores[match.away]) teamScores[match.away].wins++;
    } else {
      // Draw (in normal time or 120 mins)
      if (match.isKnockout && match.penaltyWinner) {
        // Knockout draw decided by penalties
        if (match.penaltyWinner === 'home') {
          homeResPoints = 3;
          awayResPoints = 1;
          if (teamScores[match.home]) teamScores[match.home].wins++;
          if (teamScores[match.away]) teamScores[match.away].losses++;
        } else {
          homeResPoints = 1;
          awayResPoints = 3;
          if (teamScores[match.home]) teamScores[match.home].losses++;
          if (teamScores[match.away]) teamScores[match.away].wins++;
        }
      } else {
        // Normal draw
        homeResPoints = 2;
        awayResPoints = 2;
        if (teamScores[match.home]) teamScores[match.home].draws++;
        if (teamScores[match.away]) teamScores[match.away].draws++;
      }
    }
    
    // Calculate final points based on multiplier: (resultPoints + goals) * multiplier
    const hTeam = TEAMS.find(t => t.name === match.home);
    const aTeam = TEAMS.find(t => t.name === match.away);
    
    if (hTeam && teamScores[match.home]) {
      teamScores[match.home].points += (homeResPoints + h) * hTeam.multiplier;
    }
    if (aTeam && teamScores[match.away]) {
      teamScores[match.away].points += (awayResPoints + a) * aTeam.multiplier;
    }
  });
  
  // Format numbers
  for (const name in teamScores) {
    teamScores[name].points = parseFloat(teamScores[name].points.toFixed(2));
  }
  
  return teamScores;
}

// Calculate final prediction score for a user
function calculatePredictionPoints(user, finalMatch) {
  if (!finalMatch || finalMatch.status !== 'finished') return 0;
  
  const totalGoals = finalMatch.homeScore + finalMatch.awayScore;
  if (user.guess !== totalGoals) return 0; // Guess incorrect
  
  // Guess is correct, calculate points: (A_goals * A_mult) + (B_goals * B_mult)
  // Rule: 0 and 1 goals = 1 goal
  const rawHomeGoals = finalMatch.homeScore;
  const rawAwayGoals = finalMatch.awayScore;
  
  const calcHomeGoals = rawHomeGoals <= 1 ? 1 : rawHomeGoals;
  const calcAwayGoals = rawAwayGoals <= 1 ? 1 : rawAwayGoals;
  
  const hTeam = TEAMS.find(t => t.name === finalMatch.home);
  const aTeam = TEAMS.find(t => t.name === finalMatch.away);
  
  const hMult = hTeam ? hTeam.multiplier : 1;
  const aMult = aTeam ? aTeam.multiplier : 1;
  
  let score = (calcHomeGoals * hMult) + (calcAwayGoals * aMult);
  
  // Capping at 7 points
  if (score > 7) {
    score = 7;
  }
  
  return parseFloat(score.toFixed(2));
}

// Calculate player total score & sort them
function processPlayers(teamScores) {
  const finalMatch = matches.find(m => m.isFinal);
  
  const processed = players.map(player => {
    let teamsScore = 0;
    const teamBreakdown = [];
    
    player.teams.forEach(teamName => {
      const tScore = teamScores[teamName] ? teamScores[teamName].points : 0;
      teamsScore += tScore;
      
      const teamObj = TEAMS.find(t => t.name === teamName);
      teamBreakdown.push({
        name: teamName,
        zone: teamObj ? teamObj.zone : 'blue',
        multiplier: teamObj ? teamObj.multiplier : 1,
        points: tScore
      });
    });
    
    const predictionScore = calculatePredictionPoints(player, finalMatch);
    const totalScore = parseFloat((teamsScore + predictionScore).toFixed(2));
    
    return {
      ...player,
      teamsScore: parseFloat(teamsScore.toFixed(2)),
      predictionScore,
      totalScore,
      teamBreakdown
    };
  });
  
  // Sort players by total score descending.
  // We need to implement the boundary tie-breaker:
  // "หมายเหตุ: หากคะแนนเท่ากัน ให้ปัดลงในโซนที่ ต่ำกว่า"
  // First, do a primary sort by score descending.
  processed.sort((a, b) => b.totalScore - a.totalScore);
  
  // Determine rankings
  let currentRank = 1;
  for (let i = 0; i < processed.length; i++) {
    if (i > 0 && processed[i].totalScore < processed[i - 1].totalScore) {
      currentRank = i + 1;
    }
    processed[i].rank = currentRank;
  }
  
  // Partition into zones based on ranks/scores:
  // Blue: top 20%
  // Green: next 40%
  // Red: bottom 40%
  const total = processed.length;
  const blueCount = Math.floor(total * 0.20); // 12 players
  const greenCount = Math.floor(total * 0.40); // 24 players
  
  // Rough indexes for boundaries
  const blueBoundaryIndex = blueCount - 1; // 11
  const greenBoundaryIndex = blueCount + greenCount - 1; // 35
  
  // Get boundary scores
  const blueCutoffScore = processed[blueBoundaryIndex] ? processed[blueBoundaryIndex].totalScore : 0;
  const greenCutoffScore = processed[greenBoundaryIndex] ? processed[greenBoundaryIndex].totalScore : 0;
  
  // Assign initial zones and handle demotions for ties
  processed.forEach((p, idx) => {
    let zone = 'red';
    
    if (idx < blueCount) {
      zone = 'blue';
    } else if (idx < blueCount + greenCount) {
      zone = 'green';
    } else {
      zone = 'red';
    }
    
    p.zone = zone;
  });
  
  // Apply tie-breaker: "หากคะแนนเท่ากัน ให้ปัดลงในโซนที่ ต่ำกว่า"
  // If a Blue player has the same score as the cutoff of Green, demote them to Green!
  // If a Green player has the same score as the cutoff of Red, demote them to Red!
  processed.forEach(p => {
    if (p.zone === 'blue' && p.totalScore === blueCutoffScore) {
      // Check if there is someone in the green zone with this score
      const hasGreenWithSameScore = processed.some(x => x.zone === 'green' && x.totalScore === p.totalScore);
      if (hasGreenWithSameScore || p.rank > blueCount) {
        p.zone = 'green';
      }
    }
    if (p.zone === 'green' && p.totalScore === greenCutoffScore) {
      const hasRedWithSameScore = processed.some(x => x.zone === 'red' && x.totalScore === p.totalScore);
      if (hasRedWithSameScore || p.rank > (blueCount + greenCount)) {
        p.zone = 'red';
      }
    }
  });
  
  // Assign party payouts:
  // - Last place pays 1500
  // - Second to last pays 1200
  // - Red Zone players pay 1000, except the TOP Red Zone player who is exempt.
  // - Bottom 2 Green Zone players pay extra (let's display them as paying 300 Baht or highlight them).
  
  // Find bottom and second-to-last
  const lastIndex = total - 1;
  const secondLastIndex = total - 2;
  
  // Find the top of Red Zone (first player in Red Zone)
  let topRedPlayer = null;
  for (let i = 0; i < total; i++) {
    if (processed[i].zone === 'red') {
      topRedPlayer = processed[i];
      break;
    }
  }
  
  // Find bottom 2 Green Zone players
  const greenPlayers = processed.filter(p => p.zone === 'green');
  const bottomGreen1 = greenPlayers[greenPlayers.length - 1];
  const bottomGreen2 = greenPlayers[greenPlayers.length - 2];
  
  processed.forEach((p, idx) => {
    p.payout = 0;
    p.payoutLabel = 'ไม่ต้องจ่าย';
    
    if (p.zone === 'red') {
      p.payout = 1000;
      p.payoutLabel = 'จ่าย 1,000 บาท';
      
      // Top of Red Zone exemption
      if (topRedPlayer && p.name === topRedPlayer.name) {
        p.payout = 0;
        p.payoutLabel = 'ยกเว้นไม่ต้องจ่าย (อันดับ 1 Red Zone)';
      }
      
      // Second to last
      if (idx === secondLastIndex) {
        p.payout = 1200;
        p.payoutLabel = 'รองบ๊วย จ่าย 1,200 บาท';
      }
      
      // Last place
      if (idx === lastIndex) {
        p.payout = 1500;
        p.payoutLabel = 'บ๊วย จ่าย 1,500 บาท';
      }
    } else if (p.zone === 'green') {
      if ((bottomGreen1 && p.name === bottomGreen1.name) || (bottomGreen2 && p.name === bottomGreen2.name)) {
        p.payout = 200; // Let's say they pay 200 Baht extra as punishment for being bottom green
        p.payoutLabel = 'จ่ายเพิ่มพิเศษ 200 บาท (ท้าย Green Zone)';
      }
    } else if (p.zone === 'blue') {
      p.payoutLabel = 'สิทธิ์เลือกสถานที่ (ไม่ต้องจ่าย)';
    }
  });
  
  return processed;
}

// Global calculated state
let teamPoints = {};
let processedPlayers = [];
let manualEliminatedTeams = new Set();

// Load manual eliminated teams
function loadEliminatedTeams() {
  const stored = localStorage.getItem('worldcup_eliminated_teams');
  if (stored) {
    try {
      manualEliminatedTeams = new Set(JSON.parse(stored));
    } catch(e) {
      manualEliminatedTeams = new Set();
    }
  } else {
    manualEliminatedTeams = new Set();
  }
}

// Save manual eliminated teams
function saveEliminatedTeams() {
  localStorage.setItem('worldcup_eliminated_teams', JSON.stringify(Array.from(manualEliminatedTeams)));
}

// Check if a team is eliminated (auto-calculated from knockout losses + manual overrides)
function isTeamEliminated(teamName) {
  // 1. Check manual override
  if (manualEliminatedTeams.has(teamName)) return true;

  // 2. Check auto-detect from knockout losses
  for (const match of matches) {
    if (match.status === 'finished' && match.isKnockout) {
      const h = match.homeScore;
      const a = match.awayScore;
      if (h > a && match.away === teamName) return true;
      if (h < a && match.home === teamName) return true;
      if (h === a) {
        if (match.penaltyWinner === 'home' && match.away === teamName) return true;
        if (match.penaltyWinner === 'away' && match.home === teamName) return true;
      }
    }
  }

  return false;
}

function recalculateAll() {
  teamPoints = calculateTeamPoints();
  processedPlayers = processPlayers(teamPoints);
}

// NAVIGATION
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      const tab = item.getAttribute('data-tab');
      document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
      });
      document.getElementById(tab).classList.add('active');
      
      // Close mobile sidebar if active
      document.getElementById('sidebar').classList.remove('active');
      const backdrop = document.getElementById('sidebar-backdrop');
      if (backdrop) backdrop.classList.remove('active');
      document.body.style.overflow = '';
      
      // Specific page triggers
      if (tab === 'dashboard') renderDashboard();
      if (tab === 'leaderboard') renderLeaderboard();
      if (tab === 'matches') renderMatches();
      if (tab === 'players') renderPlayers();
      if (tab === 'teams') renderTeamsMatrix();
    });
  });
  
  // Mobile Hamburger menu
  const menuBtn = document.getElementById('menu-toggle-btn');
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  
  function closeMobileSidebar() {
    sidebar.classList.remove('active');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
    document.body.style.overflow = '';
  }
  
  function openMobileSidebar() {
    sidebar.classList.add('active');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  
  if (menuBtn) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sidebar.classList.contains('active')) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
    });
  }
  
  // Close sidebar when clicking backdrop
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', () => {
      closeMobileSidebar();
    });
  }
  
  // Close sidebar clicking outside on mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 992 && sidebar.classList.contains('active') && !sidebar.contains(e.target)) {
      closeMobileSidebar();
    }
  });
}

// RENDERING - DASHBOARD
function renderDashboard() {
  recalculateAll();
  
  document.getElementById('stat-total-players').textContent = processedPlayers.length;
  
  const leader = processedPlayers[0];
  document.getElementById('stat-leader-score').textContent = leader ? leader.totalScore.toFixed(1) : '0.0';
  
  const playedCount = matches.filter(m => m.status === 'finished').length;
  document.getElementById('stat-played-matches').textContent = `${playedCount} / ${matches.length}`;

  // ── Score Distribution Line Chart ──────────────────────────
  renderScoreChart();

  // ── Top 5 Leaders table ────────────────────────────────────
  // Show/hide admin column header
  const top5AdminCol = document.getElementById('top5-admin-col');
  if (top5AdminCol) top5AdminCol.style.display = isAdmin ? 'table-cell' : 'none';

  const top5 = processedPlayers.slice(0, 5);
  const tbody = document.getElementById('top-leaders-tbody');
  tbody.innerHTML = '';
  
  top5.forEach(p => {
    const tr = document.createElement('tr');
    tr.classList.add('hoverable');
    tr.addEventListener('click', () => openPlayerDetails(p.name));
    
    let zoneBadge = '';
    if (p.zone === 'blue') zoneBadge = '<span class="badge badge-blue">Blue Zone</span>';
    else if (p.zone === 'green') zoneBadge = '<span class="badge badge-green">Green Zone</span>';
    else zoneBadge = '<span class="badge badge-red">Red Zone</span>';
    
    const editCell = isAdmin
      ? `<td style="text-align:center;" onclick="event.stopPropagation()">
           <button class="btn btn-secondary" style="padding:4px 12px; font-size:12px;" onclick="openPlayerForm(players.find(pl=>pl.name==='${p.name.replace(/'/g, "\\'")}'))">✏️ แก้ไข</button>
         </td>`
      : '<td style="display:none"></td>';

    tr.innerHTML = `
      <td><strong>${p.rank}</strong></td>
      <td>${p.name}</td>
      <td style="text-align: center;">${p.guess} ประตู</td>
      <td style="text-align: right; color:var(--primary); font-weight:700;">${p.totalScore.toFixed(1)}</td>
      <td>${zoneBadge}</td>
      ${editCell}
    `;
    tbody.appendChild(tr);
  });
}

// ── Render SVG Line Chart (X = Days, Y = Scores) ──────────────
let lastHighlightPlayer = ""; // global variable to track selected player in chart

function renderScoreChart() {
  const svgEl = document.getElementById('score-chart-svg');
  if (!svgEl || !processedPlayers.length) return;

  // 1. Get finished matches sorted chronologically
  const finishedMatches = matches
    .filter(m => m.status === 'finished')
    .sort((a, b) => a.id - b.id);
  const stepsCount = finishedMatches.length;

  // 2. Cache historical scores for all players
  const playerScoresHistory = players.map(p => {
    const curr = processedPlayers.find(pl => pl.name === p.name) || { zone: 'red', rank: 99 };
    return {
      name: p.name,
      zone: curr.zone,
      rank: curr.rank,
      scores: [0] // step 0 (start) = 0 points
    };
  });

  // Calculate scores step-by-step
  const teamScores = {};
  TEAMS.forEach(team => {
    teamScores[team.name] = 0;
  });

  for (let step = 1; step <= stepsCount; step++) {
    const match = finishedMatches[step - 1];
    const h = match.homeScore;
    const a = match.awayScore;

    let homeResPoints = 0;
    let awayResPoints = 0;

    if (h > a) {
      homeResPoints = 3;
      awayResPoints = 1;
    } else if (h < a) {
      homeResPoints = 1;
      awayResPoints = 3;
    } else {
      if (match.isKnockout && match.penaltyWinner) {
        if (match.penaltyWinner === 'home') {
          homeResPoints = 3;
          awayResPoints = 1;
        } else {
          homeResPoints = 1;
          awayResPoints = 3;
        }
      } else {
        homeResPoints = 2;
        awayResPoints = 2;
      }
    }

    const hTeam = TEAMS.find(t => t.name === match.home);
    const aTeam = TEAMS.find(t => t.name === match.away);

    if (hTeam) teamScores[match.home] += (homeResPoints + h) * hTeam.multiplier;
    if (aTeam) teamScores[match.away] += (awayResPoints + a) * aTeam.multiplier;

    playerScoresHistory.forEach(ph => {
      const playerObj = players.find(p => p.name === ph.name);
      let teamsScore = 0;
      playerObj.teams.forEach(teamName => {
        teamsScore += teamScores[teamName] || 0;
      });

      const finalMatch = finishedMatches.slice(0, step).find(m => m.isFinal);
      const predictionScore = calculatePredictionPoints(playerObj, finalMatch);
      const totalScore = parseFloat((teamsScore + predictionScore).toFixed(2));
      ph.scores.push(totalScore);
    });
  }

  // 3. Setup Layout Dimensions
  // Dynamic width based on the number of steps (days) to prevent overlap on mobile
  const W = Math.max(800, 150 + (stepsCount + 1) * 110);
  const H = 380;
  const padL = 60, padR = 140, padT = 40, padB = 60;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // Get max score to set Y-axis scale
  let maxScore = 0;
  playerScoresHistory.forEach(ph => {
    const m = Math.max(...ph.scores);
    if (m > maxScore) maxScore = m;
  });
  maxScore = Math.ceil(maxScore * 1.05) || 10;

  // Scale functions
  const xOf = i => stepsCount > 0 ? padL + (i / stepsCount) * chartW : padL + chartW / 2;
  const yOf = s => padT + (1 - s / maxScore) * chartH;

  // Colors
  const getPlayerColor = zone => {
    if (zone === 'blue') return '#60a5fa';
    if (zone === 'green') return '#34d399';
    return '#f43f5e';
  };

  // 4. Render Y-axis grid lines and values
  const yTicks = 6;
  let yGridLines = '';
  for (let i = 0; i <= yTicks; i++) {
    const val = (i / yTicks) * maxScore;
    const y = yOf(val);
    yGridLines += `<line x1="${padL - 4}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>`;
    yGridLines += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.4)" font-family="Inter,Sarabun,sans-serif">${val.toFixed(1)}</text>`;
  }

  // 5. Render X-axis labels (days and match descriptions)
  let xLabels = '';
  for (let i = 0; i <= stepsCount; i++) {
    const x = xOf(i);
    let label = i === 0 ? 'เริ่มต้น' : `วันที่ ${i}`;
    let matchDetail = '';
    if (i > 0) {
      const match = finishedMatches[i - 1];
      matchDetail = `<text x="${x}" y="${padT + chartH + 32}" text-anchor="middle" font-size="8.5" fill="rgba(255,255,255,0.3)" font-family="Inter,Sarabun,sans-serif">${match.home}-${match.away}</text>`;
    }
    xLabels += `
      <line x1="${x}" x2="${x}" y1="${padT}" y2="${padT + chartH + 4}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
      <text x="${x}" y="${padT + chartH + 18}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.5)" font-family="Inter,Sarabun,sans-serif" font-weight="600">${label}</text>
      ${matchDetail}
    `;
  }

  // 6. Draw lines, dots, and labels
  let linesGroup = '';
  let dotsGroup = '';
  let labelsGroup = '';
  let hoverHelpers = '';

  playerScoresHistory.forEach(ph => {
    let pathPoints = [];
    for (let i = 0; i <= stepsCount; i++) {
      const x = xOf(i);
      const y = yOf(ph.scores[i]);
      pathPoints.push(`${x},${y}`);
    }
    const pathD = `M ${pathPoints.join(' L ')}`;
    const color = getPlayerColor(ph.zone);

    // Score line path
    linesGroup += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="1.5" stroke-opacity="0.22" class="trend-line" data-player="${ph.name}" style="cursor:pointer; transition: stroke-width 0.2s, stroke-opacity 0.2s;"/>`;
    
    // Invisible thick path to make hover easier
    hoverHelpers += `<path d="${pathD}" fill="none" stroke="transparent" stroke-width="8" class="trend-line-hover-helper" data-player="${ph.name}" style="cursor:pointer;"/>`;

    // Trend dots
    for (let i = 0; i <= stepsCount; i++) {
      const x = xOf(i);
      const y = yOf(ph.scores[i]);
      dotsGroup += `<circle cx="${x}" cy="${y}" r="3.2" fill="${color}" fill-opacity="0.6" class="trend-dot" data-player="${ph.name}" data-step="${i}" data-score="${ph.scores[i]}" style="cursor:pointer; transition: r 0.2s, fill-opacity 0.2s;"/>`;
    }

    // Label at the end of the line
    const lastX = xOf(stepsCount);
    const lastY = yOf(ph.scores[stepsCount]);
    const isTop5 = ph.rank <= 5;
    const labelDisplay = isTop5 ? 'block' : 'none';
    labelsGroup += `<text x="${lastX + 8}" y="${lastY + 3}" font-size="9" fill="${color}" fill-opacity="0.85" class="trend-end-label" data-player="${ph.name}" style="display: ${labelDisplay}; font-family: Inter,Sarabun,sans-serif; pointer-events: none; transition: fill-opacity 0.2s;">${ph.name} (${ph.scores[stepsCount].toFixed(1)})</text>`;
  });

  // Setup SVG dimensions and viewBox
  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.setAttribute('width', W);
  svgEl.setAttribute('height', H);
  svgEl.style.minWidth = W + 'px';

  svgEl.innerHTML = `
    <rect x="0" y="0" width="${W}" height="${H}" rx="8" fill="transparent"/>
    ${yGridLines}
    <line x1="${padL - 4}" x2="${padL - 4}" y1="${padT}" y2="${padT + chartH}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
    <line x1="${padL - 4}" x2="${W - padR}" y1="${padT + chartH}" y2="${padT + chartH}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
    ${xLabels}
    
    <g class="lines-container">${linesGroup}</g>
    <g class="helpers-container">${hoverHelpers}</g>
    <g class="dots-container">${dotsGroup}</g>
    <g class="labels-container">${labelsGroup}</g>

    <!-- Legends -->
    <rect x="${padL}" y="${padT - 26}" width="10" height="10" rx="2" fill="#60a5fa"/>
    <text x="${padL + 14}" y="${padT - 17}" font-size="10" fill="rgba(255,255,255,0.5)" font-family="Inter,Sarabun,sans-serif">Blue Zone</text>
    <rect x="${padL + 90}" y="${padT - 26}" width="10" height="10" rx="2" fill="#34d399"/>
    <text x="${padL + 104}" y="${padT - 17}" font-size="10" fill="rgba(255,255,255,0.5)" font-family="Inter,Sarabun,sans-serif">Green Zone</text>
    <rect x="${padL + 190}" y="${padT - 26}" width="10" height="10" rx="2" fill="#f43f5e"/>
    <text x="${padL + 204}" y="${padT - 17}" font-size="10" fill="rgba(255,255,255,0.5)" font-family="Inter,Sarabun,sans-serif">Red Zone</text>
  `;

  // Make container scrollable
  svgEl.parentElement.style.overflowX = 'auto';
  svgEl.parentElement.style.overflowY = 'visible';

  // 7. Populate Highlight Dropdown
  const highlightSelect = document.getElementById('chart-highlight-select');
  if (highlightSelect) {
    const currentVal = highlightSelect.value || lastHighlightPlayer;
    highlightSelect.innerHTML = '<option value="">-- แสดงทั้งหมด --</option>';
    
    const sortedForSelect = [...processedPlayers].sort((a, b) => a.name.localeCompare(b.name, 'th'));
    sortedForSelect.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = `${p.name} (อันดับ ${p.rank})`;
      if (p.name === currentVal) opt.selected = true;
      highlightSelect.appendChild(opt);
    });
  }

  // 8. Tooltip logic
  const tooltip = document.getElementById('chart-tooltip');
  const ttRank  = document.getElementById('tt-rank');
  const ttName  = document.getElementById('tt-name');
  const ttScore = document.getElementById('tt-score');
  const ttZone  = document.getElementById('tt-zone');

  svgEl.querySelectorAll('.trend-dot').forEach(dot => {
    dot.addEventListener('mouseenter', () => {
      const pName = dot.getAttribute('data-player');
      const step = parseInt(dot.getAttribute('data-step'));
      const score = parseFloat(dot.getAttribute('data-score'));
      
      const p = processedPlayers.find(x => x.name === pName) || {};
      let zoneLabel = '';
      if (p.zone === 'blue')       zoneLabel = '<span style="color:#60a5fa">● Blue Zone</span>';
      else if (p.zone === 'green') zoneLabel = '<span style="color:#34d399">● Green Zone</span>';
      else                         zoneLabel = '<span style="color:#f43f5e">● Red Zone</span>';
      
      const dayLabel = step === 0 ? 'จุดเริ่มต้น' : `ผลการแข่งหลังจบวันที่ ${step}`;
      let matchLabel = '';
      if (step > 0) {
        const match = finishedMatches[step - 1];
        matchLabel = `<div style="font-size:11px; color:rgba(255,255,255,0.45); margin-top:2px;">แมตช์ที่ ${match.id}: ${match.home} vs ${match.away} (${match.homeScore}-${match.awayScore})</div>`;
      }
      
      ttRank.innerHTML    = `อันดับปัจจุบัน: ${p.rank || '-'} <span style="margin-left:8px; color:rgba(255,255,255,0.45); font-size:10px;">(${dayLabel})</span>`;
      ttName.textContent  = pName;
      ttScore.innerHTML   = `${score.toFixed(1)} <span style="font-size:12px; font-weight:normal; color:var(--text-secondary);">คะแนนสะสม</span>`;
      ttZone.innerHTML    = zoneLabel + matchLabel;
      tooltip.style.display = 'block';
    });

    dot.addEventListener('mousemove', e => {
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top  = (e.clientY - 10) + 'px';
    });

    dot.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  });

  // 9. Attach mouseenter listeners to highlight
  svgEl.querySelectorAll('.trend-line, .trend-line-hover-helper, .trend-dot').forEach(el => {
    el.addEventListener('mouseenter', () => {
      const playerName = el.getAttribute('data-player');
      highlightPlayerInChart(playerName);
    });
  });

  // Reset highlight on mouseleave unless selected from select dropdown
  svgEl.addEventListener('mouseleave', () => {
    const hlSelect = document.getElementById('chart-highlight-select');
    const selectedPlayer = hlSelect ? hlSelect.value : lastHighlightPlayer;
    highlightPlayerInChart(selectedPlayer);
  });

  // Trigger initial highlight if there was a selected player
  const initialHl = highlightSelect ? highlightSelect.value : lastHighlightPlayer;
  if (initialHl) {
    highlightPlayerInChart(initialHl);
  }
}

// Global highlight controller
function highlightPlayerInChart(playerName) {
  const svgEl = document.getElementById('score-chart-svg');
  if (!svgEl) return;

  const highlightSelect = document.getElementById('chart-highlight-select');
  if (highlightSelect && highlightSelect.value !== playerName && playerName !== undefined) {
    highlightSelect.value = playerName;
  }
  
  lastHighlightPlayer = playerName || "";

  if (!playerName) {
    // Revert to default
    svgEl.querySelectorAll('.trend-line').forEach(line => {
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-opacity', '0.22');
    });
    svgEl.querySelectorAll('.trend-dot').forEach(dot => {
      dot.setAttribute('r', '3.2');
      dot.setAttribute('fill-opacity', '0.6');
    });
    svgEl.querySelectorAll('.trend-end-label').forEach(label => {
      const pName = label.getAttribute('data-player');
      const pObj = processedPlayers.find(p => p.name === pName);
      if (pObj && pObj.rank <= 5) {
        label.style.display = 'block';
        label.setAttribute('fill-opacity', '0.85');
        label.removeAttribute('font-weight');
        label.setAttribute('font-size', '9');
      } else {
        label.style.display = 'none';
      }
    });
    // Remove dot value labels
    svgEl.querySelectorAll('.temp-dot-label').forEach(el => el.remove());
    return;
  }

  // Dim and highlight
  svgEl.querySelectorAll('.trend-line').forEach(line => {
    const pName = line.getAttribute('data-player');
    if (pName === playerName) {
      line.setAttribute('stroke-width', '4.5');
      line.setAttribute('stroke-opacity', '1');
      line.parentElement.appendChild(line); // bring to front
    } else {
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-opacity', '0.04');
    }
  });

  // Keep hover helpers functional and bring current to front
  svgEl.querySelectorAll('.trend-line-hover-helper').forEach(helper => {
    const pName = helper.getAttribute('data-player');
    if (pName === playerName) {
      helper.parentElement.appendChild(helper);
    }
  });

  // Update dots
  svgEl.querySelectorAll('.trend-dot').forEach(dot => {
    const pName = dot.getAttribute('data-player');
    if (pName === playerName) {
      dot.setAttribute('r', '5.5');
      dot.setAttribute('fill-opacity', '1');
      dot.parentElement.appendChild(dot); // bring to front
    } else {
      dot.setAttribute('r', '2');
      dot.setAttribute('fill-opacity', '0.05');
    }
  });

  // Update end labels
  svgEl.querySelectorAll('.trend-end-label').forEach(label => {
    const pName = label.getAttribute('data-player');
    if (pName === playerName) {
      label.style.display = 'block';
      label.setAttribute('fill-opacity', '1');
      label.setAttribute('font-weight', '700');
      label.setAttribute('font-size', '11');
      label.parentElement.appendChild(label); // bring to front
    } else {
      label.style.display = 'none';
    }
  });

  // Clean old dot value labels
  svgEl.querySelectorAll('.temp-dot-label').forEach(el => el.remove());

  // Add temp dot labels for the highlighted player
  const dotsOfPlayer = svgEl.querySelectorAll(`.trend-dot[data-player="${playerName}"]`);
  dotsOfPlayer.forEach(dot => {
    const cx = parseFloat(dot.getAttribute('cx'));
    const cy = parseFloat(dot.getAttribute('cy'));
    const score = parseFloat(dot.getAttribute('data-score'));

    const textLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textLabel.setAttribute('x', cx);
    textLabel.setAttribute('y', cy - 10);
    textLabel.setAttribute('text-anchor', 'middle');
    textLabel.setAttribute('font-size', '9.5');
    textLabel.setAttribute('font-weight', '600');
    textLabel.setAttribute('fill', '#fff');
    textLabel.setAttribute('class', 'temp-dot-label');
    textLabel.setAttribute('style', 'pointer-events: none; filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.85)); font-family: Inter,sans-serif;');
    textLabel.textContent = score.toFixed(1);
    
    dot.parentElement.appendChild(textLabel);
  });
}


// RENDERING - LEADERBOARD
function renderLeaderboard() {
  recalculateAll();
  const searchInput = document.getElementById('leaderboard-search').value.toLowerCase();
  
  // Get checked team names
  const checkedBoxes = document.querySelectorAll('.team-filter-checkbox:checked');
  const selectedTeams = Array.from(checkedBoxes).map(cb => cb.value);
  
  // Update button text
  const btnText = document.getElementById('team-filter-btn-text');
  if (btnText) {
    if (selectedTeams.length === 0) {
      btnText.textContent = '🔍 กรองตามทีมที่เลือก (ทั้งหมด)';
    } else {
      btnText.textContent = `🔍 กรองตามทีมที่เลือก (${selectedTeams.length} ทีม)`;
    }
  }
  
  const tbody = document.getElementById('leaderboard-tbody');
  tbody.innerHTML = '';
  
  const filtered = processedPlayers.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchInput);
    const matchesTeam = selectedTeams.length === 0 || selectedTeams.every(team => p.teams.includes(team));
    return matchesSearch && matchesTeam;
  });
  
  // Show/hide admin column header in leaderboard
  const lbAdminCol = document.getElementById('lb-admin-col');
  if (lbAdminCol) lbAdminCol.style.display = isAdmin ? 'table-cell' : 'none';

  filtered.forEach(p => {
    const tr = document.createElement('tr');
    tr.classList.add('hoverable');
    
    // Assign zone rows
    if (p.zone === 'blue') tr.classList.add('zone-blue-row');
    else if (p.zone === 'green') tr.classList.add('zone-green-row');
    else if (p.zone === 'red') tr.classList.add('zone-red-row');
    
    tr.addEventListener('click', () => openPlayerDetails(p.name));
    
    let zoneBadge = '';
    if (p.zone === 'blue') zoneBadge = '<span class="badge badge-blue">Blue Zone</span>';
    else if (p.zone === 'green') zoneBadge = '<span class="badge badge-green">Green Zone</span>';
    else zoneBadge = '<span class="badge badge-red">Red Zone</span>';

    const editCell = isAdmin
      ? `<td style="text-align:center;" onclick="event.stopPropagation()">
           <button class="btn btn-secondary" style="padding:4px 12px; font-size:12px; white-space:nowrap;" onclick="openPlayerForm(players.find(pl=>pl.name==='${p.name.replace(/'/g, "\\'")}'))">✏️ แก้ไข</button>
         </td>`
      : '<td style="display:none"></td>';
    
    tr.innerHTML = `
      <td><strong>${p.rank}</strong></td>
      <td>${p.name}</td>
      <td style="text-align: center;">${p.guess} ประตู</td>
      <td style="text-align: right; color:var(--primary); font-weight:700;">${p.totalScore.toFixed(1)}</td>
      <td>${zoneBadge}</td>
      <td style="color: ${p.payout > 0 ? 'var(--zone-red-orange)' : 'var(--text-secondary)'}; font-weight: ${p.payout > 0 ? '600' : '500'};">${p.payoutLabel}</td>
      ${editCell}
    `;
    tbody.appendChild(tr);
  });
}

// Format date to Thai display
function formatThaiDate(dateStr) {
  if (!dateStr) return 'ไม่ระบุวัน';
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  return `วัน${days[d.getDay()]}ที่ ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// Delete a match (admin only)
function deleteMatch(matchId) {
  if (!confirm('คุณต้องการลบคู่แข่งขันนี้ใช่หรือไม่?')) return;
  matches = matches.filter(m => m.id !== matchId);
  localStorage.setItem('worldcup_matches', JSON.stringify(matches));
  recalculateAll();
  renderMatches();
  renderDashboard();
}

// RENDERING - MATCHES
function renderMatches() {
  const grid = document.getElementById('matches-grid');
  grid.innerHTML = '';
  
  // Sort matches by date then by id
  const sortedMatches = [...matches].sort((a, b) => {
    const dateA = a.date || '9999-12-31';
    const dateB = b.date || '9999-12-31';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return a.id - b.id;
  });
  
  // Group by date
  const dateGroups = new Map();
  sortedMatches.forEach(m => {
    const key = m.date || 'no-date';
    if (!dateGroups.has(key)) dateGroups.set(key, []);
    dateGroups.get(key).push(m);
  });
  
  // Render each date group
  dateGroups.forEach((groupMatches, dateKey) => {
    // Date section header
    const dateHeader = document.createElement('div');
    dateHeader.className = 'matches-date-header';
    const dateLabel = dateKey !== 'no-date' ? formatThaiDate(dateKey) : 'ไม่ระบุวัน';
    const finishedInGroup = groupMatches.filter(m => m.status === 'finished').length;
    dateHeader.innerHTML = `
      <div class="date-divider">
        <span class="date-label">📅 ${dateLabel}</span>
        <span class="date-count">${groupMatches.length} คู่ · เล่นแล้ว ${finishedInGroup}</span>
      </div>
    `;
    grid.appendChild(dateHeader);

    groupMatches.forEach(match => {
    const card = document.createElement('div');
    card.classList.add('match-card');
    
    const hTeamObj = TEAMS.find(t => t.name === match.home);
    const aTeamObj = TEAMS.find(t => t.name === match.away);
    const hZone = hTeamObj ? hTeamObj.zone : 'blue';
    const aZone = aTeamObj ? aTeamObj.zone : 'blue';
    
    const homeScoreVal = match.homeScore !== null ? match.homeScore : '';
    const awayScoreVal = match.awayScore !== null ? match.awayScore : '';
    
    let matchMeta = match.isKnockout ? 'รอบน็อคเอาท์ ( Knockout )' : 'รอบแบ่งกลุ่ม';
    if (match.isFinal) matchMeta = '🏆 นัดชิงชนะเลิศ ( Final )';
    
    // Knockout options (Penalty shootout)
    let knockoutExtraUI = '';
    if (match.isKnockout) {
      const showPenalty = (match.homeScore !== null && match.awayScore !== null && match.homeScore === match.awayScore);
      knockoutExtraUI = `
        <div class="penalty-ui" style="display: ${showPenalty ? 'flex' : 'none'}; flex-direction: column; gap: 8px; margin-top: 10px; width: 100%; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
          <label style="font-size: 11px; color: var(--text-secondary);">ผู้ชนะการยิงจุดโทษ ( Penalty Winner ):</label>
          <select class="penalty-select" data-match-id="${match.id}" ${isAdmin ? '' : 'disabled'} style="width:100%; padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.1); background-color:var(--bg-primary); color:#fff; font-family:inherit; font-size:12px;">
            <option value="">-- เลือกผู้ชนะจุดโทษ --</option>
            <option value="home" ${match.penaltyWinner === 'home' ? 'selected' : ''}>${match.home}</option>
            <option value="away" ${match.penaltyWinner === 'away' ? 'selected' : ''}>${match.away}</option>
          </select>
        </div>
      `;
    }
    
    card.innerHTML = `
      <div class="match-header">
        <span>แมตช์ที่ ${match.id}</span>
        <span>${matchMeta}</span>
      </div>
      
      <div class="match-body">
        <div class="match-team">
          <span class="team-badge team-${hZone}">${match.home} (${hTeamObj ? hTeamObj.multiplier : 1})</span>
        </div>
        
        <div class="match-score-inputs">
          <input type="number" class="score-input home-score-input" data-match-id="${match.id}" value="${homeScoreVal}" min="0" ${isAdmin ? '' : 'disabled'}>
          <span class="match-vs">VS</span>
          <input type="number" class="score-input away-score-input" data-match-id="${match.id}" value="${awayScoreVal}" min="0" ${isAdmin ? '' : 'disabled'}>
        </div>
        
        <div class="match-team">
          <span class="team-badge team-${aZone}">${match.away} (${aTeamObj ? aTeamObj.multiplier : 1})</span>
        </div>
      </div>
      
      ${knockoutExtraUI}
      
      <div class="match-footer" style="margin-top: 8px;">
        <span class="badge ${match.status === 'finished' ? 'badge-green' : 'badge-red'}">${match.status === 'finished' ? 'แข่งเสร็จสิ้น' : 'รอการแข่งขัน'}</span>
        <div style="display:${isAdmin ? 'flex' : 'none'}; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-secondary save-match-btn" data-match-id="${match.id}" style="padding: 6px 12px; font-size:12px;">บันทึกผล</button>
          <button class="btn btn-secondary clear-match-btn" data-match-id="${match.id}" style="padding: 6px 12px; font-size:12px; background-color: rgba(244,63,94,0.05); color: var(--accent); border-color: rgba(244,63,94,0.1)">ล้างผล</button>
          <button class="btn btn-secondary delete-match-btn" data-match-id="${match.id}" style="padding: 6px 12px; font-size:12px; background-color: rgba(244,63,94,0.12); color: var(--accent); border-color: rgba(244,63,94,0.2)">🗑️ ลบคู่</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
    });
  });
  
  // Setup match event listeners
  document.querySelectorAll('.score-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const matchId = parseInt(e.target.getAttribute('data-match-id'));
      const match = matches.find(m => m.id === matchId);
      if (match && match.isKnockout) {
        const card = e.target.closest('.match-card');
        const homeInput = card.querySelector('.home-score-input');
        const awayInput = card.querySelector('.away-score-input');
        const penaltyUi = card.querySelector('.penalty-ui');
        
        const hVal = parseInt(homeInput.value);
        const aVal = parseInt(awayInput.value);
        
        if (!isNaN(hVal) && !isNaN(aVal) && hVal === aVal) {
          penaltyUi.style.display = 'flex';
        } else {
          penaltyUi.style.display = 'none';
        }
      }
    });
  });
  
  document.querySelectorAll('.save-match-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const matchId = parseInt(btn.getAttribute('data-match-id'));
      const card = btn.closest('.match-card');
      const hVal = card.querySelector('.home-score-input').value;
      const aVal = card.querySelector('.away-score-input').value;
      
      if (hVal === '' || aVal === '') {
        alert('กรุณากรอกคะแนนผลการแข่งขันทั้งสองฝั่ง!');
        return;
      }
      
      const homeScore = parseInt(hVal);
      const awayScore = parseInt(aVal);
      
      const match = matches.find(m => m.id === matchId);
      if (match) {
        match.homeScore = homeScore;
        match.awayScore = awayScore;
        match.status = 'finished';
        
        if (match.isKnockout) {
          if (homeScore === awayScore) {
            const penSelect = card.querySelector('.penalty-select');
            if (penSelect.value === '') {
              alert('นัดเสมอรอบ Knockout ต้องเลือกผู้ชนะจุดโทษ!');
              return;
            }
            match.penaltyWinner = penSelect.value;
          } else {
            match.penaltyWinner = null;
          }
        }
        
        localStorage.setItem('worldcup_matches', JSON.stringify(matches));
        alert('บันทึกสกอร์การแข่งขันเรียบร้อย!');
        renderMatches();
      }
    });
  });
  
  document.querySelectorAll('.clear-match-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const matchId = parseInt(btn.getAttribute('data-match-id'));
      const match = matches.find(m => m.id === matchId);
      if (match) {
        match.homeScore = null;
        match.awayScore = null;
        match.status = 'pending';
        match.penaltyWinner = null;
        
        localStorage.setItem('worldcup_matches', JSON.stringify(matches));
        alert('ล้างข้อมูลสกอร์เรียบร้อย!');
        renderMatches();
      }
    });
  });
  
  // Delete match button (admin)
  document.querySelectorAll('.delete-match-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const matchId = parseInt(btn.getAttribute('data-match-id'));
      deleteMatch(matchId);
    });
  });
}

// RENDERING - PLAYERS
function renderPlayers() {
  recalculateAll();
  const searchInput = document.getElementById('players-search').value.toLowerCase();
  
  const tbody = document.getElementById('players-tbody');
  tbody.innerHTML = '';
  
  const filtered = processedPlayers.filter(p => p.name.toLowerCase().includes(searchInput));
  
  filtered.forEach(p => {
    const tr = document.createElement('tr');
    tr.classList.add('hoverable');
    
    // Build list of team badges
    const teamBadges = p.teamBreakdown.map(tb => {
      return `<span class="team-badge team-${tb.zone}" style="padding: 2px 6px; font-size: 11px; margin-right: 4px; margin-bottom: 4px;">${tb.name} (${tb.points.toFixed(1)})</span>`;
    }).join(' ');
    
    tr.addEventListener('click', () => openPlayerDetails(p.name));
    
    tr.innerHTML = `
      <td><strong>${p.name}</strong></td>
      <td style="max-width: 400px; overflow-wrap: break-word; line-height: 2;">${teamBadges}</td>
      <td style="text-align: right; color:var(--primary); font-weight:700;">${p.totalScore.toFixed(1)}</td>
      <td>
        <button class="btn btn-secondary" style="padding: 6px 12px; font-size:12px;">รายละเอียด</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// RENDERING - TEAMS MATRIX
function renderTeamsMatrix() {
  const container = document.getElementById('teams-matrix-container');
  container.innerHTML = '';
  
  const zones = [
    { key: 'blue', name: 'Blue Zone (ตัวคูณ 1.0 - 1.3)', class: 'team-blue' },
    { key: 'green', name: 'Green Zone (ตัวคูณ 1.4 - 1.7)', class: 'team-green' },
    { key: 'yellow', name: 'Yellow Zone (ตัวคูณ 1.8 - 2.1)', class: 'team-yellow' },
    { key: 'light-orange', name: 'Light Orange Zone (ตัวคูณ 2.2 - 2.6)', class: 'team-light-orange' },
    { key: 'red-orange', name: 'Red-Orange Zone (ตัวคูณ 2.7 - 3.0)', class: 'team-red-orange' }
  ];
  
  const teamScores = calculateTeamPoints();
  
  zones.forEach(zone => {
    const card = document.createElement('div');
    card.classList.add('card');
    
    const zoneTeams = TEAMS.filter(t => t.zone === zone.key);
    
    let matrixHTML = `<div class="card-title"><span class="team-badge ${zone.class}">${zone.name}</span></div>`;
    matrixHTML += `<div class="teams-matrix">`;
    
    zoneTeams.forEach(t => {
      const stats = teamScores[t.name] || { points: 0, played: 0 };
      matrixHTML += `
        <div class="team-card-small" style="background-color:rgba(15, 23, 42, 0.3); border:1px solid rgba(255,255,255,0.03); border-left:3px solid var(--zone-${zone.key})">
          <div>
            <strong>${t.name}</strong>
            <div style="font-size:10px; color:var(--text-secondary);">ตัวคูณ: ${t.multiplier}</div>
          </div>
          <div style="text-align:right;">
            <strong style="color:var(--primary);">${stats.points.toFixed(1)}</strong>
            <div style="font-size:9px; color:var(--text-muted);">${stats.played} นัด</div>
          </div>
        </div>
      `;
    });
    
    matrixHTML += `</div>`;
    card.innerHTML = matrixHTML;
    container.appendChild(card);
  });
}

// PLAYER DETAILS MODAL
function openPlayerDetails(name) {
  try {
    recalculateAll();
    const player = processedPlayers.find(p => p.name === name);
    if (!player) return;
  
  document.getElementById('detail-player-name').textContent = player.name;
  document.getElementById('detail-teams-score').textContent = player.teamsScore.toFixed(2);
  document.getElementById('detail-prediction-score').textContent = `${player.predictionScore.toFixed(2)}`;
  document.getElementById('detail-prediction-guess').textContent = player.guess;
  document.getElementById('detail-total-score').textContent = player.totalScore.toFixed(2);
  
  // ── Team Stats Summary ────────────────────────────
  const statsContainer = document.getElementById('detail-team-stats-container');
  if (statsContainer) {
    let statsHTML = `
      <button class="team-stats-toggle" id="toggle-team-stats-btn">
        📊 ดูสถิติทีมที่เลือกย้อนหลัง (Team Stats Summary)
        <span style="margin-left:auto; font-size:16px; transition:transform 0.2s;" id="toggle-stats-arrow">▼</span>
      </button>
      <div id="team-stats-table-wrapper" style="display:none; margin-top:12px; overflow-x:auto; border:1px solid rgba(255,255,255,0.05); border-radius:12px; background-color:rgba(15,23,42,0.3);">
        <table class="team-stats-summary">
          <thead>
            <tr>
              <th style="text-align:left;">ทีม</th>
              <th>โซน</th>
              <th>เล่น</th>
              <th>ชนะ</th>
              <th>เสมอ</th>
              <th>แพ้</th>
              <th>ประตู</th>
              <th>แต้มสะสม</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    let totalPts = 0, totalPlayed = 0, totalW = 0, totalD = 0, totalL = 0, totalGF = 0;
    player.teamBreakdown.forEach(tb => {
      const teamMatches = matches.filter(m => m.status === 'finished' && (m.home === tb.name || m.away === tb.name));
      let wins = 0, draws = 0, losses = 0, goalsFor = 0;
      
      teamMatches.forEach(m => {
        if (m.home === tb.name) {
          goalsFor += m.homeScore;
          if (m.homeScore > m.awayScore) wins++;
          else if (m.homeScore < m.awayScore) losses++;
          else {
            if (m.isKnockout && m.penaltyWinner) {
              if (m.penaltyWinner === 'home') wins++; else losses++;
            } else draws++;
          }
        } else {
          goalsFor += m.awayScore;
          if (m.awayScore > m.homeScore) wins++;
          else if (m.awayScore < m.homeScore) losses++;
          else {
            if (m.isKnockout && m.penaltyWinner) {
              if (m.penaltyWinner === 'away') wins++; else losses++;
            } else draws++;
          }
        }
      });
      
      totalPts += tb.points; totalPlayed += teamMatches.length;
      totalW += wins; totalD += draws; totalL += losses; totalGF += goalsFor;
      
      const eliminated = isTeamEliminated(tb.name);
      const statusBadge = eliminated 
        ? '<span style="color:#f43f5e; font-weight:600; font-size:11px;">ตกรอบ</span>'
        : '<span style="color:#34d399; font-weight:600; font-size:11px;">ยังอยู่</span>';
      
      statsHTML += `
        <tr style="border-left: 3px solid var(--zone-${tb.zone});">
          <td>${tb.name}</td>
          <td><span class="team-badge team-${tb.zone}" style="padding:2px 6px; font-size:9px;">${tb.zone.toUpperCase()}</span></td>
          <td>${teamMatches.length}</td>
          <td style="color:#34d399;">${wins}</td>
          <td style="color:var(--zone-yellow);">${draws}</td>
          <td style="color:#f43f5e;">${losses}</td>
          <td>${goalsFor}</td>
          <td style="font-weight:700; color:var(--primary);">${tb.points.toFixed(1)}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    });
    
    statsHTML += `
          </tbody>
          <tfoot>
            <tr style="background-color:rgba(255,255,255,0.03); font-weight:700;">
              <td>รวมทั้งหมด</td>
              <td></td>
              <td>${totalPlayed}</td>
              <td style="color:#34d399;">${totalW}</td>
              <td style="color:var(--zone-yellow);">${totalD}</td>
              <td style="color:#f43f5e;">${totalL}</td>
              <td>${totalGF}</td>
              <td style="color:var(--primary);">${totalPts.toFixed(1)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
    
    statsContainer.innerHTML = statsHTML;
    
    // Toggle stats visibility
    const toggleBtn = document.getElementById('toggle-team-stats-btn');
    const tableWrapper = document.getElementById('team-stats-table-wrapper');
    const arrow = document.getElementById('toggle-stats-arrow');
    if (toggleBtn && tableWrapper) {
      toggleBtn.addEventListener('click', () => {
        const isHidden = tableWrapper.style.display === 'none';
        tableWrapper.style.display = isHidden ? 'block' : 'none';
        arrow.textContent = isHidden ? '▲' : '▼';
        arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(0deg)';
      });
    }
  }
  
  const grid = document.getElementById('detail-teams-grid');
  grid.innerHTML = '';
  
  player.teamBreakdown.forEach(tb => {
    const item = document.createElement('div');
    
    const eliminated = isTeamEliminated(tb.name);
    const elimBadge = eliminated 
      ? '<span class="badge badge-red" style="font-size:9.5px; padding:2px 6px;">ตกรอบแล้ว</span>' 
      : '<span class="badge badge-green" style="font-size:9.5px; padding:2px 6px;">ยังอยู่ในเส้นทาง</span>';
      
    const elimToggleBtn = isAdmin
      ? `<button class="btn btn-secondary toggle-elim-btn" data-team="${tb.name.replace(/'/g, "\\'")}" style="padding: 2px 8px; font-size: 10px; height: auto; margin-left: 8px; background-color: rgba(255,255,255,0.03);">
           ${eliminated ? '✔️ คืนสิทธิ์' : '❌ ตกรอบ'}
         </button>`
      : '';

    // Query matches played by this team
    const teamMatches = matches.filter(m => m.status === 'finished' && (m.home === tb.name || m.away === tb.name));
    let matchHistoryHTML = '';
    
    if (teamMatches.length > 0) {
      matchHistoryHTML = '<div style="margin-top: 8px; font-size: 11px; padding: 8px 12px; border-radius: 8px; background-color: rgba(0,0,0,0.18); display: flex; flex-direction: column; gap: 6px; border-left: 2px solid rgba(255,255,255,0.08);">';
      teamMatches.forEach(m => {
        let resultPoints = 0;
        let goals = 0;
        
        if (m.home === tb.name) {
          goals = m.homeScore;
          if (m.homeScore > m.awayScore) resultPoints = 3;
          else if (m.homeScore < m.awayScore) resultPoints = 1;
          else {
            if (m.isKnockout && m.penaltyWinner) {
              resultPoints = m.penaltyWinner === 'home' ? 3 : 1;
            } else {
              resultPoints = 2;
            }
          }
        } else {
          goals = m.awayScore;
          if (m.awayScore > m.homeScore) resultPoints = 3;
          else if (m.awayScore < m.homeScore) resultPoints = 1;
          else {
            if (m.isKnockout && m.penaltyWinner) {
              resultPoints = m.penaltyWinner === 'away' ? 3 : 1;
            } else {
              resultPoints = 2;
            }
          }
        }
        
        const matchPts = (resultPoints + goals) * tb.multiplier;
        const resText = resultPoints === 3 
          ? '<span style="color:var(--zone-green)">ชนะ</span>' 
          : (resultPoints === 2 ? '<span style="color:var(--zone-yellow)">เสมอ</span>' : '<span style="color:var(--zone-red-orange)">แพ้</span>');
        
        matchHistoryHTML += `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>แมตช์ที่ ${m.id}: ${m.home} ${m.homeScore} - ${m.awayScore} ${m.away} (${resText})</span>
            <span style="font-weight: 600; color: rgba(255,255,255,0.6)">+${matchPts.toFixed(1)} แต้ม</span>
          </div>
        `;
      });
      matchHistoryHTML += '</div>';
    } else {
      matchHistoryHTML = '<div style="margin-top: 6px; font-size: 11px; color: var(--text-muted); font-style: italic; padding-left: 12px;">ยังไม่มีการแข่งขัน</div>';
    }

    item.classList.add('player-team-item');
    item.style.cssText = `background-color: rgba(30, 41, 59, 0.3); padding: 14px; border-radius: 12px; border-left: 4px solid var(--zone-${tb.zone}); border-top: 1px solid rgba(255,255,255,0.02); display: flex; flex-direction: column; gap: 4px;`;
    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px;">
          <strong style="font-size: 14px;">${tb.name}</strong>
          <span style="font-size:10px; color:var(--text-secondary);">โซน: ${tb.zone.toUpperCase()} (x${tb.multiplier})</span>
          ${elimBadge}
          ${elimToggleBtn}
        </div>
        <div style="text-align: right;">
          <strong style="color:var(--primary); font-size: 15px;">${tb.points.toFixed(2)} แต้ม</strong>
        </div>
      </div>
      ${matchHistoryHTML}
    `;
    grid.appendChild(item);
  });
  
  // Set toggle handler listeners
  grid.querySelectorAll('.toggle-elim-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const team = btn.getAttribute('data-team');
      if (manualEliminatedTeams.has(team)) {
        manualEliminatedTeams.delete(team);
      } else {
        manualEliminatedTeams.add(team);
      }
      saveEliminatedTeams();
      recalculateAll();
      openPlayerDetails(name); // Refresh view
      renderDashboard();
      if (document.getElementById('leaderboard').classList.contains('active')) renderLeaderboard();
      if (document.getElementById('players').classList.contains('active')) renderPlayers();
    });
  });
  
  // Set delete handler
  const deleteBtn = document.getElementById('delete-player-btn');
  deleteBtn.onclick = () => {
    if (confirm(`คุณต้องการลบผู้เล่น "${player.name}" ใช่หรือไม่?`)) {
      players = players.filter(p => p.name !== name);
      localStorage.setItem('worldcup_players', JSON.stringify(players));
      document.getElementById('player-details-drawer-overlay').classList.remove('active');
      recalculateAll();
      renderDashboard();
      renderLeaderboard();
      renderPlayers();
    }
  };
  
  // Set edit handler
  const editBtn = document.getElementById('edit-player-selections-btn');
  editBtn.onclick = () => {
    document.getElementById('player-details-drawer-overlay').classList.remove('active');
    openPlayerForm(player);
  };
  
  if (isAdmin) {
    deleteBtn.style.display = 'block';
    editBtn.style.display = 'block';
  } else {
    deleteBtn.style.display = 'none';
    editBtn.style.display = 'none';
  }
  
  const overlay = document.getElementById('player-details-drawer-overlay');
  overlay.classList.add('active');
  } catch (err) {
    console.error('Error in openPlayerDetails:', err);
  }
}

// PLAYER ADD / EDIT FORM
function openPlayerForm(player = null) {
  const overlay = document.getElementById('player-form-drawer-overlay');
  const title = document.getElementById('form-title');
  const nameInput = document.getElementById('form-player-name');
  const guessInput = document.getElementById('form-player-guess');
  const idInput = document.getElementById('form-player-id');
  
  nameInput.value = player ? player.name : '';
  guessInput.value = player ? player.guess : '';
  idInput.value = player ? player.name : ''; // use name as ID for now
  title.textContent = player ? 'แก้ไขการเลือกทีมผู้เล่น' : 'เพิ่มผู้เล่นใหม่';
  
  nameInput.readOnly = false; // Always allow name editing for admins
  
  // Build Team Selector UI
  const selector = document.getElementById('form-team-selector');
  selector.innerHTML = '';
  
  const zones = [
    { key: 'blue', name: 'Blue Zone (สูงสุด 4 ทีม)', class: 'team-blue' },
    { key: 'green', name: 'Green Zone (สูงสุด 4 ทีม)', class: 'team-green' },
    { key: 'yellow', name: 'Yellow Zone (สูงสุด 4 ทีม)', class: 'team-yellow' },
    { key: 'light-orange', name: 'Light Orange Zone (สูงสุด 4 ทีม)', class: 'team-light-orange' },
    { key: 'red-orange', name: 'Red-Orange Zone (สูงสุด 4 ทีม)', class: 'team-red-orange' }
  ];
  
  const selectedTeamsSet = player ? new Set(player.teams) : new Set();
  
  zones.forEach(zone => {
    const zoneHeader = document.createElement('div');
    zoneHeader.style.cssText = 'font-weight: 700; font-size: 13px; margin: 16px 0 8px 0; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 4px;';
    zoneHeader.innerHTML = `<span class="team-badge ${zone.class}">${zone.name}</span>`;
    selector.appendChild(zoneHeader);
    
    const zoneGrid = document.createElement('div');
    zoneGrid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:10px;';
    
    const zoneTeams = TEAMS.filter(t => t.zone === zone.key);
    
    zoneTeams.forEach(t => {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex; align-items:center; gap:8px; background-color:rgba(15,23,42,0.2); padding:10px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;';
      
      const isChecked = selectedTeamsSet.has(t.name) ? 'checked' : '';
      label.innerHTML = `
        <input type="checkbox" class="form-team-checkbox" data-zone="${t.zone}" value="${t.name}" ${isChecked} style="cursor:pointer; width:16px; height:16px;">
        ${t.name}
      `;
      zoneGrid.appendChild(label);
    });
    
    selector.appendChild(zoneGrid);
  });
  
  // Set Form Change event listener to update selection count and validate
  setTimeout(() => {
    updateFormValidation();
  }, 100);
  
  overlay.classList.add('active');
}

function updateFormValidation() {
  const checkboxes = document.querySelectorAll('.form-team-checkbox');
  const counter = document.getElementById('form-selection-counter');
  const warning = document.getElementById('form-validation-warning');
  const saveBtn = document.getElementById('save-player-btn');
  
  let checkedCount = 0;
  const zoneCounts = { blue: 0, green: 0, yellow: 0, 'light-orange': 0, 'red-orange': 0 };
  
  checkboxes.forEach(cb => {
    if (cb.checked) {
      checkedCount++;
      const zone = cb.getAttribute('data-zone');
      zoneCounts[zone]++;
    }
  });
  
  counter.textContent = `${checkedCount} / 15 ทีม`;
  
  // Validations
  let errors = [];
  
  if (checkedCount !== 15) {
    errors.push(`ต้องเลือกทีมทั้งหมด 15 ทีม พอดี (ปัจจุบันเลือก ${checkedCount} ทีม)`);
  }
  
  // Max 4 per zone
  for (const zone in zoneCounts) {
    if (zoneCounts[zone] > 4) {
      errors.push(`เลือกทีมโซน ${zone.toUpperCase()} เกินกำหนดสูงสุด 4 ทีม (เลือกอยู่ ${zoneCounts[zone]} ทีม)`);
    }
  }
  
  // Min 1 per zone (must come from all 5 zones)
  for (const zone in zoneCounts) {
    if (zoneCounts[zone] === 0) {
      errors.push(`จำเป็นต้องมีอย่างน้อย 1 ทีมจากโซน ${zone.toUpperCase()}`);
    }
  }
  
  // Show / Hide Warnings
  if (errors.length > 0) {
    warning.style.display = 'block';
    warning.innerHTML = errors.map(e => `• ${e}`).join('<br>');
    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.5';
  } else {
    warning.style.display = 'none';
    saveBtn.disabled = false;
    saveBtn.style.opacity = '1';
  }
}

// MATCH ADD FORM (ADMIN)
function openMatchForm() {
  const overlay = document.getElementById('match-form-drawer-overlay');
  const homeSelect = document.getElementById('form-match-home');
  const awaySelect = document.getElementById('form-match-away');
  
  // Populate dropdowns with TEAMS
  homeSelect.innerHTML = '';
  awaySelect.innerHTML = '';
  
  // Sort teams alphabetically for convenience
  const sortedTeams = [...TEAMS].sort((a, b) => a.name.localeCompare(b.name, 'th'));
  sortedTeams.forEach(t => {
    const optHome = document.createElement('option');
    optHome.value = t.name;
    optHome.textContent = `${t.name} (x${t.multiplier})`;
    homeSelect.appendChild(optHome);
    
    const optAway = document.createElement('option');
    optAway.value = t.name;
    optAway.textContent = `${t.name} (x${t.multiplier})`;
    awaySelect.appendChild(optAway);
  });
  
  // Reset fields
  document.getElementById('form-match-id').value = '';
  document.getElementById('form-match-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('form-match-knockout').checked = false;
  document.getElementById('form-match-final').checked = false;
  
  overlay.classList.add('active');
}

function closeMatchForm() {
  document.getElementById('match-form-drawer-overlay').classList.remove('active');
}

function handleMatchFormSubmit() {
  const home = document.getElementById('form-match-home').value;
  const away = document.getElementById('form-match-away').value;
  const matchDate = document.getElementById('form-match-date').value;
  const isKnockout = document.getElementById('form-match-knockout').checked;
  const isFinal = document.getElementById('form-match-final').checked;
  
  if (home === away) {
    alert('ทีมเหย้าและทีมเยือนไม่สามารถเป็นทีมเดียวกันได้!');
    return;
  }
  
  // Calculate next ID
  let nextId = 1;
  if (isFinal) {
    nextId = 100;
  } else {
    const ids = matches.filter(m => m.id < 100).map(m => m.id);
    nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
  }
  
  // Verify ID is unique
  if (matches.some(m => m.id === nextId)) {
    const allIds = matches.filter(m => m.id < 100).map(m => m.id);
    nextId = allIds.length > 0 ? Math.max(...allIds) + 1 : 1;
  }
  
  const newMatch = {
    id: nextId,
    home: home,
    away: away,
    homeScore: null,
    awayScore: null,
    status: 'pending',
    isKnockout: isKnockout || isFinal,
    isFinal: isFinal,
    date: matchDate
  };
  
  matches.push(newMatch);
  localStorage.setItem('worldcup_matches', JSON.stringify(matches));
  
  closeMatchForm();
  alert('เพิ่มคู่ตารางการแข่งขันสำเร็จ!');
  
  recalculateAll();
  renderMatches();
  renderDashboard();
}

// SETUP EVENTS & DOM CONTENT LOADED
document.addEventListener('DOMContentLoaded', () => {
  initData();
  setupNavigation();
  
  // Initialize admin status
  initAdminState();
  
  // Toggle Admin Login / Logout
  const adminToggleBtn = document.getElementById('admin-login-toggle-btn');
  if (adminToggleBtn) {
    adminToggleBtn.addEventListener('click', () => {
      if (isAdmin) {
        // Logout
        if (confirm('คุณต้องการออกจากระบบแอดมินใช่หรือไม่?')) {
          isAdmin = false;
          sessionStorage.setItem('worldcup_isAdmin', 'false');
          updateAdminUI();
          recalculateAll();
          // rerender current active view
          if (document.getElementById('dashboard').classList.contains('active')) renderDashboard();
          if (document.getElementById('leaderboard').classList.contains('active')) renderLeaderboard();
          if (document.getElementById('matches').classList.contains('active')) renderMatches();
          if (document.getElementById('players').classList.contains('active')) renderPlayers();
          alert('ออกจากระบบแอดมินเรียบร้อย');
        }
      } else {
        // Show login modal
        document.getElementById('admin-password-input').value = '';
        document.getElementById('login-error-msg').style.display = 'none';
        document.getElementById('admin-login-overlay').classList.add('active');
      }
    });
  }
  
  // Close login modal
  const closeLoginBtn = document.getElementById('close-login-btn');
  if (closeLoginBtn) {
    closeLoginBtn.addEventListener('click', () => {
      document.getElementById('admin-login-overlay').classList.remove('active');
    });
  }
  
  // Handle admin login submission
  const loginForm = document.getElementById('admin-login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const password = document.getElementById('admin-password-input').value;
      const errorMsg = document.getElementById('login-error-msg');
      
      if (password === '123456') {
        isAdmin = true;
        sessionStorage.setItem('worldcup_isAdmin', 'true');
        updateAdminUI();
        errorMsg.style.display = 'none';
        document.getElementById('admin-login-overlay').classList.remove('active');
        
        recalculateAll();
        // rerender current active view
        if (document.getElementById('dashboard').classList.contains('active')) renderDashboard();
        if (document.getElementById('leaderboard').classList.contains('active')) renderLeaderboard();
        if (document.getElementById('matches').classList.contains('active')) renderMatches();
        if (document.getElementById('players').classList.contains('active')) renderPlayers();
        
        alert('เข้าสู่ระบบแอดมินสำเร็จ!');
      } else {
        errorMsg.style.display = 'block';
        document.getElementById('admin-password-input').value = '';
        document.getElementById('admin-password-input').focus();
      }
    });
  }
  
  // Search listeners
  document.getElementById('leaderboard-search').addEventListener('input', renderLeaderboard);
  document.getElementById('players-search').addEventListener('input', renderPlayers);
  
  // Populate leaderboard team filter dropdown (multi checkbox)
  const filterDropdownContainer = document.getElementById('team-filter-dropdown-container');
  const filterBtn = document.getElementById('team-filter-btn');
  const filterMenu = document.getElementById('team-filter-menu');
  const checkboxesContainer = document.getElementById('team-filter-checkboxes-container');
  
  if (filterBtn && filterMenu && checkboxesContainer) {
    // Group teams by zone
    const teamsByZone = {};
    TEAMS.forEach(t => {
      if (!teamsByZone[t.zone]) teamsByZone[t.zone] = [];
      teamsByZone[t.zone].push(t);
    });
    
    // Zone styling helper
    const zoneLabels = {
      blue: 'Blue Zone (x1.0 - x1.3)',
      green: 'Green Zone (x1.4 - x1.7)',
      yellow: 'Yellow Zone (x1.8 - x2.1)',
      'light-orange': 'Light Orange (x2.2 - x2.6)',
      'red-orange': 'Red-Orange (x2.7 - x3.0)'
    };
    
    let containerHTML = '';
    
    // Sort zones and build checkboxes inside columns
    Object.keys(zoneLabels).forEach(zoneKey => {
      const zoneTeams = teamsByZone[zoneKey] || [];
      if (zoneTeams.length === 0) return;
      
      containerHTML += `
        <div style="margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.02); padding-bottom: 8px;">
          <div style="font-size: 11px; font-weight: 700; color: var(--zone-${zoneKey}); text-transform: uppercase; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background-color: var(--zone-${zoneKey});"></span>
            ${zoneLabels[zoneKey]}
          </div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 12px;">
      `;
      
      // Sort teams in zone alphabetically
      const sortedZoneTeams = [...zoneTeams].sort((a, b) => a.name.localeCompare(b.name, 'th'));
      sortedZoneTeams.forEach(t => {
        containerHTML += `
          <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary); cursor: pointer; padding: 2px 0; user-select: none;">
            <input type="checkbox" class="team-filter-checkbox" value="${t.name}" style="width: 14px; height: 14px; accent-color: var(--primary); cursor: pointer;">
            <span style="text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">${t.name} (x${t.multiplier})</span>
          </label>
        `;
      });
      
      containerHTML += `
          </div>
        </div>
      `;
    });
    
    checkboxesContainer.innerHTML = containerHTML;
    
    // Toggle dropdown visibility
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = filterMenu.style.display === 'none';
      filterMenu.style.display = isHidden ? 'block' : 'none';
    });
    
    // Prevent dropdown click from closing itself
    filterMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // Close dropdown clicking outside
    document.addEventListener('click', () => {
      filterMenu.style.display = 'none';
    });
    
    // Listen to changes on checkboxes to trigger renderLeaderboard
    checkboxesContainer.addEventListener('change', (e) => {
      if (e.target && e.target.classList.contains('team-filter-checkbox')) {
        renderLeaderboard();
      }
    });
    
    // Reset selections button
    const clearBtn = document.getElementById('clear-team-filter-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const checkboxes = checkboxesContainer.querySelectorAll('.team-filter-checkbox');
        checkboxes.forEach(cb => cb.checked = false);
        renderLeaderboard();
      });
    }
  }
  
  // Chart highlight dropdown listener
  const chartHighlightSelect = document.getElementById('chart-highlight-select');
  if (chartHighlightSelect) {
    chartHighlightSelect.addEventListener('change', (e) => {
      highlightPlayerInChart(e.target.value);
    });
  }
  
  // Close Modals buttons
  document.getElementById('close-detail-btn').addEventListener('click', () => {
    document.getElementById('player-details-drawer-overlay').classList.remove('active');
  });
  
  document.getElementById('close-form-btn').addEventListener('click', () => {
    document.getElementById('player-form-drawer-overlay').classList.remove('active');
  });
  
  document.getElementById('open-add-player-btn').addEventListener('click', () => {
    openPlayerForm();
  });

  // Match Form DOM listeners
  const closeMatchFormBtn = document.getElementById('close-match-form-btn');
  if (closeMatchFormBtn) {
    closeMatchFormBtn.addEventListener('click', closeMatchForm);
  }
  const openAddMatchBtn = document.getElementById('open-add-match-btn');
  if (openAddMatchBtn) {
    openAddMatchBtn.addEventListener('click', openMatchForm);
  }
  const matchForm = document.getElementById('match-form');
  if (matchForm) {
    matchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleMatchFormSubmit();
    });
  }
  
  // Reset All Matches button
  const resetBtn = document.getElementById('reset-all-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('คุณต้องการรีเซ็ตผลการแข่งขันทั้งหมดกลับเป็นค่าเริ่มต้นใช่หรือไม่? (การแก้ไขสกอร์การแข่งทั้งหมดจะถูกล้าง)')) {
        localStorage.removeItem('worldcup_matches');
        initData();
        recalculateAll();
        if (document.getElementById('dashboard').classList.contains('active')) renderDashboard();
        if (document.getElementById('leaderboard').classList.contains('active')) renderLeaderboard();
        if (document.getElementById('matches').classList.contains('active')) renderMatches();
        if (document.getElementById('players').classList.contains('active')) renderPlayers();
        alert('รีเซ็ตผลการแข่งขันทั้งหมดเรียบร้อยแล้ว!');
      }
    });
  }
  
  // Handle team selections checkbox changes dynamically
  document.addEventListener('change', (e) => {
    if (e.target && e.target.classList.contains('form-team-checkbox')) {
      updateFormValidation();
    }
  });
  
  // Player form submission
  document.getElementById('player-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const id = document.getElementById('form-player-id').value;
    const name = document.getElementById('form-player-name').value.trim();
    const guess = parseInt(document.getElementById('form-player-guess').value);
    
    const checkboxes = document.querySelectorAll('.form-team-checkbox');
    const selectedTeams = [];
    checkboxes.forEach(cb => {
      if (cb.checked) {
        selectedTeams.push(cb.value);
      }
    });
    
    if (selectedTeams.length !== 15) {
      alert('กรุณาเลือกทีมให้ครบ 15 ทีม!');
      return;
    }
    
    if (id) {
      // Edit mode (find by name)
      if (id !== name && players.some(p => p.name === name)) {
        alert('ชื่อผู้เล่นใหม่นี้มีผู้ใช้งานอยู่แล้ว!');
        return;
      }
      const pIdx = players.findIndex(p => p.name === id);
      if (pIdx !== -1) {
        players[pIdx].name = name;
        players[pIdx].guess = guess;
        players[pIdx].teams = selectedTeams;
      }
    } else {
      // Add mode
      // Check duplicate name
      if (players.some(p => p.name === name)) {
        alert('ชื่อผู้เล่นนี้ถูกใช้งานแล้ว!');
        return;
      }
      players.push({
        name,
        teams: selectedTeams,
        guess
      });
    }
    
    localStorage.setItem('worldcup_players', JSON.stringify(players));
    document.getElementById('player-form-drawer-overlay').classList.remove('active');
    
    alert('บันทึกข้อมูลผู้เล่นเรียบร้อย!');
    recalculateAll();
    renderDashboard();
    renderLeaderboard();
    renderPlayers();
  });
  
  // Initial page renders
  renderDashboard();
});
