// Modified utils
function formatNumber(num) {
  return num.toFixed(2);
}
function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}
module.exports = { formatNumber, sum };
