// public/assets/js/script.js

// สำหรับการตรวจสอบว่า response เป็น JSON หรือไม่
// fetch('http://localhost:5000/check-email?email=test%40gmail.com')
//   .then(response => {
//     if (!response.ok) {
//       throw new Error('Network response was not ok');
//     }
//     return response.json();
//   })
//   .then(data => {
//     console.log(data); // ใช้ข้อมูลที่ได้
//   })
//   .catch(error => {
//     console.error('Error checking email:', error);
//   });

// // ตรวจสอบว่า 'data' ไม่เป็น undefined หรือ null ก่อนการใช้งาน
// const loadAmphures = (data) => {
//   if (Array.isArray(data)) {
//     const filteredData = data.filter(item => item.province === 'SomeProvince');
//     console.log(filteredData);
//   } else {
//     console.error('Data is not an array');
//   }
// };
